import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import crypto from 'node:crypto';

export interface BroadcastChannel {
  name: string;
  subscribers: Set<WebSocketClient>;
}

export type ChannelAuthorizer = (
  client: WebSocketClient,
  params?: Record<string, string>,
  authData?: any
) => boolean | Promise<boolean>;

export class WebSocketClient {
  public id: string;
  public socket: Duplex;
  public channels: Set<string> = new Set();
  public data: Record<string, any> = {};
  public user?: any;

  constructor(socket: Duplex) {
    this.id = crypto.randomUUID();
    this.socket = socket;
  }

  public send(payload: any): void {
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const frame = WebSocketServer.createFrame(json);
    if (!this.socket.destroyed) {
      this.socket.write(frame);
    }
  }

  public close(): void {
    if (!this.socket.destroyed) {
      this.socket.end();
    }
  }
}

export class WebSocketServer {
  private clients: Map<string, WebSocketClient> = new Map();
  private channels: Map<string, Set<WebSocketClient>> = new Map();
  private authorizers: Map<string | RegExp, ChannelAuthorizer> = new Map();

  public handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const key = req.headers['sec-websocket-key'];
    if (!key || req.headers['upgrade']?.toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }

    // Standard WebSocket handshake SHA-1 GUID
    const acceptKey = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n',
    ];

    socket.write(responseHeaders.join('\r\n'));

    const client = new WebSocketClient(socket);
    this.clients.set(client.id, client);

    socket.on('data', (chunk: Buffer) => {
      this.handleFrame(client, chunk);
    });

    socket.on('close', () => {
      this.removeClient(client);
    });

    socket.on('error', () => {
      this.removeClient(client);
    });

    // Send connection welcome
    client.send({ type: 'connection_established', socket_id: client.id });
  }

  public channel(channelPattern: string, authorizer: ChannelAuthorizer): void {
    if (channelPattern.includes('*') || channelPattern.includes('{')) {
      const regexStr = '^' + channelPattern
        .replace(/\./g, '\\.')
        .replace(/\{(\w+)\}/g, '(?<$1>[^.]+)')
        .replace(/\*/g, '.*') + '$';
      this.authorizers.set(new RegExp(regexStr), authorizer);
    } else {
      this.authorizers.set(channelPattern, authorizer);
    }
  }

  public async canSubscribe(client: WebSocketClient, channelName: string, authData?: any): Promise<boolean> {
    const isPrivate = channelName.startsWith('private-') || channelName.startsWith('presence-');

    for (const [pattern, authorizer] of this.authorizers.entries()) {
      if (typeof pattern === 'string' && pattern === channelName) {
        try {
          return await authorizer(client, {}, authData);
        } catch {
          return false;
        }
      } else if (pattern instanceof RegExp) {
        const match = pattern.exec(channelName);
        if (match) {
          try {
            return await authorizer(client, match.groups || {}, authData);
          } catch {
            return false;
          }
        }
      }
    }

    // If private or presence channel has no authorizer, deny access by default
    if (isPrivate) {
      return false;
    }

    // Public channels without private-/presence- prefix are open
    return true;
  }

  private handleFrame(client: WebSocketClient, buffer: Buffer): void {
    if (buffer.length < 2) return;

    const firstByte = buffer[0]!;
    const secondByte = buffer[1]!;
    const opcode = firstByte & 0x0f;

    // Opcode 8 = Close frame
    if (opcode === 0x08) {
      client.close();
      return;
    }

    // Opcode 9 = Ping frame -> respond Pong (10)
    if (opcode === 0x09) {
      const pongFrame = Buffer.from([0x8a, 0x00]);
      client.socket.write(pongFrame);
      return;
    }

    // Opcode 1 = Text frame
    if (opcode === 0x01) {
      const isMasked = (secondByte & 0x80) === 0x80;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        payloadLength = buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLength === 127) {
        payloadLength = Number(buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      let payloadData: Buffer;
      if (isMasked) {
        const maskingKey = buffer.subarray(offset, offset + 4);
        offset += 4;
        payloadData = buffer.subarray(offset, offset + payloadLength);
        const unmasked = Buffer.alloc(payloadData.length);
        for (let i = 0; i < payloadData.length; i++) {
          unmasked[i] = (payloadData[i] ?? 0) ^ (maskingKey[i % 4] ?? 0);
        }
        payloadData = unmasked;
      } else {
        payloadData = buffer.subarray(offset, offset + payloadLength);
      }

      try {
        const text = payloadData.toString('utf-8');
        const msg = JSON.parse(text);
        this.handleMessage(client, msg);
      } catch {
        // invalid JSON or binary
      }
    }
  }

  private async handleMessage(client: WebSocketClient, msg: any): Promise<void> {
    if (msg.event === 'subscribe' && msg.channel) {
      const allowed = await this.canSubscribe(client, msg.channel, msg.auth);
      if (!allowed) {
        client.send({
          event: 'subscription_error',
          channel: msg.channel,
          error: 'Unauthorized channel subscription',
        });
        return;
      }
      this.join(client, msg.channel);
      client.send({ event: 'subscribed', channel: msg.channel });
    } else if (msg.event === 'unsubscribe' && msg.channel) {
      this.leave(client, msg.channel);
      client.send({ event: 'unsubscribed', channel: msg.channel });
    }
  }

  public join(client: WebSocketClient, channelName: string): void {
    if (!this.channels.has(channelName)) {
      this.channels.set(channelName, new Set());
    }
    this.channels.get(channelName)!.add(client);
    client.channels.add(channelName);
  }

  public leave(client: WebSocketClient, channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.delete(client);
      if (channel.size === 0) {
        this.channels.delete(channelName);
      }
    }
    client.channels.delete(channelName);
  }

  private removeClient(client: WebSocketClient): void {
    this.clients.delete(client.id);
    for (const channelName of client.channels) {
      this.leave(client, channelName);
    }
  }

  public broadcast(channelName: string, event: string, data: any): void {
    const channel = this.channels.get(channelName);
    if (!channel) return;

    const payload = {
      channel: channelName,
      event,
      data,
    };

    for (const client of channel) {
      client.send(payload);
    }
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  public static createFrame(message: string): Buffer {
    const payload = Buffer.from(message, 'utf-8');
    const length = payload.length;

    let header: Buffer;
    if (length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + text frame
      header[1] = length;
    } else if (length <= 65535) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }

    return Buffer.concat([header, payload]);
  }
}

// Global Singleton Broadcast Manager
export class BroadcastManager {
  private wsServer: WebSocketServer = new WebSocketServer();

  public get server(): WebSocketServer {
    return this.wsServer;
  }

  /**
   * Broadcast an event and payload to a given channel
   * Broadcast.to('orders').emit('OrderCreated', { orderId: 101 })
   */
  public to(channel: string) {
    return {
      emit: (event: string, data: any = {}) => {
        this.wsServer.broadcast(channel, event, data);
      },
    };
  }

  /**
   * Register a channel authorization callback or get a channel emitter
   * Broadcast.channel('private-orders.{id}', (client, params) => client.user?.id === params?.id)
   */
  public channel(pattern: string, authorizer?: ChannelAuthorizer) {
    if (authorizer) {
      this.wsServer.channel(pattern, authorizer);
      return;
    }
    return this.to(pattern);
  }
}

export const Broadcast = new BroadcastManager();
