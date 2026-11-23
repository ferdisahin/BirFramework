export interface PaginationOptions {
  page?: number | string;
  perPage?: number | string;
  total?: number;
  path?: string;
}

export interface PaginationMeta {
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  from: number;
  to: number;
  hasMore: boolean;
  hasPrevious: boolean;
}

export class LengthAwarePaginator<T = any> {
  public readonly data: T[];
  public readonly meta: PaginationMeta;
  public readonly path: string;

  constructor(
    items: T[],
    total: number,
    perPage: number = 15,
    currentPage: number = 1,
    path: string = ''
  ) {
    const safePerPage = Math.max(1, Number(perPage) || 15);
    const safeCurrentPage = Math.max(1, Number(currentPage) || 1);
    const lastPage = Math.max(1, Math.ceil(total / safePerPage));

    this.data = items;
    this.path = path;
    this.meta = {
      total,
      perPage: safePerPage,
      currentPage: safeCurrentPage,
      lastPage,
      from: total === 0 ? 0 : (safeCurrentPage - 1) * safePerPage + 1,
      to: Math.min(total, safeCurrentPage * safePerPage),
      hasMore: safeCurrentPage < lastPage,
      hasPrevious: safeCurrentPage > 1,
    };
  }

  /**
   * Generates clean, accessible HTML pagination buttons like Laravel {{ $users->links() }}
   */
  public links(): string {
    const { currentPage, lastPage, hasPrevious, hasMore } = this.meta;
    if (lastPage <= 1) return '';

    const buildUrl = (p: number) => {
      const sep = this.path.includes('?') ? '&' : '?';
      return `${this.path}${sep}page=${p}`;
    };

    let html = `<nav class="bir-pagination" style="display:flex;gap:6px;align-items:center;margin:1rem 0;">`;

    // Previous Button
    if (hasPrevious) {
      html += `<a href="${buildUrl(currentPage - 1)}" style="padding:6px 12px;border:1px solid #ccc;border-radius:4px;text-decoration:none;color:#333;">&laquo; Previous</a>`;
    } else {
      html += `<span style="padding:6px 12px;border:1px solid #eee;border-radius:4px;color:#999;">&laquo; Previous</span>`;
    }

    // Page Numbers
    for (let p = 1; p <= lastPage; p++) {
      if (p === currentPage) {
        html += `<span style="padding:6px 12px;background:#3b82f6;color:#fff;border-radius:4px;font-weight:bold;">${p}</span>`;
      } else {
        html += `<a href="${buildUrl(p)}" style="padding:6px 12px;border:1px solid #ccc;border-radius:4px;text-decoration:none;color:#333;">${p}</a>`;
      }
    }

    // Next Button
    if (hasMore) {
      html += `<a href="${buildUrl(currentPage + 1)}" style="padding:6px 12px;border:1px solid #ccc;border-radius:4px;text-decoration:none;color:#333;">Next &raquo;</a>`;
    } else {
      html += `<span style="padding:6px 12px;border:1px solid #eee;border-radius:4px;color:#999;">Next &raquo;</span>`;
    }

    html += `</nav>`;
    return html;
  }

  public toJSON() {
    return {
      data: this.data,
      pagination: this.meta,
    };
  }
}

/**
 * Paginates an in-memory array or database result set
 */
export function paginate<T>(
  allOrPagedItems: T[],
  options: PaginationOptions = {},
  isAlreadySliced: boolean = false
): LengthAwarePaginator<T> {
  const page = Math.max(1, Number(options.page) || 1);
  const perPage = Math.max(1, Number(options.perPage) || 15);
  const total = options.total !== undefined ? options.total : allOrPagedItems.length;

  let slicedItems: T[];
  if (isAlreadySliced) {
    slicedItems = allOrPagedItems;
  } else {
    const offset = (page - 1) * perPage;
    slicedItems = allOrPagedItems.slice(offset, offset + perPage);
  }

  return new LengthAwarePaginator<T>(slicedItems, total, perPage, page, options.path || '');
}
