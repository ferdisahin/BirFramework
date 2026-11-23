import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { Model } from '../src/database/model.js';
import { Schema, type Blueprint } from '../src/database/schema.js';
import { Factory, Faker, faker } from '../src/database/factory.js';

class Customer extends Model {
  static override table = 'customers';
}

describe('BirFramework Model Factory & Faker Tests', () => {
  before(async () => {
    await Schema.create('customers', (table: Blueprint) => {
      table.id();
      table.string('name');
      table.string('email');
      table.string('tier').default('standard');
      table.timestamps();
    });
  });

  after(async () => {
    await Schema.dropIfExists('customers');
  });

  test('Faker generates valid random mock values', () => {
    const f = new Faker();
    assert.ok(typeof f.name() === 'string' && f.name().length > 3);
    assert.ok(f.email().includes('@'));
    assert.ok(f.number(10, 20) >= 10 && f.number(10, 20) <= 20);
    assert.ok(typeof f.boolean() === 'boolean');
    assert.ok(f.uuid().length === 32);
    assert.ok(f.sentence().endsWith('.'));
  });

  test('Factory.define raw() generates mock attributes with overrides', () => {
    const CustomerFactory = Factory.define(Customer, (fk) => ({
      name: fk.name(),
      email: fk.email(),
      tier: 'standard',
    }));

    const raw = CustomerFactory.raw({ tier: 'vip' });
    assert.ok(raw.name);
    assert.ok(raw.email);
    assert.strictEqual(raw.tier, 'vip');
  });

  test('Factory.define count() generates multiple items', () => {
    const CustomerFactory = Factory.define(Customer, (fk) => ({
      name: fk.name(),
      email: fk.email(),
    }));

    const list = CustomerFactory.count(3).raw();
    assert.strictEqual(list.length, 3);
    assert.ok(list[0].name !== list[1].name || list[1].name !== list[2].name);
  });

  test('Factory.define make() creates in-memory Model instances', () => {
    const CustomerFactory = Factory.define(Customer, (fk) => ({
      name: fk.name(),
      email: fk.email(),
    }));

    const instance = CustomerFactory.make({ name: 'Test Instance' });
    assert.ok(instance instanceof Customer);
    assert.strictEqual(instance.name, 'Test Instance');
  });

  test('Factory.define create() persists records to database', async () => {
    const CustomerFactory = Factory.define(Customer, (fk) => ({
      name: fk.name(),
      email: fk.email(),
      tier: 'premium',
    }));

    const created = await CustomerFactory.create({ name: 'Persisted Customer' });
    assert.ok(created.id);
    assert.strictEqual(created.name, 'Persisted Customer');
    assert.strictEqual(created.tier, 'premium');

    // Verify it exists in database table
    const found = await Customer.find(created.id);
    assert.ok(found);
    assert.strictEqual(found.name, 'Persisted Customer');
  });

  test('Factory.define count().create() persists multiple records', async () => {
    const CustomerFactory = Factory.define(Customer, (fk) => ({
      name: fk.name(),
      email: fk.email(),
      tier: 'bulk',
    }));

    const createdList = await CustomerFactory.count(4).create();
    assert.strictEqual(createdList.length, 4);

    const count = await Customer.where('tier', '=', 'bulk').get();
    assert.strictEqual(count.length, 4);
  });

  test('Factory state() merges state presets', () => {
    const CustomerFactory = Factory.define(Customer, (fk) => ({
      name: fk.name(),
      email: fk.email(),
      tier: 'standard',
    })).state({ tier: 'enterprise' });

    const customer = CustomerFactory.raw();
    assert.strictEqual(customer.tier, 'enterprise');
  });
});
