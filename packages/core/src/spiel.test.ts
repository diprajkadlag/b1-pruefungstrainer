import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import {
  ARTIKEL,
  KATEGORIEN,
  LEBEN,
  RUNDE_LAENGE,
  alleFragen,
  antworten,
  fettTeil,
  fragenArtikel,
  fragenBauen,
  fragenBedeutung,
  fragenFunktion,
  fragenGegenteil,
  fragenPhrasenluecke,
  fragenPlural,
  fragenRegel,
  fragenTabelle,
  fragenVerbform,
  fragenVerbluecke,
  istRichtig,
  kategorieTitel,
  leererFortschritt,
  leererStand,
  lesepause,
  mische,
  naechsteBox,
  ohneFett,
  optionenBauen,
  pluralKandidaten,
  punkteFuer,
  PAUSE_MAX,
  rundeBauen,
  spielSchluessel,
  szeneFuer,
  umlauten,
  urteil,
  verschraenken,
  zufall,
  type Frage,
  type Kategorie,
} from './spiel.js';
import type { Lernhilfe, Stufe } from './types.js';

/**
 * The engine is tested against the real cheat sheets, not only a fixture.
 *
 * A generator that works on a hand-made object and produces nonsense on the
 * shipped content is worse than no generator, and that is not a hypothetical:
 * the first `fragenRegel` assumed every grammar table put the rule in its last
 * column, which is true of one table and false of most, so it asked which
 * "rule" applied to `den/dem/des Kunden` and offered four English glosses. A
 * fixture built to match the code would have agreed with it happily.
 */

const wurzel = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

function echteLernhilfe(ordner: string): Lernhilfe {
  const lh = JSON.parse(
    readFileSync(wurzel(`content/lernhilfe/${ordner}lernhilfe.json`), 'utf-8'),
  );
  lh.wortschatz = JSON.parse(
    readFileSync(wurzel(`content/lernhilfe/${ordner}wortschatz.json`), 'utf-8'),
  );
  return lh as Lernhilfe;
}

const ORDNER: Record<Stufe, string> = { A1: 'a1/', A2: 'a2/', B1: '', B2: 'b2/' };
const STUFEN_LISTE = Object.keys(ORDNER) as Stufe[];
const ECHT = Object.fromEntries(
  STUFEN_LISTE.map((s) => [s, echteLernhilfe(ORDNER[s])]),
) as Record<Stufe, Lernhilfe>;

const rnd = () => zufall(12345);

// --- helpers ----------------------------------------------------------------

describe('ohneFett / fettTeil', () => {
  it('strips and extracts the content markup', () => {
    expect(ohneFett('Ich **bin** hier.')).toBe('Ich bin hier.');
    expect(fettTeil('Ich **bin** hier.')).toBe('bin');
  });

  it('reports no bold rather than an empty string', () => {
    expect(fettTeil('nichts hervorgehoben')).toBeNull();
    expect(ohneFett('nichts hervorgehoben')).toBe('nichts hervorgehoben');
  });

  it('strips every marked span, not just the first', () => {
    expect(ohneFett('**a** und **b**')).toBe('a und b');
  });
});

