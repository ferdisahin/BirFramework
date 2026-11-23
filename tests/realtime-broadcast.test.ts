import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { Application } from '../src/core/application.js';
import { Broadcast, RedisStore } from '../src/index.js';
import type { Server } from 'node:http';

describe('BirFramework Redis & Real-Time Broadcast Tests', () => {
  test('RedisStore should serialize and handle cache methods via mock or client', async () => {
    const memoryMock = new Map<string, string>();
    const mockClient = {
      async get(key: string) { return memoryMock.get(key) || null; },
      async set(key: string, val: string) { memoryMock.set(key, val); },
      async del(...keys: string[]) {
        let count = 0;
        for (const k of keys) {
          if (memoryMock.delete(k)) count++;
        }
        return count;
      },
      async exists(key: string) { return memoryMock.has(key) ? 1 : 0; },
      async keys(pattern: string) { return Array.from(memoryMock.keys()); },
      async incrby(key: string, amt: number) {
        const cur = Number(memoryMock.get(key) || 0) + amt;
        memoryMock.set(key, String(cur));
        return cur;
      },
      async decrby(key: string, amt: number) {
        const cur = Number(memoryMock.get(key) || 0) - amt;
        memoryMock.set(key, String(cur));
        return cur;
      }
    };

    const redisStore = new RedisStore();
    redisStore.setMockClient(mockClient);

    await redisStore.put('user:10', { name: 'Ali' });
    const user = await redisStore.get<{ name: string }>('user:10');
    assert.strictEqual(user?.name, 'Ali');

    assert.strictEqual(await redisStore.has('user:10'), true);
    await redisStore.forget('user:10');
    assert.strictEqual(await redisStore.has('user:10'), false);
  });

  test('Broadcast.to(channel).emit(event, data) should dispatch to subscribed WebSocket clients', () => {
    let sentPayload: any = null;
    const mockSocket: any = {
      destroyed: false,
      write(frame: Buffer) {
        sentPayload = frame;
      },
      end() { this.destroyed = true; },
      on() {}
    };

    const mockWsClient: any = {
      id: 'test-client',
      socket: mockSocket,
      channels: new Set(['orders']),
      send(data: any) {
        sentPayload = data;
      }
    };

    Broadcast.server.join(mockWsClient, 'orders');
    Broadcast.to('orders').emit('OrderCreated', { orderId: 456 });

    assert.ok(sentPayload);
    assert.strictEqual(sentPayload.channel, 'orders');
    assert.strictEqual(sentPayload.event, 'OrderCreated');
    assert.strictEqual(sentPayload.data.orderId, 456);
  });
});
