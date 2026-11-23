export type EventClass<T = any> = new (...args: any[]) => T;
export type ListenerFn<T = any> = (payload: T) => Promise<any> | any;

export interface ListenerObject<T = any> {
  handle(payload: T): Promise<any> | any;
}

export type ListenerType<T = any> =
  | ListenerFn<T>
  | (new () => ListenerObject<T>)
  | ListenerObject<T>;

export class EventDispatcher {
  private listeners = new Map<string, ListenerType[]>();
  private wildcardListeners: Array<{ pattern: RegExp; listener: ListenerType }> = [];
  private isFaked: boolean = false;
  private dispatchedEvents: Array<{ event: any; payload?: any }> = [];

  private resolveKey(event: any): string {
    if (typeof event === 'string') {
      return event;
    }
    if (typeof event === 'function' && event.name) {
      return event.name;
    }
    if (typeof event === 'object' && event !== null && event.constructor?.name) {
      return event.constructor.name;
    }
    return String(event);
  }

  /**
   * Register an event listener.
   */
  public listen<T = any>(event: string | EventClass<T>, listener: ListenerType<T>): this {
    if (typeof event === 'string' && event.includes('*')) {
      const regex = new RegExp('^' + event.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      this.wildcardListeners.push({ pattern: regex, listener: listener as any });
      return this;
    }

    const key = this.resolveKey(event);
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)!.push(listener as any);
    return this;
  }

  /**
   * Determine if a given event has listeners registered.
   */
  public hasListeners(event: any): boolean {
    const key = this.resolveKey(event);
    const regular = this.listeners.get(key);
    if (regular && regular.length > 0) return true;

    return this.wildcardListeners.some(({ pattern }) => pattern.test(key));
  }

  /**
   * Dispatch an event and call all registered listeners.
   */
  public async dispatch<T = any>(event: T | string, payload?: any): Promise<any[]> {
    const key = this.resolveKey(event);
    const eventData = payload !== undefined ? payload : event;

    if (this.isFaked) {
      this.dispatchedEvents.push({ event, payload: eventData });
      return [];
    }

    const matchingListeners: ListenerType[] = [...(this.listeners.get(key) || [])];

    for (const { pattern, listener } of this.wildcardListeners) {
      if (pattern.test(key)) {
        matchingListeners.push(listener);
      }
    }

    const results: any[] = [];
    for (const l of matchingListeners) {
      let res: any;
      if (typeof l === 'function') {
        // Function listener or class constructor
        if (l.prototype && typeof l.prototype.handle === 'function') {
          const instance = new (l as new () => ListenerObject<any>)();
          res = await instance.handle(eventData);
        } else {
          res = await (l as ListenerFn<any>)(eventData);
        }
      } else if (typeof l === 'object' && l !== null && typeof l.handle === 'function') {
        res = await l.handle(eventData);
      }
      results.push(res);
    }

    return results;
  }

  /**
   * Dispatch an event until the first listener returns a non-null/undefined result.
   */
  public async until<T = any>(event: T | string, payload?: any): Promise<any> {
    const key = this.resolveKey(event);
    const eventData = payload !== undefined ? payload : event;

    if (this.isFaked) {
      this.dispatchedEvents.push({ event, payload: eventData });
      return null;
    }

    const matchingListeners: ListenerType[] = [...(this.listeners.get(key) || [])];
    for (const l of matchingListeners) {
      let res: any;
      if (typeof l === 'function') {
        if (l.prototype && typeof l.prototype.handle === 'function') {
          const instance = new (l as new () => ListenerObject<any>)();
          res = await instance.handle(eventData);
        } else {
          res = await (l as ListenerFn<any>)(eventData);
        }
      } else if (typeof l === 'object' && l !== null && typeof l.handle === 'function') {
        res = await l.handle(eventData);
      }

      if (res !== undefined && res !== null) {
        return res;
      }
    }

    return null;
  }

  /**
   * Remove all listeners for a given event, or all listeners if no event provided.
   */
  public forget(event?: any): void {
    if (event) {
      const key = this.resolveKey(event);
      this.listeners.delete(key);
    } else {
      this.listeners.clear();
      this.wildcardListeners = [];
    }
  }

  // --- Testing & Mocking Helpers (Laravel Event::fake()) ---

  /**
   * Mock event dispatching for unit testing.
   */
  public fake(): this {
    this.isFaked = true;
    this.dispatchedEvents = [];
    return this;
  }

  /**
   * Restore real event dispatching.
   */
  public restore(): this {
    this.isFaked = false;
    this.dispatchedEvents = [];
    return this;
  }

  /**
   * Assert that an event was dispatched.
   */
  public assertDispatched(event: any, callback?: (event: any, payload?: any) => boolean): void {
    const key = this.resolveKey(event);
    const matched = this.dispatchedEvents.filter((item) => this.resolveKey(item.event) === key);

    if (matched.length === 0) {
      throw new Error(`[Event Assertion Failed] Expected event "${key}" was not dispatched.`);
    }

    if (callback) {
      const found = matched.some((item) => callback(item.event, item.payload));
      if (!found) {
        throw new Error(`[Event Assertion Failed] Event "${key}" was dispatched, but failed callback assertion.`);
      }
    }
  }

  /**
   * Assert that an event was NOT dispatched.
   */
  public assertNotDispatched(event: any): void {
    const key = this.resolveKey(event);
    const matched = this.dispatchedEvents.filter((item) => this.resolveKey(item.event) === key);

    if (matched.length > 0) {
      throw new Error(`[Event Assertion Failed] Unexpected event "${key}" was dispatched ${matched.length} time(s).`);
    }
  }
}

// Global default singleton
export const eventDispatcher = new EventDispatcher();

// Static Facade
export class Event {
  public static listen<T = any>(event: string | EventClass<T>, listener: ListenerType<T>): EventDispatcher {
    return eventDispatcher.listen(event, listener);
  }

  public static async dispatch<T = any>(event: T | string, payload?: any): Promise<any[]> {
    return eventDispatcher.dispatch(event, payload);
  }

  public static async until<T = any>(event: T | string, payload?: any): Promise<any> {
    return eventDispatcher.until(event, payload);
  }

  public static hasListeners(event: any): boolean {
    return eventDispatcher.hasListeners(event);
  }

  public static forget(event?: any): void {
    eventDispatcher.forget(event);
  }

  public static fake(): EventDispatcher {
    return eventDispatcher.fake();
  }

  public static restore(): EventDispatcher {
    return eventDispatcher.restore();
  }

  public static assertDispatched(event: any, callback?: (event: any, payload?: any) => boolean): void {
    eventDispatcher.assertDispatched(event, callback);
  }

  public static assertNotDispatched(event: any): void {
    eventDispatcher.assertNotDispatched(event);
  }
}
