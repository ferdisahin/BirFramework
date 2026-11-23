import type { Context } from '../context.js';
import { LengthAwarePaginator } from '../../pagination/index.js';
import { JsonResource } from './resource.js';

export class ResourceCollection<R extends JsonResource = JsonResource> {
  public collection: any[];
  public paginator?: LengthAwarePaginator<any>;
  public resourceClass: new (item: any) => R;
  protected additionalData: Record<string, any> = {};

  constructor(
    resource: any[] | LengthAwarePaginator<any>,
    resourceClass: new (item: any) => R = JsonResource as any
  ) {
    this.resourceClass = resourceClass;

    if (resource instanceof LengthAwarePaginator) {
      this.paginator = resource;
      this.collection = resource.data;
    } else if (Array.isArray(resource)) {
      this.collection = resource;
    } else {
      this.collection = [];
    }
  }

  /**
   * Add extra top-level metadata to the collection response.
   */
  public additional(data: Record<string, any>): this {
    this.additionalData = { ...this.additionalData, ...data };
    return this;
  }

  /**
   * Get additional data that should be returned with the collection.
   */
  public with(ctx?: Context): Record<string, any> {
    return {};
  }

  /**
   * Resolve the collection to its final serializable JSON structure.
   */
  public resolve(ctx?: Context): any {
    const mapped = this.collection.map((item) => {
      const res = new this.resourceClass(item);
      return res.toArray(ctx);
    });

    const wrapKey = JsonResource.wrapKey || 'data';
    const withData = this.with(ctx);

    if (this.paginator) {
      const sep = this.paginator.path.includes('?') ? '&' : '?';
      const buildUrl = (p: number) => `${this.paginator!.path}${sep}page=${p}`;
      const meta = this.paginator.meta;

      return {
        [wrapKey]: mapped,
        meta: {
          total: meta.total,
          currentPage: meta.currentPage,
          lastPage: meta.lastPage,
          perPage: meta.perPage,
          from: meta.from,
          to: meta.to,
        },
        links: {
          first: buildUrl(1),
          last: buildUrl(meta.lastPage),
          prev: meta.hasPrevious ? buildUrl(meta.currentPage - 1) : null,
          next: meta.hasMore ? buildUrl(meta.currentPage + 1) : null,
        },
        ...this.additionalData,
        ...withData,
      };
    }

    if (!wrapKey) {
      return mapped;
    }

    return {
      [wrapKey]: mapped,
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
