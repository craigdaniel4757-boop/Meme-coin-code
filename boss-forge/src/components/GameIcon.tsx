import type { GameId } from "@/types";

/**
 * Small original abstract glyphs evoking each game's mood — not
 * reproductions of any studio's logo or trademark.
 */
export function GameIcon({ gameId, className }: { gameId: GameId; className?: string }) {
  switch (gameId) {
    case "elden-ring":
      return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
          <circle cx="24" cy="24" r="17" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="24" cy="24" r="11" stroke="currentColor" strokeWidth="1" opacity="0.6" />
          <path
            d="M24 13v22M24 13l-5 6M24 13l5 6M24 35l-5-6M24 35l5-6"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "dark-souls-3":
      return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
          <path
            d="M24 8c3 4 6 7 6 12a6 6 0 1 1-12 0c0-5 3-8 6-12Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M24 20c1.5 2 3 3.5 3 6a3 3 0 1 1-6 0c0-2.5 1.5-4 3-6Z"
            fill="currentColor"
            opacity="0.5"
          />
          <path d="M14 40c3-7 6-9 10-9s7 2 10 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "terraria":
      return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true" shapeRendering="crispEdges">
          <rect x="21" y="8" width="6" height="6" fill="currentColor" />
          <rect x="15" y="14" width="6" height="6" fill="currentColor" />
          <rect x="27" y="14" width="6" height="6" fill="currentColor" />
          <rect x="21" y="14" width="6" height="6" fill="currentColor" opacity="0.6" />
          <rect x="21" y="20" width="6" height="14" fill="currentColor" opacity="0.85" />
          <rect x="18" y="34" width="12" height="6" fill="currentColor" opacity="0.6" />
        </svg>
      );
    case "palworld":
      return (
        <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
          <circle cx="24" cy="26" r="12" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 26a12 12 0 0 1 24 0" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <circle cx="17" cy="13" r="3.2" fill="currentColor" opacity="0.8" />
          <circle cx="31" cy="13" r="3.2" fill="currentColor" opacity="0.8" />
          <circle cx="9" cy="20" r="2.6" fill="currentColor" opacity="0.6" />
          <circle cx="39" cy="20" r="2.6" fill="currentColor" opacity="0.6" />
        </svg>
      );
    default:
      return null;
  }
}
