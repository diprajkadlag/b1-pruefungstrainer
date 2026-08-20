/**
 * Scoring for the objectively-marked modules.
 *
 * Reading and listening are answer sheets: every item is worth one raw point,
 * and the raw score is converted to the scale the certificate uses. Writing and
 * speaking are marked by a human against published criteria, so this module
 * only carries their maxima and combines a mark once one exists.
 *
 * Shared by the web app and the server so a result cannot be computed two
 * different ways depending on where it was calculated.
 *
 * **The levels do not agree on what a module is worth, or on what passing
 * means.** B1 and B2 are modular: 100 points per module, 60 to pass, and each
 * module is certified on its own. A2 is one examination worth 100 points in
 * total — each part contributes at most 25, and it is passed or failed as a
 * whole. Everything level-dependent lives in BEWERTUNG below and nowhere else.
 */

import type { Stufe } from './types.js';

export type Modul = 'lesen' | 'hoeren' | 'schreiben' | 'sprechen';
export type Note =
  'sehr gut' | 'gut' | 'befriedigend' | 'ausreichend' | 'nicht bestanden';

/** What the whole examination requires, where it is certified as one. */
export interface GesamtRegel {
  /** Points for the examination as a whole, after any conversion. */
  punkte: number;
  /** Overall pass mark. */
  grenze: number;
  /**
   * What each part's points are multiplied by before they are added.
   *
   * A1's answer sheet records raw points out of 15 per part and the
   * regulations multiply by 1.66 only when the overall score is worked out.
   * A2 converts per part instead, so its parts already sit on the
   * certificate's scale and its factor is 1.
   */
  faktor: number;
  /** Round the converted total to whole points, as A1 requires and A2 does not. */
  runden: boolean;
  /**
   * Extra floors beyond the overall pass mark, where the level has any.
   *
   * A2 has two and all three conditions must hold at once. **A1 has none** —
   * its regulations state exactly one condition, and the remark that a
   * candidate under 35 written points cannot reach 60 is advice about whether
   * to sit the oral, not a further way to fail.
   */
  schriftlich: { module: Modul[]; punkte: number; grenze: number } | null;
  muendlich: { modul: Modul; punkte: number; grenze: number } | null;
}

export interface Bewertung {
  /** What one module is worth on the certificate. */
  punkteProModul: number;
  /**
   * Pass mark for a single module, or `null` where a module carries no verdict
   * of its own because the level is certified as one examination.
   */
  modulGrenze: number | null;
  /**
   * Decimal places to keep when converting a raw score.
   *
   * 30 items do not divide 100 evenly, so B1 and B2 round to whole points and
   * the boundary lands where the published tables put it. A2 multiplies 20 raw
   * Messpunkte by exactly 1.25, which is quarter-point exact — rounding it to
   * whole points would silently move marks.
   */
  nachkommastellen: number;
  /** Set only where the level is one examination rather than four modules. */
  gesamt: GesamtRegel | null;
}

/** B1 and B2: four modules, each certified on its own. */
const MODULAR: Bewertung = {
  punkteProModul: 100,
  modulGrenze: 60,
  nachkommastellen: 0,
  gesamt: null,
};

export const BEWERTUNG: Record<Stufe, Bewertung> = {
  // A1 records 15 raw points per part — that is what the Antwortbogen has a box
  // for — and multiplies the lot by 1.66 to reach 100. One condition and one
  // only: 60 of those 100 points.
  A1: {
    punkteProModul: 15,
    modulGrenze: null,
    nachkommastellen: 0,
    gesamt: {
      punkte: 100,
      grenze: 60,
      faktor: 1.66,
      runden: true,
      schriftlich: null,
      muendlich: null,
    },
  },
  // A2 is passed as a whole and only as a whole: 60 of 100 overall, 45 of 75
  // across the three written parts, and 15 of 25 in Sprechen. Miss any one and
  // "gilt die gesamte Prüfung als nicht bestanden".
  A2: {
    punkteProModul: 25,
    modulGrenze: null,
    nachkommastellen: 2,
    gesamt: {
      punkte: 100,
      grenze: 60,
      faktor: 1,
      runden: false,
      schriftlich: { module: ['lesen', 'hoeren', 'schreiben'], punkte: 75, grenze: 45 },
      muendlich: { modul: 'sprechen', punkte: 25, grenze: 15 },
    },
  },
  B1: MODULAR,
  B2: MODULAR,
};

export const ITEMS_PRO_MODUL = 30;
export const PUNKTE_PRO_MODUL = 100;
export const BESTEHENSGRENZE = 60;

/**
 * Grade bands. Ordered high to low; the first band whose floor is met wins.
 * Note the boundaries are inclusive at the bottom: exactly 60 is a pass.
 */
const NOTENSTUFEN: ReadonlyArray<{ ab: number; note: Note }> = [
  { ab: 90, note: 'sehr gut' },
  { ab: 80, note: 'gut' },
  { ab: 70, note: 'befriedigend' },
  { ab: 60, note: 'ausreichend' },
  { ab: 0, note: 'nicht bestanden' },
];

