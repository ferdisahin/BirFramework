import { randomBytes } from 'node:crypto';
import type { Model } from './model.js';

const FIRST_NAMES = ['Alex', 'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Lucas', 'Mia'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Taylor', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Thomas', 'Moore'];
const WORDS = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'curabitur', 'velit', 'neque', 'euismod'];

export class Faker {
  public pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)]!;
  }

  public name(): string {
    return `${this.pick(FIRST_NAMES)} ${this.pick(LAST_NAMES)}`;
  }

  public email(domain: string = 'example.com'): string {
    const user = this.name().toLowerCase().replace(/\s+/g, '.') + Math.floor(Math.random() * 1000);
    return `${user}@${domain}`;
  }

  public number(min: number = 1, max: number = 1000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  public boolean(): boolean {
    return Math.random() >= 0.5;
  }

  public uuid(): string {
    return randomBytes(16).toString('hex');
  }

  public word(): string {
    return this.pick(WORDS);
  }

  public sentence(wordsCount: number = 6): string {
    const list: string[] = [];
    for (let i = 0; i < wordsCount; i++) {
      list.push(this.word());
    }
    const str = list.join(' ');
    return str.charAt(0).toUpperCase() + str.slice(1) + '.';
  }

  public text(length: number = 100): string {
    let result = this.sentence();
    while (result.length < length) {
      result += ' ' + this.sentence();
    }
    return result.slice(0, length);
  }

  public date(pastDays: number = 30): Date {
    const now = Date.now();
    const past = now - Math.floor(Math.random() * pastDays * 86400 * 1000);
    return new Date(past);
  }
}

export const faker = new Faker();

export type FactoryDefinition<T = any> = (f: Faker) => Record<string, any>;

export class FactoryBuilder<M extends typeof Model = any> {
  private modelClass: M;
  private definition: FactoryDefinition;
  private instancesCount: number = 1;
  private stateOverrides: Record<string, any> = {};

  constructor(modelClass: M, definition: FactoryDefinition) {
    this.modelClass = modelClass;
    this.definition = definition;
  }

  /**
   * Set how many model instances should be generated.
   */
  public count(amount: number): this {
    const clone = new FactoryBuilder(this.modelClass, this.definition);
    clone.instancesCount = Math.max(1, amount);
    clone.stateOverrides = { ...this.stateOverrides };
    return clone as this;
  }

  /**
   * Apply state overrides to the factory definition.
   */
  public state(overrides: Record<string, any>): this {
    const clone = new FactoryBuilder(this.modelClass, this.definition);
    clone.instancesCount = this.instancesCount;
    clone.stateOverrides = { ...this.stateOverrides, ...overrides };
    return clone as this;
  }

  /**
   * Generate attribute record(s) without saving to database.
   */
  public raw(overrides: Record<string, any> = {}): any {
    const generateOne = () => ({
      ...this.definition(faker),
      ...this.stateOverrides,
      ...overrides,
    });

    if (this.instancesCount > 1) {
      const list: any[] = [];
      for (let i = 0; i < this.instancesCount; i++) {
        list.push(generateOne());
      }
      return list;
    }

    return generateOne();
  }

  /**
   * Create in-memory Model instance(s) without saving to database.
   */
  public make(overrides: Record<string, any> = {}): any {
    const raw = this.raw(overrides);

    if (Array.isArray(raw)) {
      return raw.map((attr) => new (this.modelClass as any)(attr));
    }

    return new (this.modelClass as any)(raw);
  }

  /**
   * Persist model instance(s) to the database.
   */
  public async create(overrides: Record<string, any> = {}): Promise<any> {
    const raw = this.raw(overrides);

    if (Array.isArray(raw)) {
      const createdList: any[] = [];
      for (const attr of raw) {
        const item = await (this.modelClass as any).create(attr);
        createdList.push(item);
      }
      return createdList;
    }

    return await (this.modelClass as any).create(raw);
  }
}

export class Factory {
  /**
   * Define a new model factory blueprint.
   */
  public static define<M extends typeof Model = any>(
    modelClass: M,
    definition: FactoryDefinition
  ): FactoryBuilder<M> {
    return new FactoryBuilder(modelClass, definition);
  }
}
