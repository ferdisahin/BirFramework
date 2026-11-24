import type { Model } from './model.js';
import { QueryBuilder } from './query.js';

export abstract class Relation<T = any> {
  public abstract readonly type: 'hasMany' | 'belongsTo' | 'hasOne' | 'belongsToMany';
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

export class BelongsToMany<T = any> extends Relation<T> {
  public readonly type = 'belongsToMany' as const;
  public pivotTable: string;
  public relatedPivotKey: string;
  public relatedKey: string;

  constructor(
    parent: Model,
    relatedModel: typeof Model,
    pivotTable: string,
    foreignPivotKey: string,
    relatedPivotKey: string,
    parentKey: string = 'id',
    relatedKey: string = 'id'
  ) {
    super(parent, relatedModel, foreignPivotKey, parentKey);
    this.pivotTable = pivotTable;
    this.relatedPivotKey = relatedPivotKey;
    this.relatedKey = relatedKey;
  }

  public getQuery(): QueryBuilder<T> {
    // Subquery-free approach compatible with all drivers via pivot lookup or IN
    return (this.relatedModel as any).query();
  }

  public override async get(): Promise<T[]> {
    const parentId = this.parent.attributes[this.localKey];
    if (parentId === undefined || parentId === null) return [];

    const pivotRows = await new QueryBuilder(this.pivotTable)
      .where(this.foreignKey, '=', parentId)
      .get();

    const relatedIds = pivotRows.map((r: any) => r[this.relatedPivotKey]).filter((v: any) => v !== undefined && v !== null);
    if (relatedIds.length === 0) return [];

    return (this.relatedModel as any).query().whereIn(this.relatedKey, relatedIds).get();
  }

  public async attach(ids: any | any[]): Promise<void> {
    const parentId = this.parent.attributes[this.localKey];
    if (parentId === undefined || parentId === null) {
      throw new Error('[BirORM] Cannot attach relation to an unsaved parent model.');
    }

    const idList = Array.isArray(ids) ? ids : [ids];
    if (idList.length === 0) return;

    const rows = idList.map((id) => ({
      [this.foreignKey]: parentId,
      [this.relatedPivotKey]: id,
    }));

    await new QueryBuilder(this.pivotTable).insert(rows);
  }

  public async detach(ids?: any | any[]): Promise<number> {
    const parentId = this.parent.attributes[this.localKey];
    if (parentId === undefined || parentId === null) return 0;

    const q = new QueryBuilder(this.pivotTable).where(this.foreignKey, '=', parentId);
    if (ids !== undefined) {
      const idList = Array.isArray(ids) ? ids : [ids];
      if (idList.length === 0) return 0;
      q.whereIn(this.relatedPivotKey, idList);
    }

    return q.delete();
  }

  public async sync(ids: any[]): Promise<void> {
    await this.detach();
    await this.attach(ids);
  }

  protected resolve(): Promise<T[]> {
    return this.get();
  }
}
