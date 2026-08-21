/**
 * What the game remembers between sessions.
 *
 * localStorage rather than IndexedDB, deliberately. The exam attempts live in
 * IndexedDB because they carry Blobs of speaking audio; this is a few kilobytes
 * of integers. Adding a store would mean bumping the database version, and the
 * one database in this project is the one holding every saved attempt — not
 * somewhere to take a risk for a scoreboard.
 *
 * Nothing here leaves the device, like everything else the app stores.
 */

import {
  VERLAUF_MAX,
  leererFortschritt,
  spielSchluessel,
  verlaufErgaenzen,
  verlaufSchluessel,
  type Antwortnotiz,
  type Fortschritt,
  type Kategorie,
  type Stufe,
} from '@pruefung/core';

export function fortschrittLesen(stufe: Stufe, kategorie: Kategorie): Fortschritt {
  try {
    const roh = localStorage.getItem(spielSchluessel(stufe, kategorie));
    if (!roh) return leererFortschritt();
    const gelesen = JSON.parse(roh) as Partial<Fortschritt>;
    // Merged onto a blank rather than trusted: this is user-editable storage,
    // and a half-written or hand-edited entry should cost a streak record, not
    // crash the game on load.
    return {
      ...leererFortschritt(),
      ...gelesen,
      boxen: typeof gelesen.boxen === 'object' && gelesen.boxen ? gelesen.boxen : {},
    };
  } catch {
    return leererFortschritt();
  }
}

export function fortschrittSchreiben(
  stufe: Stufe,
  kategorie: Kategorie,
  fortschritt: Fortschritt,
): void {
  try {
    localStorage.setItem(spielSchluessel(stufe, kategorie), JSON.stringify(fortschritt));
  } catch {
    // A full or disabled store costs the scoreboard, never the round in play.
  }
}

/**
 * The answer history for a level, newest first.
 *
 * Kept under its own key rather than inside the per-category Fortschritt: the
 * history spans categories, and it is the one thing here that grows, so it
 * should be loadable and clearable on its own.
 */
export function verlaufLesen(stufe: Stufe): Antwortnotiz[] {
  try {
    const roh = localStorage.getItem(verlaufSchluessel(stufe));
    if (!roh) return [];
    const gelesen: unknown = JSON.parse(roh);
    if (!Array.isArray(gelesen)) return [];
    // Filtered rather than trusted: this is user-editable storage, and one
    // malformed entry should cost that entry, not the whole history.
    return gelesen
      .filter(
        (n): n is Antwortnotiz =>
          !!n && typeof n.id === 'string' && typeof n.richtig === 'boolean',
      )
      .slice(0, VERLAUF_MAX);
  } catch {
    return [];
  }
}

export function verlaufNotieren(stufe: Stufe, notiz: Antwortnotiz): void {
  try {
    localStorage.setItem(
      verlaufSchluessel(stufe),
      JSON.stringify(verlaufErgaenzen(verlaufLesen(stufe), notiz)),
    );
  } catch {
    // A full store costs the history, never the round in play.
  }
}

export function verlaufLoeschen(stufe: Stufe): void {
  try {
    localStorage.removeItem(verlaufSchluessel(stufe));
  } catch {
    // Nothing to do: the caller clears its own copy either way.
  }
}
