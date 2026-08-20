import type { Szene as SzeneName } from '@pruefung/core';

/**
 * A picture for the card.
 *
 * Inline SVG, drawn in `currentColor` and one accent, so every scene themes
 * itself and nothing is fetched. Committing ten PNGs would have been quicker
 * and would have cost a network round trip per card, a dark-mode variant of
 * each, and a licence question the project does not need.
 *
 * The point is not decoration. A word attached to a picture is remembered
 * better than the same word attached to nothing — two routes to the same
 * memory rather than one — and the picture is what makes a card feel like a
 * place rather than a row in a table.
 */

const STRICH = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Zeichnung({ name }: { name: SzeneName }) {
  switch (name) {
    case 'person':
      return (
        <>
          <circle cx="24" cy="16" r="7" {...STRICH} />
          <path d="M10 40c0-8 6-13 14-13s14 5 14 13" {...STRICH} />
          <path d="M31 30l6-4M17 30l-6-4" {...STRICH} opacity="0.5" />
        </>
      );
    case 'haus':
      return (
        <>
          <path d="M8 22L24 9l16 13" {...STRICH} />
          <path d="M12 20v20h24V20" {...STRICH} />
          <rect x="20" y="28" width="8" height="12" {...STRICH} />
          <path d="M31 13V9h4v7" {...STRICH} opacity="0.5" />
        </>
      );
    case 'stadt':
      return (
        <>
          <path d="M7 41V19h10v22M19 41V12h10v29M31 41V24h10v17" {...STRICH} />
          <path d="M10 24h4M10 30h4M22 18h4M22 25h4M34 30h4" {...STRICH} opacity="0.55" />
        </>
      );
    case 'arbeit':
      return (
        <>
          <rect x="7" y="17" width="34" height="22" rx="2" {...STRICH} />
          <path d="M18 17v-4a2 2 0 012-2h8a2 2 0 012 2v4" {...STRICH} />
          <path d="M7 27h34" {...STRICH} opacity="0.55" />
          <rect x="21" y="24" width="6" height="6" rx="1" {...STRICH} />
        </>
      );
    case 'zeit':
      return (
        <>
          <circle cx="24" cy="25" r="15" {...STRICH} />
          <path d="M24 16v9l6 4" {...STRICH} />
          <path d="M24 7v3M39 25h3M9 25H6" {...STRICH} opacity="0.5" />
        </>
      );
    case 'essen':
      return (
        <>
          <circle cx="24" cy="26" r="11" {...STRICH} />
          <circle cx="24" cy="26" r="5" {...STRICH} opacity="0.5" />
          <path d="M9 12v10M9 26v10M39 12c-2 3-2 7 0 10v14" {...STRICH} />
        </>
      );
    case 'reise':
      return (
        <>
          <path d="M6 33h30l6-9-6-9H6z" {...STRICH} />
          <path d="M14 15v18M22 15v18M30 15v18" {...STRICH} opacity="0.5" />
          <circle cx="14" cy="38" r="3" {...STRICH} />
          <circle cx="30" cy="38" r="3" {...STRICH} />
        </>
      );
    case 'natur':
      return (
        <>
          <path d="M24 40V25" {...STRICH} />
          <path
            d="M24 27c-7 0-11-5-11-10 0-4 3-8 11-8s11 4 11 8c0 5-4 10-11 10z"
            {...STRICH}
          />
          <path d="M12 40h24" {...STRICH} opacity="0.5" />
        </>
      );
    case 'sprechen':
      return (
        <>
          <path
            d="M7 12h24a3 3 0 013 3v12a3 3 0 01-3 3H17l-7 6v-6H7a3 3 0 01-3-3V15a3 3 0 013-3z"
            {...STRICH}
          />
          <path
            d="M37 20h4a3 3 0 013 3v10a3 3 0 01-3 3h-2v5l-6-5"
            {...STRICH}
            opacity="0.55"
          />
        </>
      );
    default:
      return (
        <>
          <path d="M8 12h13a4 4 0 014 4v22a4 4 0 00-4-3H8z" {...STRICH} />
          <path d="M40 12H27a4 4 0 00-4 4v22a4 4 0 014-3h13z" {...STRICH} />
          <path d="M24 16v22" {...STRICH} opacity="0.5" />
        </>
      );
  }
}

export function Szene({ name }: { name: SzeneName }) {
  return (
    <svg
      className="szene"
      viewBox="0 0 48 48"
      width="48"
      height="48"
      aria-hidden="true"
      focusable="false"
    >
      <Zeichnung name={name} />
    </svg>
  );
}
