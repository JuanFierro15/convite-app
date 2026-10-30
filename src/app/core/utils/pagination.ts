export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): Page<T> {
  const safePageSize = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : 1;
  const totalPages = Math.max(1, Math.ceil(items.length / safePageSize));

  let safePage = 1;
  if (Number.isFinite(page)) {
    const floored = Math.floor(page);
    if (floored < 1) {
      safePage = 1;
    } else if (floored > totalPages) {
      safePage = totalPages;
    } else {
      safePage = floored;
    }
  }

  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;
  const pagedItems = items.slice(start, end);

  return {
    items: pagedItems,
    page: safePage,
    totalPages,
  };
}
