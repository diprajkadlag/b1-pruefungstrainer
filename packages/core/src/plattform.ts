/**
 * Wortsprung — the platformer's world, without a canvas.
 *
 * The same questions as Sprachschatz, answered with the feet. Each question is
 * a *station*: a stretch of ground with the options hung above it as
 * question-mark boxes to head-butt, or waddling along it as ducks to stomp.
 * Pick the right one and the hero runs on; pick a wrong one and a heart goes.
 *
 * Everything here is pure and deterministic — layout from a question, one
 * physics step from a state and an input, the duck positions from a clock —
 * so the rules can be tested without a browser, and so the game plays the
 * same on a phone that drops frames as on a desktop that does not: the
 * screen calls `schritt` with a fixed time slice, as many times as the wall
 * clock demands.
 *
 * Units are logical pixels of a 360-high playfield. The screen scales the
 * canvas to whatever it has.
 */

import type { Frage } from './spiel.js';
import type { Ton } from './spiel.js';

// --- the playfield ------------------------------------------------------------

export const HOEHE = 360;
export const BODEN = 300;

export const HELD = { breite: 22, hoehe: 30 } as const;
export const KISTE = { breite: 32, hoehe: 32 } as const;
export const ENTE = { breite: 30, hoehe: 24 } as const;

/** How far above the ground the underside of a box sits. Reachable by a jump. */
export const KISTEN_UNTERKANTE = BODEN - 92;

/** px/s and px/s² */
export const LAUF = 190;
export const BESCHLEUNIGUNG = 1400;
export const BREMSUNG = 1900;
export const SCHWERKRAFT = 1750;
export const SPRUNG = -600;
/** The little hop off a squashed duck, so a stomp reads as a stomp. */
export const ABPRALL = -280;
/** The bump back down after heading a box. */
export const KOPFSTOSS = 90;
/** The fixed simulation slice; the screen accumulates wall time into these. */
export const SCHRITT = 1 / 120;

// --- a station ------------------------------------------------------------------

export type ZielArt = 'kiste' | 'ente';

export interface Ziel {
  index: number;
  art: ZielArt;
  /** Left edge, for a box; centre of the waddle, for a duck. */
  x: number;
  /** Top edge. Boxes hang; ducks stand. */
  y: number;
  text: string;
}

export interface Station {
  frage: Frage;
  breite: number;
  ziele: Ziel[];
  /** Where the hero appears, feet on the ground. */
  startX: number;
}

/** How wide a duck waddles either side of its post. */
export const ENTEN_WEG = 26;
export const ENTEN_TEMPO = 1.6;

/**
 * Which options become boxes and which become ducks. Alternates by station so
 * a round is never twelve of the same thing, and within a mixed station by
 * option so the two kinds sit side by side.
 */
export function zielArten(anzahl: number, stationNr: number): ZielArt[] {
  const muster = stationNr % 3;
  return Array.from({ length: anzahl }, (_, i) => {
    if (muster === 0) return 'kiste';
    if (muster === 1) return 'ente';
    return i % 2 === 0 ? 'kiste' : 'ente';
  });
}

/** Room between two neighbouring targets: enough that a jump lands on one. */
export const ZIEL_ABSTAND = 150;
export const RAND = 120;

export function stationBauen(frage: Frage, stationNr: number): Station {
  const arten = zielArten(frage.optionen.length, stationNr);
  const ziele = frage.optionen.map((text, i) => {
    const art = arten[i]!;
    const mitte = RAND + 80 + i * ZIEL_ABSTAND;
    return art === 'kiste'
      ? {
          index: i,
          art,
          x: mitte - KISTE.breite / 2,
          y: KISTEN_UNTERKANTE - KISTE.hoehe,
          text,
        }
      : { index: i, art, x: mitte, y: BODEN - ENTE.hoehe, text };
  });
  const letztes = ziele[ziele.length - 1];
  const breite = (letztes ? letztes.x + KISTE.breite : RAND) + RAND + 60;
  return { frage, breite, ziele, startX: 40 };
}

/** A duck's left edge at time t. Deterministic, so a replay is a replay. */
export function entenX(ziel: Ziel, t: number): number {
  const phase = ziel.index * 1.7;
  return ziel.x + Math.sin(t * ENTEN_TEMPO + phase) * ENTEN_WEG - ENTE.breite / 2;
}