export function note(punkte: number): Note {
  const stufe = NOTENSTUFEN.find((s) => punkte >= s.ab);
  return stufe ? stufe.note : 'nicht bestanden';
}

export function bestanden(punkte: number): boolean {
  return punkte >= BESTEHENSGRENZE;
}

/**
 * Convert a raw item count to the scale a module is marked on.
 *
 * At B1 and B2 that is 100 points from 30 items, which does not divide evenly,
 * so every conversion is a rounding decision. Round half up on the exact 10/3
 * ratio: 18/30 becomes 60 and passes, 17/30 becomes 57 and does not. Getting
 * this wrong moves the pass boundary.
 *
 * At A2 it is 25 points from 20 items — the official ×1.25 — which is exact to
 * the quarter point and must not be rounded to whole points.
 */
export function rohZuPunkten(
  richtig: number,
  gesamt: number = ITEMS_PRO_MODUL,
  stufe: Stufe = 'B1',
): number {
  if (gesamt <= 0) return 0;
  const { punkteProModul, nachkommastellen } = BEWERTUNG[stufe];
  const geklemmt = Math.max(0, Math.min(richtig, gesamt));
  const faktor = 10 ** nachkommastellen;
  return Math.round((geklemmt * punkteProModul * faktor) / gesamt) / faktor;
}

export interface ItemErgebnis {
  nr: number;
  teil: number;
  gegeben: string | null;
  richtig: string;
  korrekt: boolean;
  kompetenz: string;
}

export interface TeilErgebnis {
  teil: number;
  richtig: number;
  gesamt: number;
}

export interface ModulErgebnis {
  modul: Modul;
  richtig: number;
  gesamt: number;
  punkte: number;
  /** What this module is marked out of at this level: 25 at A2, 100 otherwise. */
  maximum: number;
  /** `null` at a level where one module carries no verdict of its own. */
  note: Note | null;
  /** `null` at A2, which is passed as a whole examination or not at all. */
  bestanden: boolean | null;
  proTeil: TeilErgebnis[];
  items: ItemErgebnis[];
}

export interface Schluessel {
  loesung: string;
  teil: number;
  kompetenz?: string;
}

/**
 * Mark one objectively-scored module.
 *
 * An unanswered item scores zero, exactly as it would on a real answer sheet;
 * it is never treated as absent from the denominator.
 */
export function bewerteModul(
  modul: Modul,
  antworten: Readonly<Record<string, string | null | undefined>>,
  schluessel: Readonly<Record<string, Schluessel>>,
  stufe: Stufe = 'B1',
): ModulErgebnis {
  const items: ItemErgebnis[] = [];
  const proTeil = new Map<number, TeilErgebnis>();

  for (const [key, eintrag] of Object.entries(schluessel)) {
    const [keyModul, nrText] = key.split('-');
    if (keyModul !== modul) continue;

    const nr = Number(nrText);
    const gegeben = antworten[String(nr)] ?? null;
    const korrekt = gegeben !== null && normalise(gegeben) === normalise(eintrag.loesung);

    items.push({
      nr,
      teil: eintrag.teil,
      gegeben,
      richtig: eintrag.loesung,
      korrekt,
      kompetenz: eintrag.kompetenz ?? '',
    });

    const bucket = proTeil.get(eintrag.teil) ?? {
      teil: eintrag.teil,
      richtig: 0,
      gesamt: 0,
    };
    bucket.gesamt += 1;
    if (korrekt) bucket.richtig += 1;
    proTeil.set(eintrag.teil, bucket);
  }

  items.sort((a, b) => a.nr - b.nr);
  const richtig = items.filter((i) => i.korrekt).length;
  const { punkteProModul, modulGrenze } = BEWERTUNG[stufe];
  const punkte = rohZuPunkten(richtig, items.length || ITEMS_PRO_MODUL, stufe);

  // A grade and a verdict belong to whatever is certified. Where that is the
  // module, both are reported; where it is the whole examination, neither can
  // be known from one answer sheet, and saying "bestanden" here would be a lie.
  const anteil = punkteProModul > 0 ? (punkte / punkteProModul) * 100 : 0;

  return {
    modul,
    richtig,
    gesamt: items.length,
    punkte,
    maximum: punkteProModul,
    note: modulGrenze === null ? null : note(anteil),
    bestanden: modulGrenze === null ? null : anteil >= modulGrenze,
    proTeil: [...proTeil.values()].sort((a, b) => a.teil - b.teil),
    items,
  };
}

