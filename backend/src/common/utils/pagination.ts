export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return { data, meta: { page, pageSize, total } };
}

export function paginationSkip(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}
