import React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { LEADERBOARD_PAGE_SIZE } from "@/hooks/useLeaderboardPagination";
import "@/styles/leaderboards.css";

export default function LeaderboardPagination({ page, pageCount, total, onPageChange, compact = false, itemLabel = "players" }) {
  const start = total ? (page - 1) * LEADERBOARD_PAGE_SIZE + 1 : 0;
  const end = Math.min(page * LEADERBOARD_PAGE_SIZE, total);
  return (
    <nav className={`leaderboard-pagination ${compact ? "leaderboard-pagination-compact" : ""}`} aria-label="Leaderboard pages">
      <p className="leaderboard-range" aria-live="polite" aria-atomic="true"><strong>{start.toLocaleString()}–{end.toLocaleString()}</strong> of {total.toLocaleString()} {itemLabel}</p>
      <div className="leaderboard-page-controls">
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={`Load previous 50 ${itemLabel}`}><ArrowLeft size={14} /><span>Previous</span></button>
        <span className="leaderboard-page-number">{page} <span>/ {pageCount}</span></span>
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label={`Load next 50 ${itemLabel}`}><span>Next 50</span><ArrowRight size={14} /></button>
      </div>
    </nav>
  );
}
