/**
 * Scoring for the objectively-marked modules.
 *
 * Reading and listening each contain 30 items worth one point apiece. That raw
 * score is converted to a 100-point scale, and 60 points is the pass mark.
 * Writing and speaking are marked by a human against published criteria, so
 * this module only carries their maxima and combines a mark once one exists.
 *
 * Shared by the web app and the server so a result cannot be computed two
 * different ways depending on where it was calculated.
 */

export const ITEMS_PRO_MODUL = 30;
export const PUNKTE_PRO_MODUL = 100;
export const BESTEHENSGRENZE = 60;

export type Modul = 'lesen' | 'hoeren' | 'schreiben' | 'sprechen';
export type Note =
  | 'sehr gut'
  | 'gut'
  | 'befriedigend'
  | 'ausreichend'
  | 'nicht bestanden';

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
 * Convert a raw item count to the 100-point scale.
 *
 * 30 items do not divide 100 evenly, so every conversion is a rounding
 * decision. Round half up on the exact 10/3 ratio: 18/30 becomes 60 and passes,
 * 17/30 becomes 57 and does not. Getting this wrong moves the pass boundary.
 */
export function rohZuPunkten(
  richtig: number,
  gesamt: number = ITEMS_PRO_MODUL,
): number {
  if (gesamt <= 0) return 0;
  const geklemmt = Math.max(0, Math.min(richtig, gesamt));
  return Math.round((geklemmt * PUNKTE_PRO_MODUL) / gesamt);
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
  note: Note;
  bestanden: boolean;
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
  const punkte = rohZuPunkten(richtig, items.length || ITEMS_PRO_MODUL);

  return {
    modul,
    richtig,
    gesamt: items.length,
    punkte,
    note: note(punkte),
    bestanden: bestanden(punkte),
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

export interface Gesamtergebnis {
  module: Partial<Record<Modul, number>>;
  durchschnitt: number | null;
  alleBestanden: boolean;
  vollstaendig: boolean;
}

/**
 * Combine module scores.
 *
 * The modules are certified separately, so there is no single overall pass:
 * a candidate passes each module or does not. The average is reported for
 * orientation only, and only once all four marks exist.
 */
export function gesamtergebnis(
  module: Partial<Record<Modul, number>>,
): Gesamtergebnis {
  const werte = Object.values(module).filter(
    (v): v is number => typeof v === 'number',
  );
  const vollstaendig = (['lesen', 'hoeren', 'schreiben', 'sprechen'] as const).every(
    (m) => typeof module[m] === 'number',
  );

  return {
    module,
    durchschnitt: vollstaendig
      ? Math.round(werte.reduce((a, b) => a + b, 0) / werte.length)
      : null,
    alleBestanden: vollstaendig && werte.every(bestanden),
    vollstaendig,
  };
}
