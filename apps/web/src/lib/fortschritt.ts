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
  leererFortschritt,
  spielSchluessel,
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
