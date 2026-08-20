import { describe, expect, it } from 'vitest';
import {
  BESTEHENSGRENZE,
  bestanden,
  bewerteModul,
  gesamtergebnis,
  note,
  rohZuPunkten,
  schwachstellen,
  type Schluessel,
} from './scoring';

describe('rohZuPunkten', () => {
  it('maps the extremes exactly', () => {
    expect(rohZuPunkten(0)).toBe(0);
    expect(rohZuPunkten(30)).toBe(100);
  });

  it('puts the pass boundary at 18 of 30', () => {
    // The boundary is the number that matters most in the whole codebase:
    // 18 correct must pass, 17 must not.
    expect(rohZuPunkten(17)).toBe(57);
    expect(rohZuPunkten(18)).toBe(60);
    expect(bestanden(rohZuPunkten(17))).toBe(false);
    expect(bestanden(rohZuPunkten(18))).toBe(true);
  });

  it('clamps out-of-range input rather than extrapolating', () => {
    expect(rohZuPunkten(-3)).toBe(0);
    expect(rohZuPunkten(45)).toBe(100);
  });

  it('never returns NaN for an empty module', () => {
    expect(rohZuPunkten(0, 0)).toBe(0);
  });
});

describe('note', () => {
  it('is inclusive at every band floor', () => {
    expect(note(100)).toBe('sehr gut');
    expect(note(90)).toBe('sehr gut');
    expect(note(89)).toBe('gut');
    expect(note(80)).toBe('gut');
    expect(note(79)).toBe('befriedigend');
    expect(note(70)).toBe('befriedigend');
    expect(note(69)).toBe('ausreichend');
    expect(note(BESTEHENSGRENZE)).toBe('ausreichend');
    expect(note(59)).toBe('nicht bestanden');
    expect(note(0)).toBe('nicht bestanden');
  });
});

function schluesselFuer(
  modul: string,
  loesungen: Record<number, string>,
  teilVon: (nr: number) => number = () => 1,
): Record<string, Schluessel> {
  return Object.fromEntries(
    Object.entries(loesungen).map(([nr, loesung]) => [
      `${modul}-${nr}`,
      { loesung, teil: teilVon(Number(nr)), kompetenz: 'detailverstehen' },
    ]),
  );
}

describe('bewerteModul', () => {
  const keys = schluesselFuer('lesen', {
    1: 'richtig',
    2: 'falsch',
    3: 'a',
    4: 'b',
  });

  it('marks a perfect paper', () => {
    const r = bewerteModul('lesen', { 1: 'richtig', 2: 'falsch', 3: 'a', 4: 'b' }, keys);
    expect(r.richtig).toBe(4);
    expect(r.punkte).toBe(100);
    expect(r.bestanden).toBe(true);
  });

  it('scores unanswered items as wrong without shrinking the denominator', () => {
    const r = bewerteModul('lesen', { 1: 'richtig' }, keys);
    expect(r.richtig).toBe(1);
    expect(r.gesamt).toBe(4);
    expect(r.items.filter((i) => i.gegeben === null)).toHaveLength(3);
  });

  it('ignores case and stray whitespace in an answer', () => {
    const r = bewerteModul('lesen', { 1: '  RICHTIG ', 3: 'A' }, keys);
    expect(r.richtig).toBe(2);
  });

  it('does not mark items belonging to another module', () => {
    const gemischt = { ...keys, ...schluesselFuer('hoeren', { 1: 'richtig' }) };
    const r = bewerteModul('lesen', { 1: 'richtig' }, gemischt);
    expect(r.gesamt).toBe(4);
  });

  it('breaks the score down by part', () => {
    const proTeil = schluesselFuer('lesen', { 1: 'a', 2: 'b', 3: 'c' }, (nr) =>
      nr <= 2 ? 1 : 2,
    );
    const r = bewerteModul('lesen', { 1: 'a', 2: 'x', 3: 'c' }, proTeil);
    expect(r.proTeil).toEqual([
      { teil: 1, richtig: 1, gesamt: 2 },
      { teil: 2, richtig: 1, gesamt: 1 },
    ]);
  });

  it('returns items in ascending order regardless of key order', () => {
    const r = bewerteModul('lesen', {}, keys);
    expect(r.items.map((i) => i.nr)).toEqual([1, 2, 3, 4]);
  });
});

describe('schwachstellen', () => {
  it('ranks the weakest skill first and omits skills with no losses', () => {
    const keys: Record<string, Schluessel> = {
      'lesen-1': { loesung: 'a', teil: 1, kompetenz: 'detailverstehen' },
      'lesen-2': { loesung: 'b', teil: 1, kompetenz: 'detailverstehen' },
      'lesen-3': { loesung: 'c', teil: 2, kompetenz: 'zuordnen' },
      'lesen-4': { loesung: 'a', teil: 2, kompetenz: 'zuordnen' },
    };
    // Both "zuordnen" items wrong, one of two "detailverstehen" wrong.
    const r = bewerteModul('lesen', { 1: 'a', 2: 'x', 3: 'x', 4: 'x' }, keys);
    const schwach = schwachstellen([r]);

    expect(schwach[0]).toMatchObject({ kompetenz: 'zuordnen', verloren: 2, quote: 1 });
    expect(schwach[1]).toMatchObject({ kompetenz: 'detailverstehen', verloren: 1 });
  });

  it('is empty when nothing was lost', () => {
    const keys = schluesselFuer('lesen', { 1: 'a' });
    expect(schwachstellen([bewerteModul('lesen', { 1: 'a' }, keys)])).toEqual([]);
  });
});

