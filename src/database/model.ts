import { QueryBuilder } from './query.js';
import { dbConnection } from './connection.js';
import type { LengthAwarePaginator, PaginationOptions } from '../pagination/index.js';

export class Model {
  public static table: string = '';
  public static primaryKey: string = 'id';
  public static timestamps: boolean = true;

  public attributes: Record<string, any> = {};
  public exists: boolean = false;

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

  public static query<M extends typeof Model>(this: M): QueryBuilder<InstanceType<M>> {
    const tableName = this.getTableName();
    return new QueryBuilder(tableName, dbConnection);
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
    const rows = await this.query().get();
    return rows.map((r: any) => new this(r, true) as InstanceType<M>);
  }

  public static async find<M extends typeof Model>(this: M, id: any): Promise<InstanceType<M> | null> {
    const row = await this.query().where(this.primaryKey, '=', id).first();
    if (!row) return null;
    return new this(row, true) as InstanceType<M>;
  }

  public static async create<M extends typeof Model>(this: M, data: Record<string, any>): Promise<InstanceType<M>> {
    const attributes = { ...data };
    if (this.timestamps) {
      const now = new Date().toISOString();
      if (!attributes['created_at']) attributes['created_at'] = now;
      if (!attributes['updated_at']) attributes['updated_at'] = now;
    }

    const { lastInsertRowid } = await this.query().insert(attributes);
    attributes[this.primaryKey] = Number(lastInsertRowid);

    return new this(attributes, true) as InstanceType<M>;
  }

  public static async paginate<M extends typeof Model>(
    this: M,
    options: PaginationOptions = {}
  ): Promise<LengthAwarePaginator<InstanceType<M>>> {
    const paginated = await this.query().paginate(options);
    const models = paginated.data.map((r: any) => new this(r, true) as InstanceType<M>);
    return new (paginated.constructor as any)(models, paginated.meta.total, paginated.meta.perPage, paginated.meta.currentPage, paginated.path);
  }

  public async save(): Promise<this> {
    const ctor = this.constructor as typeof Model;
    const pk = ctor.primaryKey;
    const id = this.attributes[pk];

    if (ctor.timestamps) {
      this.attributes['updated_at'] = new Date().toISOString();
    }

    if (this.exists && id !== undefined) {
      const toUpdate = { ...this.attributes };
      delete toUpdate[pk];
      await ctor.query().where(pk, '=', id).update(toUpdate);
    } else {
      if (ctor.timestamps && !this.attributes['created_at']) {
        this.attributes['created_at'] = new Date().toISOString();
      }
      const { lastInsertRowid } = await ctor.query().insert(this.attributes);
      this.attributes[pk] = Number(lastInsertRowid);
      this.exists = true;
    }

    return this;
  }

  public async update(data: Record<string, any>): Promise<this> {
    Object.assign(this.attributes, data);
    return this.save();
  }

  public async delete(): Promise<boolean> {
    const ctor = this.constructor as typeof Model;
    const pk = ctor.primaryKey;
    const id = this.attributes[pk];

    if (!this.exists || id === undefined) return false;

    const count = await ctor.query().where(pk, '=', id).delete();
    this.exists = false;
    return count > 0;
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
