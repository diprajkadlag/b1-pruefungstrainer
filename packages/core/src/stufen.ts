/**
 * What each level's paper looks like, for the parts of the UI that must know
 * before a paper has been loaded.
 *
 * The start screen offers a level and lists module durations while the registry
 * is all it has; the countdown, by contrast, reads the times from the paper
 * itself, because that file is the authority once it is open. This table is
 * therefore deliberately small: it covers the gap before loading, and nothing
 * more.
 *
 * It mirrors the FORMATE table in tools/validate.py. Both trace back to
 * docs/EXAM-FORMAT.md — change a number and change it in all three.
 */

import type { Modul } from './scoring.js';
import type { Niveau, Stufe } from './types.js';

export interface ModulFormat {
  /** Countdown length. Speaking is paced by the recorder, so it has none. */
  minuten: number | null;
  /** What the start screen prints on the module card. */
  anzeige: string;
}

export interface StufenFormat {
  stufe: Stufe;
  /** One line on the level tab, saying what sitting this level involves. */
  kurz: string;
  module: Record<Modul, ModulFormat>;
  /** Heading for the presentation card: slides at B1, an outline at B2. */
  gliederungTitel: string;
}

export const STUFEN: Record<Stufe, StufenFormat> = {
  B1: {
    stufe: 'B1',
    kurz: '5 Leseteile, 4 Hörteile, 3 Schreibaufgaben, 3 Sprechteile',
    module: {
      lesen: { minuten: 65, anzeige: '65 Min.' },
      hoeren: { minuten: 40, anzeige: '40 Min.' },
      schreiben: { minuten: 60, anzeige: '60 Min.' },
      sprechen: { minuten: null, anzeige: '15 Min. + 15 Min. Vorbereitung' },
    },
    gliederungTitel: 'Ihre Folien',
  },
  B2: {
    stufe: 'B2',
    kurz: '5 Leseteile, 4 Hörteile, 2 Schreibaufgaben, Vortrag und Debatte',
    module: {
      lesen: { minuten: 65, anzeige: '65 Min.' },
      hoeren: { minuten: 40, anzeige: '40 Min.' },
      schreiben: { minuten: 75, anzeige: '75 Min.' },
      sprechen: { minuten: null, anzeige: '10 Min. + 15 Min. Vorbereitung' },
    },
    gliederungTitel: 'Ihre Gliederung',
  },
};

export const STUFEN_REIHE: Stufe[] = ['B1', 'B2'];

/** The level a paper id belongs to. Unprefixed ids are the original B1 papers. */
export function stufeVonId(examId: string): Stufe {
  return examId.startsWith('b2-') ? 'B2' : 'B1';
}

/**
 * The course stage a paper is pitched at, e.g. "B2.1".
 *
 * Language schools split each CEFR level into two teaching stages — B2.1 and
 * B2.2 — and learners ask for papers in those terms. The *exam* has no such
 * split: a Goethe-Zertifikat B2 is one certificate with four modules, which
 * since 2019 may be sat together or one at a time. So this is a study label,
 * not an exam format, and the UI says so where it prints it.
 *
 * The first stage maps to the gentler band (`mittel-leicht`: slower speech,
 * more transparent distractors), the second to full exam pressure.
 */
export function kursstufe(stufe: Stufe, niveau: Niveau): string {
  return `${stufe}.${niveau === 'mittel-leicht' ? 1 : 2}`;
}
