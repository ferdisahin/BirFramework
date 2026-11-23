import type { Context } from '../context.js';
import { LengthAwarePaginator } from '../../pagination/index.js';
import { ResourceCollection } from './collection.js';

export class JsonResource<T = any> {
  public resource: T;
  public static wrapKey: string | null = 'data';
  protected additionalData: Record<string, any> = {};
  public statusCode: number = 200;

  constructor(resource: T) {
    this.resource = resource;
  }

  /**
   * Create a new resource instance.
   */
  public static make<R extends JsonResource, T = any>(this: new (res: T) => R, resource: T): R {
    return new this(resource);
  }

  /**
   * Create an anonymous or typed resource collection.
   */
  public static collection<R extends JsonResource, T = any>(
    this: new (res: T) => R,
    resources: T[] | LengthAwarePaginator<T>
  ): ResourceCollection<R> {
    return new ResourceCollection(resources, this);
  }

  /**
   * Set the outer wrapping key (e.g. 'data' or null to disable wrapping).
   */
  public static withoutWrapping(): void {
    this.wrapKey = null;
  }

  /**
   * Transform the resource into an array/object.
   */
  public toArray(ctx?: Context): any {
    if (this.resource === null || this.resource === undefined) {
      return null;
    }

    if (typeof (this.resource as any).toJSON === 'function') {
      return (this.resource as any).toJSON();
    }

    if ((this.resource as any).attributes) {
      return { ...(this.resource as any).attributes };
    }

    return { ...this.resource };
  }

  /**
   * Add extra top-level metadata to the resource response.
   */
  public additional(data: Record<string, any>): this {
    this.additionalData = { ...this.additionalData, ...data };
    return this;
  }

  /**
   * Get additional data that should be returned with the resource array.
   */
  public with(ctx?: Context): Record<string, any> {
    return {};
  }

  /**
   * Conditionally include an attribute when the given condition is truthy.
   */
  public when<V = any>(condition: boolean | (() => boolean), value: V | (() => V), defaultValue?: any): V | undefined {
    const isTrue = typeof condition === 'function' ? condition() : condition;
    if (isTrue) {
      return typeof value === 'function' ? (value as any)() : value;
    }
    return defaultValue;
  }

  /**
   * Conditionally include a relationship or value when not null or undefined.
   */
  public whenNotNull<V = any>(value: V, defaultValue?: any): V | undefined {
    return value !== null && value !== undefined ? value : defaultValue;
  }

  /**
   * Resolve the resource to its final serializable JSON output.
   */
  public resolve(ctx?: Context): any {
    if (this.resource === null || this.resource === undefined) {
      return null;
    }

    const data = this.toArray(ctx);
    const withData = this.with(ctx);
    const wrapKey = (this.constructor as typeof JsonResource).wrapKey;

    if (!wrapKey) {
      return {
        ...data,
        ...this.additionalData,
        ...withData,
      };
    }

    return {
      [wrapKey]: data,
      ...this.additionalData,
      ...withData,
    };
  }

  /**
   * Serialize for JSON.stringify
   */
  public toJSON(): any {
    return this.resolve();
  }
}