/** Answers are compared case- and whitespace-insensitively. */
function normalise(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Where the candidate actually lost marks, grouped by the skill each item
 * tests, worst first. This is what turns a score into advice.
 */
export interface SchwachstelleEintrag {
  kompetenz: string;
  verloren: number;
  gesamt: number;
  quote: number;
}

export function schwachstellen(
  ergebnisse: ReadonlyArray<ModulErgebnis>,
): SchwachstelleEintrag[] {
  const nach = new Map<string, { verloren: number; gesamt: number }>();

  for (const modul of ergebnisse) {
    for (const item of modul.items) {
      const key = item.kompetenz || 'unbestimmt';
      const bucket = nach.get(key) ?? { verloren: 0, gesamt: 0 };
      bucket.gesamt += 1;
      if (!item.korrekt) bucket.verloren += 1;
      nach.set(key, bucket);
    }
  }

  return [...nach.entries()]
    .map(([kompetenz, v]) => ({
      kompetenz,
      verloren: v.verloren,
      gesamt: v.gesamt,
      quote: v.gesamt ? v.verloren / v.gesamt : 0,
    }))
    .filter((e) => e.verloren > 0)
    .sort((a, b) => b.quote - a.quote || b.verloren - a.verloren);
}

/** The whole-examination verdict, at a level that has one. */
export interface GesamtWertung {
  /** Points over all four parts, on the certificate's own scale. */
  punkte: number;
  /** Lesen + Hören + Schreiben together, or 0 where the level sets no floor. */
  schriftlich: number;
  /** Sprechen on its own, or 0 where the level sets no floor. */
  muendlich: number;
  bestanden: boolean;
  /** Every condition that was not met, in the wording of the regulations. */
  maengel: string[];
}

export interface Gesamtergebnis {
  module: Partial<Record<Modul, number>>;
  durchschnitt: number | null;
  alleBestanden: boolean;
  vollstaendig: boolean;
  /** Set only where the level is certified as one examination — A2. */
  gesamt: GesamtWertung | null;
}

const ALLE_MODULE = ['lesen', 'hoeren', 'schreiben', 'sprechen'] as const;

/**
 * Combine module scores.
 *
 * At B1 and B2 the modules are certified separately, so there is no single
 * overall pass: a candidate passes each module or does not, and the average is
 * reported for orientation only.
 *
 * At A2 the opposite holds. The examination is one certificate, and passing it
 * requires all three of the published conditions at once — the total, the floor
 * across the written parts, and the floor in Sprechen. A candidate can clear
 * 60 overall and still fail on Sprechen alone, so the conditions are reported
 * individually rather than collapsed into one number.
 */
export function gesamtergebnis(
  module: Partial<Record<Modul, number>>,
  stufe: Stufe = 'B1',
): Gesamtergebnis {
  const werte = Object.values(module).filter((v): v is number => typeof v === 'number');
  const vollstaendig = ALLE_MODULE.every((m) => typeof module[m] === 'number');
  const regel = BEWERTUNG[stufe].gesamt;

  const durchschnitt = vollstaendig
    ? Math.round(werte.reduce((a, b) => a + b, 0) / werte.length)
    : null;

  if (!regel) {
    return {
      module,
      durchschnitt,
      alleBestanden: vollstaendig && werte.every(bestanden),
      vollstaendig,
      gesamt: null,
    };
  }

  // The factor converts raw part scores to the certificate's scale, and only
  // the total is rounded — a part on its own is never rounded at A1, because
  // the regulations add first and round afterwards.
  const summe = (module_: readonly Modul[]) =>
    module_.reduce((a, m) => a + (module[m] ?? 0) * regel.faktor, 0);

  const glaetten = (wert: number) => (regel.runden ? Math.round(wert) : runde(wert));

  const punkte = glaetten(summe(ALLE_MODULE));
  const schriftlich = regel.schriftlich ? glaetten(summe(regel.schriftlich.module)) : 0;
  const muendlich = regel.muendlich
    ? glaetten((module[regel.muendlich.modul] ?? 0) * regel.faktor)
    : 0;

  const maengel: string[] = [];
  if (punkte < regel.grenze) {
    maengel.push(`unter ${regel.grenze} von ${regel.punkte} Punkten insgesamt`);
  }
  if (regel.schriftlich && schriftlich < regel.schriftlich.grenze) {
    maengel.push(
      `unter ${regel.schriftlich.grenze} von ${regel.schriftlich.punkte} Punkten ` +
        'in Lesen, Hören und Schreiben zusammen',
    );
  }
  if (regel.muendlich && muendlich < regel.muendlich.grenze) {
    maengel.push(
      `unter ${regel.muendlich.grenze} von ${regel.muendlich.punkte} Punkten im Sprechen`,
    );
  }

  const geschafft = vollstaendig && maengel.length === 0;

  return {
    module,
    durchschnitt,
    alleBestanden: geschafft,
    vollstaendig,
    gesamt: {
      punkte,
      schriftlich,
      muendlich,
      bestanden: geschafft,
      maengel,
    },
  };
}

/** Quarter points are real at A2; float noise from summing them is not. */
function runde(wert: number): number {
  return Math.round(wert * 100) / 100;
}