describe('zufall', () => {
  it('is reproducible from a seed', () => {
    const a = Array.from({ length: 8 }, zufall(99));
    const b = Array.from({ length: 8 }, zufall(99));
    expect(a).toEqual(b);
  });

  it('differs between seeds and stays inside [0,1)', () => {
    const a = Array.from({ length: 8 }, zufall(1));
    const b = Array.from({ length: 8 }, zufall(2));
    expect(a).not.toEqual(b);
    for (const x of [...a, ...b]) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('survives a zero seed instead of locking at zero', () => {
    // xorshift is a fixed point at 0: a bad seed would return 0 forever and
    // every "shuffle" in the game would be the identity.
    const werte = Array.from({ length: 5 }, zufall(0));
    expect(new Set(werte).size).toBeGreaterThan(1);
  });
});

describe('mische', () => {
  it('keeps every element exactly once', () => {
    const ein = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(mische(ein, rnd()).sort((a, b) => a - b)).toEqual(ein);
  });

  it('does not mutate its input', () => {
    const ein = [1, 2, 3, 4];
    mische(ein, rnd());
    expect(ein).toEqual([1, 2, 3, 4]);
  });
});

describe('optionenBauen', () => {
  it('always contains the answer', () => {
    const o = optionenBauen('richtig', ['a', 'b', 'c', 'd'], 4, rnd());
    expect(o).toContain('richtig');
    expect(o).toHaveLength(4);
  });

  it('never offers the answer twice', () => {
    // The worst possible bug in a quiz: two identical options, one of them
    // marked wrong.
    const o = optionenBauen('gut', ['gut', 'GUT', ' gut ', 'schlecht', 'neu'], 4, rnd());
    expect(o.filter((x) => x.trim().toLowerCase() === 'gut')).toHaveLength(1);
  });

  it('drops duplicates and blanks from the distractor pool', () => {
    const o = optionenBauen('x', ['a', 'a', '', '   ', 'b'], 4, rnd());
    expect([...new Set(o)]).toHaveLength(o.length);
    expect(o).not.toContain('');
  });

  it('returns fewer options rather than padding when the pool is thin', () => {
    expect(optionenBauen('x', ['y'], 4, rnd())).toHaveLength(2);
    expect(optionenBauen('x', [], 4, rnd())).toEqual(['x']);
  });
});

describe('umlauten', () => {
  it('umlauts the last a/o/u of the stem', () => {
    expect(umlauten('Mann')).toBe('Männ');
    expect(umlauten('Sohn')).toBe('Söhn');
    expect(umlauten('Zug')).toBe('Züg');
    expect(umlauten('Tochter')).toBe('Töchter');
  });

  it('treats au as one vowel', () => {
    // "Fraü" is not a sequence German spells, so it would give the answer away.
    expect(umlauten('Frau')).toBe('Fräu');
    expect(umlauten('Haus')).toBe('Häus');
    expect(umlauten('Baum')).toBe('Bäum');
  });

  it('handles the capital that starts every German noun', () => {
    expect(umlauten('Apfel')).toBe('Äpfel');
    expect(umlauten('Ofen')).toBe('Öfen');
  });

  it('leaves a word with nothing to umlaut alone', () => {
    expect(umlauten('Küche')).toBe('Küche');
    expect(umlauten('')).toBe('');
  });
});

describe('pluralKandidaten', () => {
  it('offers only shapes German could spell', () => {
    // A stem already ending in -e never takes a second one.
    const k = pluralKandidaten('Name');
    expect(k).toContain('die Namen');
    expect(k).not.toContain('die Namee');
    expect(k).not.toContain('die Nameer');
  });

  it('includes the umlaut forms learners really confuse', () => {
    const k = pluralKandidaten('Mann');
    expect(k).toContain('die Männer');
    expect(k).toContain('die Manner');
  });

  it('never repeats a candidate', () => {
    const k = pluralKandidaten('Kind');
    expect([...new Set(k)]).toHaveLength(k.length);
  });
});

describe('szeneFuer', () => {
  it('maps a topic to a picture', () => {
    expect(szeneFuer('Person und Familie')).toBe('person');
    expect(szeneFuer('Wohnen und Umgebung')).toBe('haus');
    expect(szeneFuer('Essen und Trinken')).toBe('essen');
  });

  it('falls back rather than throwing on an unknown topic', () => {
    expect(szeneFuer('völlig unbekanntes Thema')).toBe('lernen');
  });
});

// --- the generators, against the shipped content ----------------------------

describe.each(STUFEN_LISTE)('%s generators', (stufe) => {
  const lh = ECHT[stufe];

  it('builds an article question for every noun, colour anchor included', () => {
    const fragen = fragenArtikel(lh);
    const nomen = lh.wortschatz.nomen.reduce((s, g) => s + g.eintraege.length, 0);
    expect(fragen).toHaveLength(nomen);
    for (const f of fragen) {
      expect(f.optionen).toEqual([...ARTIKEL]);
      expect(ARTIKEL).toContain(f.loesung);
      expect(f.artikel).toBe(f.loesung);
    }
  });

  it('builds plural questions with at least three options', () => {
    const fragen = fragenPlural(lh, rnd());
    expect(fragen.length).toBeGreaterThan(20);
    for (const f of fragen) {
      expect(f.optionen.length).toBeGreaterThanOrEqual(3);
      expect(f.optionen).toContain(f.loesung);
    }
  });

  it('draws meaning distractors from the same topic group', () => {
    const fragen = fragenBedeutung(lh, rnd());
    expect(fragen.length).toBeGreaterThan(20);
    const gruppen = new Map(
      lh.wortschatz.nomen.map((g) => [g.gruppe, g.eintraege.map((e) => e.en)]),
    );
    for (const f of fragen)
      for (const o of f.optionen) expect(gruppen.get(f.hinweis)).toContain(o);
  });

  it('pairs every adjective with its opposite', () => {
    const fragen = fragenGegenteil(lh, rnd());
    expect(fragen).toHaveLength(lh.wortschatz.adjektive.length);
    for (const f of fragen) expect(f.optionen).toContain(f.loesung);
  });

  it('never offers a second correct opposite as a wrong answer', () => {
    // "alt" is listed twice at A1 — against "neu" for things and "jung" for
    // people — and both are right. Offering one as a distractor for the other
    // marks a correct answer wrong, which is the fastest way to lose a
    // learner's trust in the game.
    const nachWort = new Map<string, string[]>();
    for (const a of lh.wortschatz.adjektive)
      nachWort.set(a.wort, [...(nachWort.get(a.wort) ?? []), a.gegenteil]);

    for (const f of fragenGegenteil(lh, rnd())) {
      const wort = f.frage.match(/„(.+?)“/)![1]!;
      const auchRichtig = (nachWort.get(wort) ?? []).filter((g) => g !== f.loesung);
      for (const g of auchRichtig) expect(f.optionen).not.toContain(g);
    }
  });

  it('asks the Perfekt only of irregular verbs', () => {
    const fragen = fragenVerbform(lh, rnd());
    const unregelmaessig = lh.wortschatz.verben
      .flatMap((g) => g.eintraege)
      .filter((v) => v.unreg);
    expect(fragen).toHaveLength(unregelmaessig.length);
    expect(fragen.length).toBeGreaterThan(10);
  });

  it('puts the gap on the form the example was written to show', () => {
    for (const f of fragenVerbluecke(lh, rnd())) {
      expect(f.vorlage).toContain('____');
      expect(f.vorlage).not.toContain('**');
      expect(f.optionen).toContain(f.loesung);
      expect(f.optionen.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('builds table gaps whose distractors come from the same table', () => {
    const fragen = fragenTabelle(lh, rnd());
    expect(fragen.length).toBeGreaterThan(10);
    const proTabelle = new Map(
      lh.grammatik.map((g) => [
        g.thema,
        new Set(g.tabelle.zeilen.flat().map(fettTeil).filter(Boolean) as string[]),
      ]),
    );
    for (const f of fragen) {
      expect(f.vorlage).toContain('____');
      for (const o of f.optionen) expect(proTabelle.get(f.hinweis)).toContain(o);
    }
  });

  it('asks for a rule only where the header names both columns', () => {
    // The regression that mattered: a table with no Beispiel column, or whose
    // explaining column is an English gloss, must produce nothing at all.
    for (const f of fragenRegel(lh, rnd())) {
      const tabelle = lh.grammatik.find((g) => g.thema === f.hinweis)!;
      const kopf = tabelle.tabelle.kopf.map((k) => k.toLowerCase());
      expect(kopf.some((k) => /^(beispiel|im satz|satz)/.test(k))).toBe(true);
      expect(f.vorlage!.length).toBeGreaterThanOrEqual(8);
      for (const o of f.optionen) expect(o.length).toBeLessThanOrEqual(60);
    }
  });

  it('never asks for a rule that is really an English gloss', () => {
    const englisch = lh.grammatik.filter(
      (g) => g.tabelle.kopf.some((k) => /englisch/i.test(k)) && g.tabelle.kopf.length < 4,
    );
    const themen = new Set(fragenRegel(lh, rnd()).map((f) => f.hinweis));
    for (const g of englisch) expect(themen.has(g.thema)).toBe(false);
  });

  it('asks what a phrase is for, with real functions as distractors', () => {
    const funktionen = new Set(
      lh.redemittel.flatMap((b) => b.gruppen.map((g) => g.funktion)),
    );
    for (const f of fragenFunktion(lh, rnd())) {
      expect(funktionen).toContain(f.loesung);
      for (const o of f.optionen) expect(funktionen).toContain(o);
    }
  });

  it('blanks a content word, never a placeholder', () => {
    for (const f of fragenPhrasenluecke(lh, rnd())) {
      expect(f.vorlage).toContain('____');
      expect(f.loesung).not.toContain('…');
      expect(f.loesung.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('offers word-order chips that rebuild the phrase exactly', () => {
    const fragen = fragenBauen(lh, rnd());
    expect(fragen.length).toBeGreaterThan(5);
    for (const f of fragen) {
      expect([...f.optionen].sort()).toEqual([...f.loesung.split(' ')].sort());
      expect(f.optionen.length).toBeGreaterThanOrEqual(4);
      expect(f.optionen.length).toBeLessThanOrEqual(8);
      // Chip checking is positional, so a repeated word would be ambiguous.
      expect(new Set(f.optionen.map((o) => o.toLowerCase())).size).toBe(
        f.optionen.length,
      );
    }
  });
});

// --- invariants that must hold for every question at every level ------------

describe.each(STUFEN_LISTE)('%s question pool', (stufe) => {
  const pool = alleFragen(ECHT[stufe], 'gemischt', 7);

  it('is large enough that rounds do not repeat immediately', () => {
    expect(pool.length).toBeGreaterThan(RUNDE_LAENGE * 10);
  });

  it('gives every question an answer that is among its options', () => {
    for (const f of pool) {
      expect(f.optionen).toContain(
        f.art === 'bauen' ? f.loesung.split(' ')[0]! : f.loesung,
      );
    }
  });

  it('never leaves content markup on screen', () => {
    for (const f of pool) {
      expect(f.frage).not.toContain('**');
      expect(f.vorlage ?? '').not.toContain('**');
      for (const o of f.optionen) expect(o).not.toContain('**');
    }
  });

  it('gives every question a reason to show afterwards', () => {
    for (const f of pool) expect(f.erklaerung.trim().length).toBeGreaterThan(0);
  });

  it('uses ids that are unique, so Leitner boxes cannot collide', () => {
    const ids = pool.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(KATEGORIEN)('offers enough %s questions for a full round', (kategorie) => {
    const teil = alleFragen(ECHT[stufe], kategorie, 7);
    expect(teil.length).toBeGreaterThanOrEqual(RUNDE_LAENGE);
    for (const f of teil) expect(f.kategorie).toBe(kategorie);
  });

  it('splits cleanly: the three categories add up to the mixed pool', () => {
    const summe = KATEGORIEN.reduce(
      (s, k) => s + alleFragen(ECHT[stufe], k, 7).length,
      0,
    );
    expect(summe).toBe(pool.length);
  });
});

// --- rounds -----------------------------------------------------------------

describe('rundeBauen', () => {
  const pool = alleFragen(ECHT.B1, 'gemischt', 7);

  it('deals a full round', () => {
    expect(rundeBauen(pool, leererFortschritt(), 5)).toHaveLength(RUNDE_LAENGE);
  });

  it('is reproducible from its seed', () => {
    const a = rundeBauen(pool, leererFortschritt(), 5).map((f) => f.id);
    const b = rundeBauen(pool, leererFortschritt(), 5).map((f) => f.id);
    expect(a).toEqual(b);
  });

  it('never deals the same question twice in one round', () => {
    const ids = rundeBauen(pool, leererFortschritt(), 11).map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts missed questions first', () => {
    // Everything is in box 5 (long since learnt) except three in box 1.
    const boxen: Record<string, number> = {};
    for (const f of pool) boxen[f.id] = 5;
    const faellig = pool.slice(20, 23).map((f) => f.id);
    for (const id of faellig) boxen[id] = 1;

    const runde = rundeBauen(pool, { ...leererFortschritt(), boxen }, 5).map((f) => f.id);
    for (const id of faellig) expect(runde).toContain(id);
  });

  it('copes with a pool smaller than a round', () => {
    const klein = pool.slice(0, 4);
    expect(rundeBauen(klein, leererFortschritt(), 5)).toHaveLength(4);
  });
});

describe('verschraenken', () => {
  it('avoids two questions of the same kind in a row where it can', () => {
    const mach = (art: Frage['art'], n: number): Frage[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `${art}${i}`,
        art,
        kategorie: 'wortschatz' as const,
        hinweis: '',
        frage: '',
        optionen: [],
        loesung: '',
        erklaerung: '',
        szene: 'lernen' as const,
      }));
    const gemischt = verschraenken(
      [...mach('artikel', 4), ...mach('plural', 4), ...mach('bedeutung', 4)],
      rnd(),
    );
    expect(gemischt).toHaveLength(12);
    let nachbarn = 0;
    for (let i = 1; i < gemischt.length; i++)
      if (gemischt[i]!.art === gemischt[i - 1]!.art) nachbarn++;
    expect(nachbarn).toBe(0);
  });

  it('still returns everything when only one kind is left', () => {
    const eins: Frage[] = Array.from({ length: 3 }, (_, i) => ({
      id: `a${i}`,
      art: 'artikel' as const,
      kategorie: 'wortschatz' as const,
      hinweis: '',
      frage: '',
      optionen: [],
      loesung: '',
      erklaerung: '',
      szene: 'lernen' as const,
    }));
    expect(verschraenken(eins, rnd())).toHaveLength(3);
    expect(verschraenken([], rnd())).toHaveLength(0);
  });
});

// --- Leitner and scoring ----------------------------------------------------

describe('naechsteBox', () => {
  it('promotes a hit one box at a time, up to five', () => {
    expect(naechsteBox(0, true)).toBe(1);
    expect(naechsteBox(1, true)).toBe(2);
    expect(naechsteBox(4, true)).toBe(5);
    expect(naechsteBox(5, true)).toBe(5);
  });

  it('sends a miss all the way back', () => {
    // Not down one step: a wrong answer means the memory was not there, and
    // the schedule should stop pretending otherwise.
    expect(naechsteBox(5, false)).toBe(1);
    expect(naechsteBox(2, false)).toBe(1);
  });
});

describe('punkteFuer', () => {
  it('rewards a streak and caps the multiplier at five', () => {
    expect(punkteFuer(1)).toBe(10);
    expect(punkteFuer(3)).toBe(30);
    expect(punkteFuer(5)).toBe(50);
    expect(punkteFuer(9)).toBe(50);
  });

  it('treats a zero streak as the first answer', () => {
    expect(punkteFuer(0)).toBe(10);
  });
});

describe('antworten', () => {
  it('builds a streak and remembers the best one', () => {
    let s = leererStand();
    s = antworten(s, true);
    s = antworten(s, true);
    s = antworten(s, true);
    expect(s.serie).toBe(3);
    expect(s.besteSerie).toBe(3);
    expect(s.punkte).toBe(10 + 20 + 30);
    expect(s.richtig).toBe(3);
    expect(s.leben).toBe(LEBEN);
  });

  it('breaks the streak and costs a life on a miss, keeping the best', () => {
    let s = leererStand();
    s = antworten(s, true);
    s = antworten(s, true);
    s = antworten(s, false);
    expect(s.serie).toBe(0);
    expect(s.besteSerie).toBe(2);
    expect(s.leben).toBe(LEBEN - 1);
    expect(s.falsch).toBe(1);
    // A miss never takes points away — losing ground is discouraging in a way
    // that does not help anyone learn.
    expect(s.punkte).toBe(30);
  });

  it('does not mutate the stand it was given', () => {
    const s = leererStand();
    antworten(s, true);
    expect(s.punkte).toBe(0);
    expect(s.serie).toBe(0);
  });
});

describe('istRichtig', () => {
  const frage: Frage = {
    id: 'x',
    art: 'bauen',
    kategorie: 'redemittel',
    hinweis: '',
    frage: '',
    optionen: [],
    loesung: 'Vielen Dank für Ihre Aufmerksamkeit.',
    erklaerung: '',
    szene: 'lernen',
  };

  it('ignores case and stray whitespace', () => {
    expect(istRichtig(frage, '  vielen   dank für ihre aufmerksamkeit. ')).toBe(true);
  });

  it('still rejects the wrong order', () => {
    expect(istRichtig(frage, 'Dank Vielen für Ihre Aufmerksamkeit.')).toBe(false);
  });
});

describe('urteil', () => {
  const stand = (u: Partial<ReturnType<typeof leererStand>>) => ({
    ...leererStand(),
    ...u,
  });

  it('says the round ended when the lives ran out', () => {
    expect(urteil(stand({ leben: 0, richtig: 4 }), 12).titel).toBe('Runde vorbei');
  });

  it('celebrates a clean sheet', () => {
    expect(urteil(stand({ richtig: 12 }), 12).titel).toBe('Alles richtig!');
  });

  it('grades the middle without scolding', () => {
    expect(urteil(stand({ richtig: 10 }), 12).titel).toBe('Starke Runde');
    const schwach = urteil(stand({ richtig: 3 }), 12);
    expect(schwach.titel).toBe('Geschafft');
    expect(schwach.text).toMatch(/nächsten Runde/);
  });

  it('does not divide by zero on an empty round', () => {
    expect(urteil(leererStand(), 0).titel).toBe('Geschafft');
  });
});

describe('lesepause', () => {
  it('gives a wrong answer longer than a right one', () => {
    const text = 'der Vorteil (advantage) — Plural: die Vorteile.';
    expect(lesepause(text, false)).toBeGreaterThan(lesepause(text, true));
  });

  it('scales with how much there is to read', () => {
    // The whole point: an article card carries seven words and a grammar-table
    // card carries thirty-five, so one fixed pause cannot serve both.
    const kurz = 'der Vorteil (advantage) — Plural: die Vorteile.';
    const lang = Array.from({ length: 35 }, (_, i) => `wort${i}`).join(' ');
    expect(lesepause(lang, true)).toBeGreaterThan(lesepause(kurz, true) * 2);
  });

  it('leaves a short card long enough to read it twice over', () => {
    // Seven words at any plausible reading speed is under three seconds.
    expect(
      lesepause('der Vorteil (advantage) — Plural: die Vorteile.', true),
    ).toBeGreaterThan(4000);
  });

  it('caps, because an auto-advance is a floor and not a reading test', () => {
    const sehrLang = Array.from({ length: 400 }, () => 'wort').join(' ');
    expect(lesepause(sehrLang, false)).toBe(PAUSE_MAX);
  });

  it('still pauses when there is nothing to read', () => {
    expect(lesepause('', true)).toBeGreaterThan(0);
    expect(lesepause('   ', true)).toBeGreaterThan(0);
  });
  it('is worth scaling: the real cards differ by more than fivefold', () => {
    // The justification for scaling at all, asserted against shipped content
    // rather than an assumption: an article card explains itself in about
    // seven words, a grammar-table card in about thirty-five.
    const laenge = (art: string) => {
      const treffer = alleFragen(ECHT.B1, 'gemischt', 7).filter((f) => f.art === art);
      const woerter = treffer.map((f) => f.erklaerung.trim().split(/\s+/).length);
      return woerter.reduce((a, b) => a + b, 0) / woerter.length;
    };
    expect(laenge('tabelle')).toBeGreaterThan(laenge('artikel') * 3);
    expect(lesepause('x '.repeat(35), true)).toBeGreaterThan(
      lesepause('x '.repeat(7), true) * 2,
    );
  });
});

describe('labels and keys', () => {
  it('names every category', () => {
    const alle: Kategorie[] = [...KATEGORIEN, 'gemischt'];
    for (const k of alle) expect(kategorieTitel(k).length).toBeGreaterThan(0);
    expect(kategorieTitel('gemischt')).toBe('Alles gemischt');
  });

  it('keys progress by level and category, so they never mix', () => {
    expect(spielSchluessel('A1', 'wortschatz')).not.toBe(
      spielSchluessel('A2', 'wortschatz'),
    );
    expect(spielSchluessel('B1', 'grammatik')).not.toBe(
      spielSchluessel('B1', 'redemittel'),
    );
    expect(spielSchluessel('B1', 'grammatik')).toContain('B1');
  });
});