/** Which way a duck is facing, for the drawing. */
export function entenBlick(ziel: Ziel, t: number): 1 | -1 {
  const phase = ziel.index * 1.7;
  return Math.cos(t * ENTEN_TEMPO + phase) >= 0 ? 1 : -1;
}

// --- the hero -----------------------------------------------------------------

export interface Held {
  x: number;
  /** Top edge. Feet are at y + HELD.hoehe. */
  y: number;
  vx: number;
  vy: number;
  amBoden: boolean;
  blick: 1 | -1;
  /** Seconds of running, for the leg animation. Reset when standing. */
  lauf: number;
}

export interface Eingabe {
  links: boolean;
  rechts: boolean;
  springen: boolean;
}

export const KEINE_EINGABE: Eingabe = { links: false, rechts: false, springen: false };

export function heldAnfang(station: Station): Held {
  return {
    x: station.startX,
    y: BODEN - HELD.hoehe,
    vx: 0,
    vy: 0,
    amBoden: true,
    blick: 1,
    lauf: 0,
  };
}

export type Ereignis =
  | { art: 'kopfstoss'; ziel: Ziel }
  | { art: 'stampfer'; ziel: Ziel }
  | { art: 'sprung' }
  | { art: 'landung' };

interface Kasten {
  x: number;
  y: number;
  b: number;
  h: number;
}

