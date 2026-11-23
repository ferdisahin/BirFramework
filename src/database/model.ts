import { QueryBuilder } from './query.js';
import { dbConnection } from './connection.js';
import type { LengthAwarePaginator, PaginationOptions } from '../pagination/index.js';

export type ModelAttributes<T> = {
  [K in keyof T as T[K] extends Function ? never : K]?: T[K];
};

export class Model<T = any> {
  [key: string]: any;

  public static table: string = '';
  public static primaryKey: string = 'id';
  public static timestamps: boolean = true;
  public static softDeletes: boolean = false;
  public static fillable: string[] = [];
  public static guarded: string[] = ['id'];

  private static _hooksMap = new Map<string, Array<(m: any) => Promise<void> | void>>();

  public attributes: Record<string, any> = {};
  public exists: boolean = false;

  public static filterFillable(attributes: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = Object.create(null);
    const fillableList = (this as any).fillable as string[] || [];
    const guardedList = (this as any).guarded as string[] || [];

    for (const [key, value] of Object.entries(attributes)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      if (fillableList.length > 0) {
        if (fillableList.includes(key)) {
          result[key] = value;
        }
      } else if (guardedList.length > 0) {
        if (!guardedList.includes(key) && !guardedList.includes('*')) {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  private static getHookKey(event: string): string {
    return `${this.name || 'Model'}:${event}`;
  }

  public static creating<M extends typeof Model>(this: M, cb: (model: InstanceType<M>) => Promise<void> | void): void {
    this.addHook('creating', cb);
  }

  public static created<M extends typeof Model>(this: M, cb: (model: InstanceType<M>) => Promise<void> | void): void {
    this.addHook('created', cb);
  }

  public static saving<M extends typeof Model>(this: M, cb: (model: InstanceType<M>) => Promise<void> | void): void {
    this.addHook('saving', cb);
  }

  public static saved<M extends typeof Model>(this: M, cb: (model: InstanceType<M>) => Promise<void> | void): void {
    this.addHook('saved', cb);
  }

  public static deleting<M extends typeof Model>(this: M, cb: (model: InstanceType<M>) => Promise<void> | void): void {
    this.addHook('deleting', cb);
  }

  public static deleted<M extends typeof Model>(this: M, cb: (model: InstanceType<M>) => Promise<void> | void): void {
    this.addHook('deleted', cb);
  }

  private static addHook(event: string, cb: (model: any) => Promise<void> | void): void {
    const key = this.getHookKey(event);
    if (!this._hooksMap.has(key)) {
      this._hooksMap.set(key, []);
    }
    this._hooksMap.get(key)!.push(cb);
  }

  public static async runHooks(event: string, model: any): Promise<void> {
    const key = this.getHookKey(event);
    const callbacks = this._hooksMap.get(key) || [];
    for (const cb of callbacks) {
      await cb(model);
    }
  }

  constructor(attributes: Record<string, any> = {}, exists: boolean = false) {
    this.attributes = { ...attributes };
    this.exists = exists;

    // Return a Proxy so properties like user.name or user.email access attributes directly
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') {
          if (prop in target) {
            return (target as any)[prop];
          }
          if (prop in target.attributes) {
            return target.attributes[prop];
          }
        }
        return Reflect.get(target, prop, receiver);
      },
      set(target, prop, value, receiver) {
        if (typeof prop === 'string') {
          if (prop in target) {
            (target as any)[prop] = value;
            return true;
          }
          target.attributes[prop] = value;
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      },
    });
  }

  public static getTableName(): string {
    if (this.table) return this.table;
    // Auto-pluralize class name: User -> users, Post -> posts
    const name = this.name.toLowerCase();
    return name.endsWith('s') ? name : `${name}s`;
  }

  public static rawQuery<M extends typeof Model>(this: M): QueryBuilder<InstanceType<M>> {
    const tableName = this.getTableName();
    return new QueryBuilder(tableName, dbConnection, this as any);
  }

  public static query<M extends typeof Model>(this: M): QueryBuilder<InstanceType<M>> {
    const q = this.rawQuery();
    if (this.softDeletes) {
      q.whereNull('deleted_at');
    }
    return q;
  }

  public static withTrashed<M extends typeof Model>(this: M): QueryBuilder<InstanceType<M>> {
    return this.rawQuery();
  }

  public static onlyTrashed<M extends typeof Model>(this: M): QueryBuilder<InstanceType<M>> {
    return this.rawQuery().whereNotNull('deleted_at');
  }

  public static where<M extends typeof Model>(
    this: M,
    column: string,
    operatorOrValue: any,
    value?: any
  ): QueryBuilder<InstanceType<M>> {
    const q = this.query();
    return q.where(column, operatorOrValue, value);
  }

  public static orderBy<M extends typeof Model>(
    this: M,
    column: string,
    direction: 'asc' | 'desc' = 'asc'
  ): QueryBuilder<InstanceType<M>> {
    return this.query().orderBy(column, direction);
  }

  public static async all<M extends typeof Model>(this: M): Promise<InstanceType<M>[]> {
    return this.query().get();
  }

  public static async first<M extends typeof Model>(this: M): Promise<InstanceType<M> | null> {
    return this.query().first();
  }

  public static async firstWhere<M extends typeof Model>(
    this: M,
    column: string,
    operatorOrValue: any,
    value?: any
  ): Promise<InstanceType<M> | null> {
    return this.where(column, operatorOrValue, value).first();
  }

  public static async count<M extends typeof Model>(this: M): Promise<number> {
    return this.query().count();
  }

  public static async find<M extends typeof Model>(this: M, id: any): Promise<InstanceType<M> | null> {
    return this.query().where(this.primaryKey, '=', id).first();
  }

  public static async create<M extends typeof Model>(this: M, data: Record<string, any>): Promise<InstanceType<M>> {
    const safeData = this.filterFillable(data);
    const instance = new this(safeData) as InstanceType<M>;
    await instance.save();
    return instance;
  }

  public fill(data: Record<string, any>): this {
    const ctor = this.constructor as typeof Model;
    const safeData = ctor.filterFillable(data);
    Object.assign(this.attributes, safeData);
    return this;
  }

  public static async paginate<M extends typeof Model>(
    this: M,
    options: PaginationOptions = {}
  ): Promise<LengthAwarePaginator<InstanceType<M>>> {
    return this.query().paginate(options);
  }

  public async save(): Promise<this> {
    const ctor = this.constructor as typeof Model;
    const pk = ctor.primaryKey;
    const id = this.attributes[pk];
    const isNew = !this.exists;

    // Trigger beforeSave & beforeCreate hooks
    if (typeof (this as any).beforeSave === 'function') {
      await (this as any).beforeSave();
    }
    await ctor.runHooks('saving', this);

    if (isNew) {
      if (typeof (this as any).beforeCreate === 'function') {
        await (this as any).beforeCreate();
      }
      await ctor.runHooks('creating', this);
    }

    if (ctor.timestamps) {
      this.attributes['updated_at'] = new Date().toISOString();
    }

    if (this.exists && id !== undefined) {
      const toUpdate = { ...this.attributes };
      delete toUpdate[pk];
      await ctor.rawQuery().where(pk, '=', id).update(toUpdate);
    } else {
      if (ctor.timestamps && !this.attributes['created_at']) {
        this.attributes['created_at'] = new Date().toISOString();
      }
      const { lastInsertRowid } = await ctor.rawQuery().insert(this.attributes);
      this.attributes[pk] = Number(lastInsertRowid);
      this.exists = true;
    }

    // Trigger afterCreate & afterSave hooks
    if (isNew) {
      if (typeof (this as any).afterCreate === 'function') {
        await (this as any).afterCreate();
      }
      await ctor.runHooks('created', this);
    }

    if (typeof (this as any).afterSave === 'function') {
      await (this as any).afterSave();
    }
    await ctor.runHooks('saved', this);

    return this;
  }

  public async update(data: Record<string, any>): Promise<this> {
    Object.assign(this.attributes, data);
    return this.save();
  }

  public trashed(): boolean {
    return !!this.attributes['deleted_at'];
  }

  public async restore(): Promise<this> {
    if (!this.exists) return this;
    this.attributes['deleted_at'] = null;
    return this.save();
  }

  public async forceDelete(): Promise<boolean> {
    const ctor = this.constructor as typeof Model;
    const pk = ctor.primaryKey;
    const id = this.attributes[pk];

    if (!this.exists || id === undefined) return false;

    if (typeof (this as any).beforeDelete === 'function') {
      await (this as any).beforeDelete();
    }
    await ctor.runHooks('deleting', this);

    const count = await ctor.rawQuery().where(pk, '=', id).delete();
    this.exists = false;

    if (typeof (this as any).afterDelete === 'function') {
      await (this as any).afterDelete();
    }
    await ctor.runHooks('deleted', this);

    return count > 0;
  }

  public async delete(): Promise<boolean> {
    const ctor = this.constructor as typeof Model;
    const pk = ctor.primaryKey;
    const id = this.attributes[pk];

    if (!this.exists || id === undefined) return false;

    if (typeof (this as any).beforeDelete === 'function') {
      await (this as any).beforeDelete();
    }
    await ctor.runHooks('deleting', this);

    if (ctor.softDeletes) {
      this.attributes['deleted_at'] = new Date().toISOString();
      await ctor.rawQuery().where(pk, '=', id).update({ deleted_at: this.attributes['deleted_at'] });
    } else {
      const count = await ctor.rawQuery().where(pk, '=', id).delete();
      this.exists = false;
      if (count === 0) return false;
    }

    if (typeof (this as any).afterDelete === 'function') {
      await (this as any).afterDelete();
    }
    await ctor.runHooks('deleted', this);

    return true;
  }

  /**
   * Define a one-to-many relationship
   * e.g. user.hasMany(Post)
   */
  public hasMany<M extends typeof Model>(
    relatedModel: M,
    foreignKey?: string,
    localKey?: string
  ): QueryBuilder<InstanceType<M>> {
    const fKey = foreignKey || `${this.constructor.name.toLowerCase()}_id`;
    const lKey = localKey || (this.constructor as typeof Model).primaryKey;
    const val = this.attributes[lKey];
    return relatedModel.where(fKey, '=', val);
  }

  /**
   * Define an inverse relationship
   * e.g. post.belongsTo(User)
   */
  public async belongsTo<M extends typeof Model>(
    relatedModel: M,
    foreignKey?: string,
    ownerKey?: string
  ): Promise<InstanceType<M> | null> {
    const fKey = foreignKey || `${relatedModel.name.toLowerCase()}_id`;
    const val = this.attributes[fKey];
    if (val === undefined || val === null) return null;
    return relatedModel.find(val);
  }

  public toJSON(): Record<string, any> {
    return { ...this.attributes };
  }
}
