import type { Model } from './model.js';
import type { QueryBuilder } from './query.js';

export abstract class Relation<T = any> {
  public abstract readonly type: 'hasMany' | 'belongsTo' | 'hasOne';
  public parent: Model;
  public relatedModel: typeof Model;
  public foreignKey: string;
  public localKey: string;

  constructor(parent: Model, relatedModel: typeof Model, foreignKey: string, localKey: string) {
    this.parent = parent;
    this.relatedModel = relatedModel;
    this.foreignKey = foreignKey;
    this.localKey = localKey;
  }

  public abstract getQuery(): QueryBuilder<T>;

  public where(column: string, operatorOrValue: any, value?: any): QueryBuilder<T> {
    return this.getQuery().where(column, operatorOrValue, value);
  }

  public orderBy(column: string, direction: 'asc' | 'desc' | 'ASC' | 'DESC' = 'ASC'): QueryBuilder<T> {
    return this.getQuery().orderBy(column, direction);
  }

  public async get(): Promise<T[]> {
    return this.getQuery().get();
  }

  public async first(): Promise<T | null> {
    return this.getQuery().first();
  }

  public then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.resolve().then(onfulfilled, onrejected);
  }

  protected abstract resolve(): Promise<any>;
}

export class HasMany<T = any> extends Relation<T> {
  public readonly type = 'hasMany' as const;

  public getQuery(): QueryBuilder<T> {
    const val = this.parent.attributes[this.localKey];
    return (this.relatedModel as any).where(this.foreignKey, '=', val);
  }

  protected resolve(): Promise<T[]> {
    return this.get();
  }
}

export class HasOne<T = any> extends Relation<T> {
  public readonly type = 'hasOne' as const;

  public getQuery(): QueryBuilder<T> {
    const val = this.parent.attributes[this.localKey];
    return (this.relatedModel as any).where(this.foreignKey, '=', val);
  }

  protected resolve(): Promise<T | null> {
    return this.first();
  }
}

export class BelongsTo<T = any> extends Relation<T> {
  public readonly type = 'belongsTo' as const;

  public getQuery(): QueryBuilder<T> {
    const val = this.parent.attributes[this.foreignKey];
    return (this.relatedModel as any).where(this.localKey, '=', val);
  }

  protected resolve(): Promise<T | null> {
    const val = this.parent.attributes[this.foreignKey];
    if (val === undefined || val === null) return Promise.resolve(null);
    return (this.relatedModel as any).find(val);
  }
}