function ueberlappen(a: Kasten, b: Kasten): boolean {
  return a.x < b.x + b.b && a.x + a.b > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function kistenKasten(z: Ziel): Kasten {
  return { x: z.x, y: z.y, b: KISTE.breite, h: KISTE.hoehe };
}

function entenKasten(z: Ziel, t: number): Kasten {
  return { x: entenX(z, t), y: z.y, b: ENTE.breite, h: ENTE.hoehe };
}

/**
 * One slice of time. Returns the new hero and whatever happened in it.
 *
 * Targets already used are passed in `verbraucht` and become scenery: a box
 * already headed is solid but says nothing, a duck already stomped is gone.
 * The order is vertical first, then horizontal — the platformer convention,
 * because it makes "landed on" and "headed from below" unambiguous.
 */
export function schritt(
  held: Held,
  eingabe: Eingabe,
  station: Station,
  t: number,
  verbraucht: ReadonlySet<number> = new Set(),
  dt = SCHRITT,
): { held: Held; ereignisse: Ereignis[] } {
  const ereignisse: Ereignis[] = [];
  let { x, y, vx, vy, amBoden, blick, lauf } = held;

  // --- horizontal intent ----------------------------------------------------
  const richtung = (eingabe.rechts ? 1 : 0) - (eingabe.links ? 1 : 0);
  if (richtung !== 0) {
    vx += richtung * BESCHLEUNIGUNG * dt;
    vx = Math.max(-LAUF, Math.min(LAUF, vx));
    blick = richtung as 1 | -1;
  } else if (vx !== 0) {
    const brems = BREMSUNG * dt;
    vx = Math.abs(vx) <= brems ? 0 : vx - Math.sign(vx) * brems;
  }

  // --- jump ------------------------------------------------------------------
  if (eingabe.springen && amBoden) {
    vy = SPRUNG;
    amBoden = false;
    ereignisse.push({ art: 'sprung' });
  }

  // --- vertical --------------------------------------------------------------
  vy += SCHWERKRAFT * dt;
  const yAlt = y;
  y += vy * dt;
  const warAmBoden = amBoden;
  amBoden = false;

  const kisten = station.ziele.filter((z) => z.art === 'kiste');
  const enten = station.ziele.filter((z) => z.art === 'ente' && !verbraucht.has(z.index));

  // Ground.
  if (y + HELD.hoehe >= BODEN) {
    y = BODEN - HELD.hoehe;
    if (vy > 0 && !warAmBoden) ereignisse.push({ art: 'landung' });
    vy = 0;
    amBoden = true;
  }

  // Boxes: solid from every side; the underside is the one that answers.
  for (const z of kisten) {
    const k = kistenKasten(z);
    const heldKasten = { x, y, b: HELD.breite, h: HELD.hoehe };
    if (!ueberlappen(heldKasten, k)) continue;
    const vorherUnten = yAlt >= k.y + k.h; // came from below
    const vorherOben = yAlt + HELD.hoehe <= k.y; // came from above
    if (vy < 0 && vorherUnten) {
      y = k.y + k.h;
      vy = KOPFSTOSS;
      if (!verbraucht.has(z.index)) ereignisse.push({ art: 'kopfstoss', ziel: z });
    } else if (vy >= 0 && vorherOben) {
      y = k.y - HELD.hoehe;
      if (!warAmBoden) ereignisse.push({ art: 'landung' });
      vy = 0;
      amBoden = true;
    }
  }

  // Ducks: only a landing on the back counts. Walking into one from the side
  // is not an answer and not a hit — it just is not how the question is asked.
  for (const z of enten) {
    const e = entenKasten(z, t);
    const heldKasten = { x, y, b: HELD.breite, h: HELD.hoehe };
    if (!ueberlappen(heldKasten, e)) continue;
    const vorherOben = yAlt + HELD.hoehe <= e.y + 6;
    if (vy > 0 && vorherOben) {
      y = e.y - HELD.hoehe;
      vy = ABPRALL;
      amBoden = false;
      ereignisse.push({ art: 'stampfer', ziel: z });
    }
  }

  // --- horizontal --------------------------------------------------------------
  x += vx * dt;
  for (const z of kisten) {
    const k = kistenKasten(z);
    const heldKasten = { x, y, b: HELD.breite, h: HELD.hoehe };
    if (!ueberlappen(heldKasten, k)) continue;
    // Only a side hit is left to resolve: vertical overlap was handled above.
    if (vx > 0) x = k.x - HELD.breite;
    else if (vx < 0) x = k.x + k.b;
    vx = 0;
  }
  x = Math.max(0, Math.min(station.breite - HELD.breite, x));

  lauf = amBoden && vx !== 0 ? lauf + dt : 0;

  return { held: { x, y, vx, vy, amBoden, blick, lauf }, ereignisse };
}

/**
 * Where the camera's left edge sits: the hero a third of the way in, never
 * past either end of the station.
 */
export function kameraX(held: Held, station: Station, sichtBreite: number): number {
  const ziel = held.x + HELD.breite / 2 - sichtBreite / 3;
  return Math.max(0, Math.min(station.breite - sichtBreite, ziel));
}

/**
 * The nearest target on the way from the hero, for the tap-to-go assist: a
 * learner on a phone who taps a box wants the hero to run under it and jump,
 * not to be told to find the D-pad. Returns the x the hero should stand at.
 */
export function anlaufX(ziel: Ziel, t: number): number {
  const mitte =
    ziel.art === 'kiste' ? ziel.x + KISTE.breite / 2 : entenX(ziel, t) + ENTE.breite / 2;
  return mitte - HELD.breite / 2;
}

// --- sounds ---------------------------------------------------------------------
// Numbers, like the two Sprachschatz already has. Played by the same Web Audio
// code, so there is nothing to fetch and nothing to license.

export const KLANG_SPRUNG: readonly Ton[] = [
  { hz: 392, ab: 0, dauer: 0.05 }, // G4
  { hz: 587.33, ab: 0.04, dauer: 0.08 }, // D5
];

export const KLANG_MUENZE: readonly Ton[] = [
  { hz: 1318.51, ab: 0, dauer: 0.07 }, // E6
  { hz: 1760, ab: 0.06, dauer: 0.22 }, // A6
];

export const KLANG_STAMPFER: readonly Ton[] = [
  { hz: 220, ab: 0, dauer: 0.05 }, // A3
  { hz: 110, ab: 0.04, dauer: 0.1 }, // A2
];

export const KLANG_TREFFER: readonly Ton[] = [
  { hz: 311.13, ab: 0, dauer: 0.1 }, // E♭4
  { hz: 233.08, ab: 0.09, dauer: 0.12 }, // B♭3
  { hz: 155.56, ab: 0.2, dauer: 0.28 }, // E♭3
];

export const KLANG_ZIEL: readonly Ton[] = [
  { hz: 523.25, ab: 0, dauer: 0.1 }, // C5
  { hz: 659.25, ab: 0.1, dauer: 0.1 }, // E5
  { hz: 783.99, ab: 0.2, dauer: 0.1 }, // G5
  { hz: 1046.5, ab: 0.3, dauer: 0.32 }, // C6
];

export const KLANG_AUS: readonly Ton[] = [
  { hz: 392, ab: 0, dauer: 0.16 }, // G4
  { hz: 369.99, ab: 0.16, dauer: 0.16 }, // F♯4
  { hz: 349.23, ab: 0.32, dauer: 0.16 }, // F4
  { hz: 329.63, ab: 0.48, dauer: 0.42 }, // E4
];