describe('gesamtergebnis', () => {
  it('withholds an average until all four modules are marked', () => {
    const teil = gesamtergebnis({ lesen: 80, hoeren: 70 });
    expect(teil.vollstaendig).toBe(false);
    expect(teil.durchschnitt).toBeNull();
    expect(teil.alleBestanden).toBe(false);
  });

  it('averages once every module has a mark', () => {
    const voll = gesamtergebnis({ lesen: 80, hoeren: 70, schreiben: 65, sprechen: 75 });
    expect(voll.vollstaendig).toBe(true);
    expect(voll.durchschnitt).toBe(73);
    expect(voll.alleBestanden).toBe(true);
  });

  it('fails overall if a single module is below the pass mark', () => {
    // Modules are certified separately: a strong average cannot rescue one
    // module that fell short.
    const voll = gesamtergebnis({
      lesen: 100,
      hoeren: 100,
      schreiben: 100,
      sprechen: 59,
    });
    expect(voll.alleBestanden).toBe(false);
    expect(voll.durchschnitt).toBe(90);
  });
});

/**
 * A2 is the level that breaks the shape the other two share: 25 points per
 * part, quarter-point exact, and one verdict for the whole examination rather
 * than four independent ones. These assert the published rule, not the code.
 */
describe('A2 scoring', () => {
  it('multiplies 20 raw Messpunkte by exactly 1.25', () => {
    expect(rohZuPunkten(20, 20, 'A2')).toBe(25);
    expect(rohZuPunkten(16, 20, 'A2')).toBe(20);
    expect(rohZuPunkten(0, 20, 'A2')).toBe(0);
  });

  it('keeps the quarter points instead of rounding them away', () => {
    // 17 x 1.25 is 21.25. Rounding to whole points would quietly take a
    // quarter of a mark off a candidate on every part of every paper.
    expect(rohZuPunkten(17, 20, 'A2')).toBe(21.25);
    expect(rohZuPunkten(13, 20, 'A2')).toBe(16.25);
  });

  it('leaves B1 and B2 rounding exactly as they were', () => {
    expect(rohZuPunkten(18, 30, 'B1')).toBe(60);
    expect(rohZuPunkten(17, 30, 'B1')).toBe(57);
    expect(rohZuPunkten(18, 30, 'B2')).toBe(60);
  });

  it('gives a module no verdict of its own', () => {
    const keys = schluesselFuer('lesen', { 1: 'a', 2: 'b', 3: 'c', 4: 'a' });
    const erg = bewerteModul('lesen', { 1: 'a', 2: 'b', 3: 'c', 4: 'a' }, keys, 'A2');
    expect(erg.maximum).toBe(25);
    expect(erg.punkte).toBe(25);
    // Full marks, and still no "bestanden": at A2 that is not a fact about one
    // answer sheet.
    expect(erg.bestanden).toBeNull();
    expect(erg.note).toBeNull();
  });

  it('still grades and certifies a B1 module on its own', () => {
    const keys = schluesselFuer('lesen', { 1: 'a', 2: 'b', 3: 'c', 4: 'a' });
    const erg = bewerteModul('lesen', { 1: 'a', 2: 'b', 3: 'c', 4: 'a' }, keys, 'B1');
    expect(erg.maximum).toBe(100);
    expect(erg.bestanden).toBe(true);
    expect(erg.note).toBe('sehr gut');
  });

  it('passes only when all three published conditions hold', () => {
    const voll = gesamtergebnis(
      { lesen: 20, hoeren: 20, schreiben: 15, sprechen: 16 },
      'A2',
    );
    expect(voll.gesamt?.punkte).toBe(71);
    expect(voll.gesamt?.schriftlich).toBe(55);
    expect(voll.gesamt?.muendlich).toBe(16);
    expect(voll.gesamt?.bestanden).toBe(true);
    expect(voll.gesamt?.maengel).toEqual([]);
    expect(voll.alleBestanden).toBe(true);
  });

  it('fails on Sprechen alone even with a comfortable total', () => {
    // 25+25+21 = 71 written, well past 45, and 85 overall — but 14 in Sprechen
    // is under the floor of 15, and that fails the whole examination.
    const voll = gesamtergebnis(
      { lesen: 25, hoeren: 25, schreiben: 21, sprechen: 14 },
      'A2',
    );
    expect(voll.gesamt?.punkte).toBe(85);
    expect(voll.gesamt?.bestanden).toBe(false);
    expect(voll.gesamt?.maengel).toHaveLength(1);
    expect(voll.gesamt?.maengel[0]).toContain('Sprechen');
  });

  it('fails on the written floor even when the total is met', () => {
    // 60 overall exactly, but only 39 of 75 written: still not a pass.
    const voll = gesamtergebnis(
      { lesen: 13, hoeren: 13, schreiben: 13, sprechen: 21 },
      'A2',
    );
    expect(voll.gesamt?.punkte).toBe(60);
    expect(voll.gesamt?.schriftlich).toBe(39);
    expect(voll.gesamt?.bestanden).toBe(false);
    expect(voll.gesamt?.maengel[0]).toContain('Lesen, Hören und Schreiben');
  });

  it('adds quarter points without float noise', () => {
    const voll = gesamtergebnis(
      { lesen: 21.25, hoeren: 18.75, schreiben: 16.25, sprechen: 17.5 },
      'A2',
    );
    expect(voll.gesamt?.punkte).toBe(73.75);
    expect(voll.gesamt?.schriftlich).toBe(56.25);
  });

  it('reports no whole-examination verdict at B1 or B2', () => {
    expect(gesamtergebnis({ lesen: 80 }, 'B1').gesamt).toBeNull();
    expect(gesamtergebnis({ lesen: 80 }, 'B2').gesamt).toBeNull();
  });
});
