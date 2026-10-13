import { useEffect, useMemo, useState } from "react";

export const LEADERBOARD_PAGE_SIZE = 50;

export function useLeaderboardPagination(rows, scope) {
  const [selection, setSelection] = useState({ scope, page: 1 });
  const pageCount = Math.max(1, Math.ceil(rows.length / LEADERBOARD_PAGE_SIZE));
  const page = Math.min(selection.scope === scope ? selection.page : 1, pageCount);
  const offset = (page - 1) * LEADERBOARD_PAGE_SIZE;
  const visibleRows = useMemo(() => rows.slice(offset, offset + LEADERBOARD_PAGE_SIZE), [rows, offset]);

  useEffect(() => {
    setSelection((previous) => previous.scope !== scope
      ? { scope, page: 1 }
      : previous.page > pageCount ? { scope, page: pageCount } : previous);
  }, [scope, pageCount]);

  return {
    page, pageCount, offset, visibleRows, total: rows.length,
    setPage: (nextPage) => setSelection({ scope, page: Math.max(1, Math.min(nextPage, pageCount)) }),
  };
}
