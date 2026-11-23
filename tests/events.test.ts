import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Event, EventDispatcher } from '../src/events/index.js';

class OrderPlaced {
  constructor(public orderId: number, public total: number) {}
}

class SendOrderEmailListener {
  public handled = false;
  public receivedOrderId = 0;

  handle(event: OrderPlaced) {
    this.handled = true;
    this.receivedOrderId = event.orderId;
    return 'email_sent';
  }
}

describe('BirFramework Event & Listener Tests', () => {
  beforeEach(() => {
    Event.forget();
    Event.restore();
  });

  afterEach(() => {
    Event.forget();
    Event.restore();
  });

  test('Event.listen and Event.dispatch with function listener', async () => {
    let called = false;
    let receivedPayload: any = null;

    Event.listen('user.registered', (payload) => {
      called = true;
      receivedPayload = payload;
      return 'registered_ok';
    });

    assert.strictEqual(Event.hasListeners('user.registered'), true);
    assert.strictEqual(Event.hasListeners('non.existent'), false);

    const results = await Event.dispatch('user.registered', { id: 101, email: 'user@bir.dev' });
    assert.strictEqual(called, true);
    assert.deepStrictEqual(receivedPayload, { id: 101, email: 'user@bir.dev' });
    assert.deepStrictEqual(results, ['registered_ok']);
  });

  test('Class-based event and listener class instance', async () => {
    const listener = new SendOrderEmailListener();
    Event.listen(OrderPlaced, listener);

    const event = new OrderPlaced(42, 199.99);
    const results = await Event.dispatch(event);

    assert.strictEqual(listener.handled, true);
    assert.strictEqual(listener.receivedOrderId, 42);
    assert.deepStrictEqual(results, ['email_sent']);
  });

  test('Class constructor listener automatically instantiated', async () => {
    Event.listen(OrderPlaced, SendOrderEmailListener);

    const event = new OrderPlaced(99, 450);
    const results = await Event.dispatch(event);

    assert.deepStrictEqual(results, ['email_sent']);
  });

  test('Wildcard event listeners match matching patterns', async () => {
    const received: string[] = [];

    Event.listen('order.*', (payload: any) => {
      received.push(payload.action);
    });

    await Event.dispatch('order.created', { action: 'created' });
    await Event.dispatch('order.cancelled', { action: 'cancelled' });
    await Event.dispatch('user.login', { action: 'login' });

    assert.deepStrictEqual(received, ['created', 'cancelled']);
  });

  test('Event.until stops at first non-null result', async () => {
    Event.listen('process.payment', () => {
      return null;
    });

    Event.listen('process.payment', (data: any) => {
      if (data.amount > 50) return { status: 'approved' };
      return undefined;
    });

    Event.listen('process.payment', () => {
      return { status: 'fallback_never_reached' };
    });

    const result = await Event.until('process.payment', { amount: 100 });
    assert.deepStrictEqual(result, { status: 'approved' });
  });

  test('Event.fake(), assertDispatched, and assertNotDispatched', async () => {
    Event.fake();

    let listenerInvoked = false;
    Event.listen('payment.received', () => {
      listenerInvoked = true;
    });

    await Event.dispatch('payment.received', { id: 777, amount: 500 });
    await Event.dispatch(new OrderPlaced(10, 80));

    // When faked, real listeners should NOT be invoked
    assert.strictEqual(listenerInvoked, false);

    // Assert dispatched
    Event.assertDispatched('payment.received');
    Event.assertDispatched('payment.received', (event, payload) => payload.amount === 500);
    Event.assertDispatched(OrderPlaced, (event) => event.orderId === 10);

    // Assert not dispatched
    Event.assertNotDispatched('user.deleted');

    // Check assertion failure when event not dispatched
    assert.throws(() => {
      Event.assertDispatched('user.deleted');
    }, /Expected event "user.deleted" was not dispatched/);

    // Check assertion failure when assertNotDispatched fails
    assert.throws(() => {
      Event.assertNotDispatched('payment.received');
    }, /Unexpected event "payment.received" was dispatched/);

    // Restore
    Event.restore();
    await Event.dispatch('payment.received', { id: 888 });
    assert.strictEqual(listenerInvoked, true);
  });
});
