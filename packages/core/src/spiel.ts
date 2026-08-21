/**
 * Sprachschatz — the question engine behind the learning game.
 *
 * Everything here is pure: a Lernhilfe goes in, a deck of questions comes out.
 * The screen owns the animation and the noise; this file owns what is asked,
 * what counts as right, and what the learner is told afterwards. That split is
 * what makes the interesting part testable.
 *
 * The design follows what is actually known about remembering, rather than
 * what is easy to build:
 *
 *   - **Retrieval, never recognition alone.** Every question is an attempt to
 *     pull something out of memory. Re-reading a cheat sheet feels productive
 *     and is nearly worthless; being asked and struggling is what lasts.
 *   - **Distractors from the same drawer.** A wrong answer sampled at random is
 *     free marks — the learner rules it out on vibes without touching the
 *     memory. Every generator here draws its wrong answers from the *same
 *     group*: other forms of the same verb, other rows of the same table,
 *     other nouns from the same topic. That forces a real discrimination.
 *   - **Elaborated feedback.** Being told "wrong" teaches nothing. Every
 *     question carries the reason with it, so the correction lands while the
 *     attempt is still warm.
 *   - **Interleaving.** Questions of one kind in a block are answered by
 *     pattern rather than by knowing. A round deliberately shuffles kinds.
 *   - **Spacing.** `naechsteBox` implements a Leitner schedule: a miss drops
 *     an item to box 1 and it returns almost immediately; a hit promotes it
 *     and it goes quiet for longer.
 *
 * The one visual idea worth naming: **articles carry a colour**. der is blue,
 * die is red, das is green, everywhere in the game, always the same. A noun's
 * gender is arbitrary and has no rule worth learning, so it has to be stored
 * as a property of the word itself — and a second, non-verbal channel is the
 * cheapest way to make that stick.
 */

import type { Lernhilfe, Stufe } from './types.js';

// --- what the game is made of ----------------------------------------------

export type Kategorie = 'wortschatz' | 'grammatik' | 'redemittel' | 'gemischt';

export const KATEGORIEN: readonly Exclude<Kategorie, 'gemischt'>[] = [
  'wortschatz',
  'grammatik',
  'redemittel',
] as const;

/**
 * The kinds of question the engine can build. The name is shown to the learner
 * as a small label, so it doubles as a promise about what is being tested.
 */
export type FrageArt =
  | 'artikel'
  | 'plural'
  | 'bedeutung'
  | 'gegenteil'
  | 'verbform'
  | 'verbluecke'
  | 'tabelle'
  | 'regel'
  | 'funktion'
  | 'phrasenluecke'
  | 'bauen';

export type Artikel = 'der' | 'die' | 'das';

export const ARTIKEL: readonly Artikel[] = ['der', 'die', 'das'] as const;

export interface Frage {
  /** Stable across rounds, so the Leitner box can follow the item. */
  id: string;
  art: FrageArt;
  kategorie: Exclude<Kategorie, 'gemischt'>;
  /** Small line above the card: where this came from. */
  hinweis: string;
  /** The question itself. */
  frage: string;
  /** A sentence or row with a gap in it, if the question has one. */
  vorlage?: string;
  optionen: string[];
  loesung: string;
  /** Why — shown after answering, right or wrong. */
  erklaerung: string;
  /** Colour anchor. Present when the item has a grammatical gender. */
  artikel?: Artikel;
  /** Which scene to draw beside the card. */
  szene: Szene;
}

export type Szene =
  | 'person'
  | 'haus'
  | 'stadt'
  | 'arbeit'
  | 'zeit'
  | 'essen'
  | 'reise'
  | 'natur'
  | 'sprechen'
  | 'lernen';

/** Rough topical guess from a group name, used only to pick a picture. */
export function szeneFuer(text: string): Szene {
  const t = text.toLowerCase();
  const tabelle: [RegExp, Szene][] = [
    [/person|famili|körper|gefühl|mensch/, 'person'],
    [/wohn|haus|zuhause|möbel|zimmer/, 'haus'],
    [/stadt|verkehr|einkauf|geschäft|ort/, 'stadt'],
    [/arbeit|beruf|büro|schule|studium|geld/, 'arbeit'],
    [/zeit|datum|termin|tag|woche|monat/, 'zeit'],
    [/essen|trinken|lebensmittel|restaurant|küche/, 'essen'],
    [/reise|urlaub|verkehr|zug|unterwegs|land/, 'reise'],
    [/natur|wetter|umwelt|tier|garten/, 'natur'],
    [/sprech|sagen|gespräch|diskus|meinung|brief|schreiben/, 'sprechen'],
  ];
  for (const [muster, szene] of tabelle) if (muster.test(t)) return szene;
  return 'lernen';
}

// --- small helpers ----------------------------------------------------------

/** Content marks the decisive word with **…**; the game needs it both ways. */
export const ohneFett = (t: string): string => t.replace(/\*\*(.+?)\*\*/g, '$1');

export const fettTeil = (t: string): string | null =>
  t.match(/\*\*(.+?)\*\*/)?.[1] ?? null;

/**
 * A seeded generator, so a round can be reproduced exactly. Tests need that,
 * and so does anyone reporting "question 7 was wrong".
 */
export function zufall(saat: number): () => number {
  let s = saat >>> 0 || 1;
  return () => {
    // xorshift32: tiny, no dependency, and good enough to shuffle a deck.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

export function mische<T>(liste: readonly T[], rnd: () => number): T[] {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Build an option list: the answer plus wrong answers drawn from `quelle`.
 *
 * Rejects any candidate equal to the answer — otherwise a question can offer
 * the right answer twice and mark one of them wrong, which destroys trust in
 * the game faster than any other bug.
 */
export function optionenBauen(
  loesung: string,
  quelle: readonly string[],
  anzahl: number,
  rnd: () => number,
): string[] {
  const gesehen = new Set([loesung.toLowerCase()]);
  const falsch: string[] = [];
  for (const kandidat of mische(quelle, rnd)) {
    const k = kandidat.trim();
    if (!k || gesehen.has(k.toLowerCase())) continue;
    gesehen.add(k.toLowerCase());
    falsch.push(k);
    if (falsch.length === anzahl - 1) break;
  }
  return mische([loesung, ...falsch], rnd);
}

// --- the generators ---------------------------------------------------------
// Each takes the whole cheat sheet and returns every question it can build.
// Rounds are cut from the pool afterwards, so a generator never has to know
// how long a round is.

type Verb = Lernhilfe['wortschatz']['verben'][number]['eintraege'][number];

function istArtikel(a: string): a is Artikel {
  return (ARTIKEL as readonly string[]).includes(a);
}

/** der/die/das. The most valuable drill in the language, and the simplest. */
export function fragenArtikel(lh: Lernhilfe): Frage[] {
  const raus: Frage[] = [];
  for (const gruppe of lh.wortschatz.nomen) {
    const szene = szeneFuer(gruppe.gruppe);
    for (const e of gruppe.eintraege) {
      if (!istArtikel(e.art)) continue;
      raus.push({
        id: `artikel:${e.wort}`,
        art: 'artikel',
        kategorie: 'wortschatz',
        hinweis: gruppe.gruppe,
        frage: `Welcher Artikel gehört zu „${e.wort}“?`,
        optionen: [...ARTIKEL],
        loesung: e.art,
        erklaerung: `${e.art} ${e.wort} (${e.en}) — Plural: ${e.pl}.`,
        artikel: e.art,
        szene,
      });
    }
  }
  return raus;
}

/**
 * The last a/o/u of a stem takes the umlaut, and only that one.
 *
 * "au" has to be handled as a unit — it umlauts to "äu", so treating it as a
 * lone u produces "Fraü", which is not a sequence German spells at all and
 * gives the answer away.
 */
export function umlauten(wort: string): string {
  // Case-insensitive, because every German noun is capitalised and the vowel
  // that umlauts is the first letter in Apfel → Äpfel, Ofen → Öfen.
  const treffer = [...wort.matchAll(/au|[aou]/gi)].pop();
  if (!treffer) return wort;
  const i = treffer.index;
  const paar: Record<string, string> = { a: 'ä', o: 'ö', u: 'ü', au: 'äu' };
  const gefunden = treffer[0];
  const ersatz = paar[gefunden.toLowerCase()]!;
  return (
    wort.slice(0, i) +
    (gefunden[0] === gefunden[0]!.toUpperCase()
      ? ersatz[0]!.toUpperCase() + ersatz.slice(1)
      : ersatz) +
    wort.slice(i + gefunden.length)
  );
}

/**
 * Plausible wrong plurals for a noun.
 *
 * These have to be shapes German could actually produce, or the question
 * answers itself: nobody has to know anything to rule out "die Nameer". A stem
 * already ending in -e takes -n or -s, never a second -e, and the umlaut
 * variants are included because "Mann → Manner" is the mistake learners really
 * make.
 */
export function pluralKandidaten(wort: string): string[] {
  const aufE = /e$/.test(wort);
  const formen = aufE
    ? [wort, `${wort}n`, `${wort}s`, `${wort.slice(0, -1)}en`]
    : [wort, `${wort}e`, `${wort}en`, `${wort}er`, `${wort}s`];
  const um = umlauten(wort);
  if (um !== wort) formen.push(um, `${um}e`, `${um}er`, aufE ? `${um}n` : `${um}en`);
  return [...new Set(formen)].map((f) => `die ${f}`);
}

/**
 * The plural. Distractors are the other endings German actually uses, built on
 * the same stem, because that is the shape of the real mistake — nobody
 * confuses "die Namen" with "die Häuser", they confuse it with "die Name" and
 * "die Namens".
 */
export function fragenPlural(lh: Lernhilfe, rnd: () => number): Frage[] {
  const raus: Frage[] = [];
  for (const gruppe of lh.wortschatz.nomen) {
    const szene = szeneFuer(gruppe.gruppe);
    for (const e of gruppe.eintraege) {
      const optionen = optionenBauen(e.pl, pluralKandidaten(e.wort), 4, rnd);
      // A noun whose plural is irregular enough that no invented ending
      // matched is more interesting, not less — but one with fewer than three
      // options makes a poor question.
      if (optionen.length < 3) continue;
      raus.push({
        id: `plural:${e.wort}`,
        art: 'plural',
        kategorie: 'wortschatz',
        hinweis: gruppe.gruppe,
        frage: `Wie heißt der Plural von „${e.art} ${e.wort}“?`,
        optionen,
        loesung: e.pl,
        erklaerung: `${e.art} ${e.wort} → ${e.pl} (${e.en}).`,
        artikel: istArtikel(e.art) ? e.art : undefined,
        szene,
      });
    }
  }
  return raus;
}

/** Meaning, both directions. Distractors come from the same topic group. */
export function fragenBedeutung(lh: Lernhilfe, rnd: () => number): Frage[] {
  const raus: Frage[] = [];
  for (const gruppe of lh.wortschatz.nomen) {
    if (gruppe.eintraege.length < 4) continue;
    const szene = szeneFuer(gruppe.gruppe);
    const alle = gruppe.eintraege.map((e) => e.en);
    for (const e of gruppe.eintraege) {
      raus.push({
        id: `bedeutung:${e.wort}`,
        art: 'bedeutung',
        kategorie: 'wortschatz',
        hinweis: gruppe.gruppe,
        frage: `Was bedeutet „${e.art} ${e.wort}“?`,
        optionen: optionenBauen(e.en, alle, 4, rnd),
        loesung: e.en,
        erklaerung: `${e.art} ${e.wort} — ${e.en}. Plural: ${e.pl}.`,
        artikel: istArtikel(e.art) ? e.art : undefined,
        szene,
      });
    }
  }
  return raus;
}

/**
 * Opposites. Adjectives come in pairs already, so this nearly writes itself —
 * except that a word can honestly have more than one opposite. "alt" is listed
 * twice at A1, against "neu" for things and "jung" for people, and both are
 * right. Offering one as a distractor for the other would mark a correct
 * answer wrong, so every alternative belonging to the same headword is kept
 * out of the distractor pool, and the sense is named in the hint.
 */
export function fragenGegenteil(lh: Lernhilfe, rnd: () => number): Frage[] {
  const alle = lh.wortschatz.adjektive.map((a) => a.gegenteil);
  const mehrdeutig = new Set(
    lh.wortschatz.adjektive
      .filter((a, _, xs) => xs.filter((y) => y.wort === a.wort).length > 1)
      .map((a) => a.wort),
  );

  return lh.wortschatz.adjektive.map((a) => {
    const eigene = new Set(
      lh.wortschatz.adjektive.filter((x) => x.wort === a.wort).map((x) => x.gegenteil),
    );
    return {
      // The headword alone is not unique; the pair is.
      id: `gegenteil:${a.wort}:${a.gegenteil}`,
      art: 'gegenteil' as const,
      kategorie: 'wortschatz' as const,
      hinweis: mehrdeutig.has(a.wort) ? `Gegensatzpaare · ${a.en}` : 'Gegensatzpaare',
      frage: `Was ist das Gegenteil von „${a.wort}“?`,
      optionen: optionenBauen(
        a.gegenteil,
        alle.filter((g) => !eigene.has(g)),
        4,
        rnd,
      ),
      loesung: a.gegenteil,
      erklaerung: `${a.wort} ↔ ${a.gegenteil} (${a.en}).`,
      szene: 'lernen' as const,
    };
  });
}

/**
 * Principal parts. The distractors are the *same verb's other forms*, which is
 * the whole difficulty: knowing "gehen" is not the point, knowing that the
 * Perfekt is "ist gegangen" and not "hat gegangen" is.
 */
export function fragenVerbform(lh: Lernhilfe, rnd: () => number): Frage[] {
  const raus: Frage[] = [];
  const alleVerben: Verb[] = lh.wortschatz.verben.flatMap((g) => g.eintraege);
  for (const gruppe of lh.wortschatz.verben) {
    const szene = szeneFuer(gruppe.gruppe);
    for (const v of gruppe.eintraege) {
      // Only the irregular ones are worth asking: a regular verb's Perfekt is
      // derivable, and asking about it drills a rule the learner already has.
      if (!v.unreg) continue;
      const andere = alleVerben.filter((x) => x !== v).map((x) => x.perf);
      raus.push({
        id: `verbform:${v.inf}`,
        art: 'verbform',
        kategorie: 'wortschatz',
        hinweis: `${gruppe.gruppe} · unregelmäßig`,
        frage: `Wie lautet das Perfekt von „${v.inf}“?`,
        optionen: optionenBauen(
          v.perf,
          [`hat ge${v.inf}t`, `ist ge${v.inf}t`, ...andere],
          4,
          rnd,
        ),
        loesung: v.perf,
        erklaerung: `${v.inf} — er ${v.er} — ${v.prät} — ${v.perf} (${v.en}).`,
        szene,
      });
    }
  }
  return raus;
}

/**
 * A gap in the verb's own example sentence. The content already marks the
 * conjugated form with **…**, so the gap lands exactly on the form being
 * taught, and the other forms of the same verb make the distractors.
 */
export function fragenVerbluecke(lh: Lernhilfe, rnd: () => number): Frage[] {
  const raus: Frage[] = [];
  for (const gruppe of lh.wortschatz.verben) {
    const szene = szeneFuer(gruppe.gruppe);
    for (const v of gruppe.eintraege) {
      const ziel = fettTeil(v.bsp);
      if (!ziel) continue;
      const andere = [v.inf, v.er, v.prät, v.perf].filter((f) => f && f !== ziel);
      if (andere.length < 2) continue;
      raus.push({
        id: `verbluecke:${v.inf}`,
        art: 'verbluecke',
        kategorie: 'wortschatz',
        hinweis: gruppe.gruppe,
        frage: 'Welche Form passt in die Lücke?',
        // A separable verb marks both halves — "Dagegen **wendet** er **ein**".
        // Only the conjugated half becomes the gap; the prefix stays visible,
        // which is the pedagogically useful half of the sentence anyway. The
        // second ohneFett is what stops the leftover markup reaching the card.
        vorlage: ohneFett(v.bsp.replace(/\*\*(.+?)\*\*/, '____')),
        optionen: optionenBauen(ziel, andere, Math.min(4, andere.length + 1), rnd),
        loesung: ziel,
        erklaerung: `${ohneFett(v.bsp)} — ${v.inf}: er ${v.er}, ${v.prät}, ${v.perf}.`,
        szene,
      });
    }
  }
  return raus;
}

/**
 * A gap in a grammar table. This is the best-value generator in the file: the
 * tables were written so that the **bold** cell is the thing the row exists to
 * teach, and the other rows of the same table hold precisely the forms it is
 * confused with.
 */
export function fragenTabelle(lh: Lernhilfe, rnd: () => number): Frage[] {
  const raus: Frage[] = [];
  for (const g of lh.grammatik) {
    const szene = szeneFuer(g.thema);
    // Every bold cell anywhere in this table is a candidate distractor.
    const imTisch = g.tabelle.zeilen
      .flat()
      .map(fettTeil)
      .filter((x): x is string => x !== null);
    if (imTisch.length < 3) continue;

    for (const [nr, zeile] of g.tabelle.zeilen.entries()) {
      const spalte = zeile.findIndex((z) => fettTeil(z) !== null);
      if (spalte < 0) continue;
      const ziel = fettTeil(zeile[spalte]!)!;
      const zeigen = zeile
        .map((z, i) => (i === spalte ? ohneFett(z).replace(ziel, '____') : ohneFett(z)))
        .filter(Boolean);
      raus.push({
        id: `tabelle:${g.thema}:${nr}`,
        art: 'tabelle',
        kategorie: 'grammatik',
        hinweis: g.thema,
        frage: `${g.tabelle.kopf[spalte] ?? 'Form'} — was gehört in die Lücke?`,
        vorlage: zeigen.join('  ·  '),
        optionen: optionenBauen(ziel, imTisch, 4, rnd),
        loesung: ziel,
        erklaerung: `${ohneFett(zeile.join(' · '))}\n${g.erklaerung}`,
        szene,
      });
    }
  }
  return raus;
}

/** Header words that mark the column holding a worked example. */
const BEISPIEL_SPALTE = /^(beispiel|im satz|satz)\b/i;

/**
 * Header words that mark a column explaining *why* — the rule, the case, the
 * effect, the condition.
 */
const REGEL_SPALTE =
  /^(regel|wirkung|hinweis|achtung|wann|wofür|warum|kasus|fall|bedeutung|verwendung|funktion|ziel)\b/i;

/**
 * Given an example, name the rule. Runs the table the other way round from the
 * cloze: that one asks for the form, this asks whether the learner knows why.
 *
 * The column layout has to be *read off the header*, never assumed. An earlier
 * version took the last column as the rule and the one before it as the
 * example, which happens to be true for "Satztyp · Beispiel · Regel" and false
 * for most of the rest — it asked "which rule applies to `den/dem/des Kunden`?"
 * and offered four English glosses, and it showed the case column as the
 * example with whole sentences as the rules. A table that does not clearly
 * have both columns produces no questions at all, which is the right outcome:
 * a confusing question is worse for the learner than a missing one.
 */
export function fragenRegel(lh: Lernhilfe, rnd: () => number): Frage[] {
  const raus: Frage[] = [];
  for (const g of lh.grammatik) {
    const beispielSpalte = g.tabelle.kopf.findIndex((k) =>
      BEISPIEL_SPALTE.test(k.trim()),
    );
    const regelSpalte = g.tabelle.kopf.findIndex((k) => REGEL_SPALTE.test(k.trim()));
    if (beispielSpalte < 0 || regelSpalte < 0 || beispielSpalte === regelSpalte) continue;

    // A label longer than this is prose, and prose makes an unreadable option.
    const etiketten = g.tabelle.zeilen
      .map((z) => ohneFett(z[regelSpalte] ?? '').trim())
      .filter((e) => e && e.length <= 60);
    if (new Set(etiketten).size < 3) continue;
    const szene = szeneFuer(g.thema);

    for (const [nr, zeile] of g.tabelle.zeilen.entries()) {
      const beispiel = ohneFett(zeile[beispielSpalte] ?? '').trim();
      const etikett = ohneFett(zeile[regelSpalte] ?? '').trim();
      if (!beispiel || !etikett || beispiel.length < 8 || etikett.length > 60) continue;
      raus.push({
        id: `regel:${g.thema}:${nr}`,
        art: 'regel',
        kategorie: 'grammatik',
        hinweis: g.thema,
        frage: `${g.tabelle.kopf[regelSpalte]} — was trifft hier zu?`,
        vorlage: beispiel,
        optionen: optionenBauen(etikett, etiketten, 4, rnd),
        loesung: etikett,
        erklaerung: g.erklaerung,
        szene,
      });
    }
  }
  return raus;
}

/** What is this phrase *for*? Distractors are other functions at this level. */
export function fragenFunktion(lh: Lernhilfe, rnd: () => number): Frage[] {
  const raus: Frage[] = [];
  const alleFunktionen = lh.redemittel.flatMap((b) => b.gruppen.map((g) => g.funktion));
  if (new Set(alleFunktionen).size < 4) return raus;

  for (const bereich of lh.redemittel) {
    for (const gruppe of bereich.gruppen) {
      // One phrase per function: asking the same question five times with a
      // different example is padding, not practice.
      const phrase = gruppe.phrasen[0];
      if (!phrase) continue;
      raus.push({
        id: `funktion:${bereich.bereich}:${gruppe.funktion}`,
        art: 'funktion',
        kategorie: 'redemittel',
        hinweis: bereich.bereich,
        frage: 'Wofür benutzt man diesen Satz?',
        vorlage: `„${ohneFett(phrase)}“`,
        optionen: optionenBauen(gruppe.funktion, alleFunktionen, 4, rnd),
        loesung: gruppe.funktion,
        erklaerung: `${gruppe.funktion} — aus „${bereich.bereich}“.`,
        szene: szeneFuer(bereich.bereich),
      });
    }
  }
  return raus;
}

/**
 * A word taken out of a set phrase. Which word matters: the gap falls on the
 * longest word, because that is the one carrying the meaning — blanking "die"
 * teaches nothing.
 */
export function fragenPhrasenluecke(lh: Lernhilfe, rnd: () => number): Frage[] {
  const raus: Frage[] = [];
  const wortVorrat = new Set<string>();
  for (const b of lh.redemittel)
    for (const g of b.gruppen)
      for (const p of g.phrasen)
        for (const w of ohneFett(p).split(/\s+/)) if (w.length > 4) wortVorrat.add(w);
  const vorrat = [...wortVorrat];

  for (const bereich of lh.redemittel) {
    const szene = szeneFuer(bereich.bereich);
    for (const gruppe of bereich.gruppen) {
      for (const [nr, roh] of gruppe.phrasen.entries()) {
        const phrase = ohneFett(roh);
        // "…" is a slot the learner fills with their own words. A phrase that
        // is mostly slots has nothing left to hide.
        const woerter = phrase.split(/\s+/).filter((w) => !w.includes('…'));
        if (woerter.length < 4) continue;
        const ziel = woerter.reduce((a, b) => (b.length > a.length ? b : a));
        if (ziel.length < 4) continue;
        raus.push({
          id: `phrasenluecke:${bereich.bereich}:${gruppe.funktion}:${nr}`,
          art: 'phrasenluecke',
          kategorie: 'redemittel',
          hinweis: `${bereich.bereich} · ${gruppe.funktion}`,
          frage: 'Welches Wort fehlt?',
          vorlage: phrase.replace(ziel, '____'),
          optionen: optionenBauen(ziel, vorrat, 4, rnd),
          loesung: ziel,
          erklaerung: `„${phrase}“ — ${gruppe.funktion}.`,
          szene,
        });
      }
    }
  }
  return raus;
}

/**
 * Assemble the phrase from shuffled chips.
 *
 * The only generator that asks the learner to *produce* rather than choose,
 * and the one that drills German word order, which no amount of vocabulary
 * fixes. Kept to short phrases: past about eight chips it stops being a memory
 * task and becomes a puzzle.
 */
export function fragenBauen(lh: Lernhilfe, rnd: () => number): Frage[] {
  const raus: Frage[] = [];
  for (const bereich of lh.redemittel) {
    const szene = szeneFuer(bereich.bereich);
    for (const gruppe of bereich.gruppen) {
      for (const [nr, roh] of gruppe.phrasen.entries()) {
        const phrase = ohneFett(roh)
          .replace(/\s*…\s*/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const woerter = phrase.split(' ').filter(Boolean);
        if (woerter.length < 4 || woerter.length > 8) continue;
        // A phrase whose words repeat cannot be checked chip by chip.
        if (new Set(woerter.map((w) => w.toLowerCase())).size !== woerter.length)
          continue;
        raus.push({
          id: `bauen:${bereich.bereich}:${gruppe.funktion}:${nr}`,
          art: 'bauen',
          kategorie: 'redemittel',
          hinweis: `${bereich.bereich} · ${gruppe.funktion}`,
          frage: 'Bringen Sie die Wörter in die richtige Reihenfolge.',
          optionen: mische(woerter, rnd),
          loesung: woerter.join(' '),
          erklaerung: `„${phrase}“ — ${gruppe.funktion}.`,
          szene,
        });
      }
    }
  }
  return raus;
}

// --- building a round -------------------------------------------------------

export const RUNDE_LAENGE = 12;
export const LEBEN = 3;

/** Every question the level can produce, in the chosen category. */
export function alleFragen(lh: Lernhilfe, kategorie: Kategorie, saat = 1): Frage[] {
  const rnd = zufall(saat);
  const wortschatz = () => [
    ...fragenArtikel(lh),
    ...fragenPlural(lh, rnd),
    ...fragenBedeutung(lh, rnd),
    ...fragenGegenteil(lh, rnd),
    ...fragenVerbform(lh, rnd),
    ...fragenVerbluecke(lh, rnd),
  ];
  const grammatik = () => [...fragenTabelle(lh, rnd), ...fragenRegel(lh, rnd)];
  const redemittel = () => [
    ...fragenFunktion(lh, rnd),
    ...fragenPhrasenluecke(lh, rnd),
    ...fragenBauen(lh, rnd),
  ];

  switch (kategorie) {
    case 'wortschatz':
      return wortschatz();
    case 'grammatik':
      return grammatik();
    case 'redemittel':
      return redemittel();
    default:
      return [...wortschatz(), ...grammatik(), ...redemittel()];
  }
}

export interface Fortschritt {
  /** Leitner box per question id, 1 (due now) to 5 (long since learnt). */
  boxen: Record<string, number>;
  bestePunkte: number;
  besteSerie: number;
  gespielt: number;
}

export const leererFortschritt = (): Fortschritt => ({
  boxen: {},
  bestePunkte: 0,
  besteSerie: 0,
  gespielt: 0,
});

/**
 * Leitner. A miss sends an item all the way back to box 1 rather than down one
 * step: getting it wrong means the memory was not there, and the schedule
 * should stop pretending otherwise.
 */
export function naechsteBox(box: number, richtig: boolean): number {
  if (!richtig) return 1;
  // Box 0 is "never seen". A first correct answer earns box 1, not box 2 —
  // one right answer is not evidence enough to skip a rung of the ladder.
  return Math.min(5, Math.max(0, box) + 1);
}

/**
 * Pick a round. Items in low boxes come first — those are the ones the learner
 * has missed or never seen — then the deck is interleaved so that two
 * questions of the same kind rarely land back to back.
 */
export function rundeBauen(
  pool: readonly Frage[],
  fortschritt: Fortschritt,
  saat: number,
  laenge = RUNDE_LAENGE,
): Frage[] {
  const rnd = zufall(saat);
  const bewertet = mische(pool, rnd)
    .map((f) => ({ f, box: fortschritt.boxen[f.id] ?? 0 }))
    .sort((a, b) => a.box - b.box);
  return verschraenken(
    bewertet.slice(0, laenge).map((x) => x.f),
    rnd,
  );
}

/**
 * Spread the question kinds out. Answering six article questions in a row
 * trains a reflex for the *screen*, not for the language; alternating forces
 * the learner to work out what is being asked each time.
 */
export function verschraenken(fragen: readonly Frage[], rnd: () => number): Frage[] {
  const eimer = new Map<FrageArt, Frage[]>();
  for (const f of mische(fragen, rnd)) {
    const liste = eimer.get(f.art) ?? [];
    liste.push(f);
    eimer.set(f.art, liste);
  }
  const raus: Frage[] = [];
  let letzte: FrageArt | null = null;
  while (raus.length < fragen.length) {
    // Prefer the fullest bucket that is not the kind just asked; fall back to
    // the fullest overall when only one kind is left.
    const offen = [...eimer.entries()].filter(([, v]) => v.length > 0);
    if (offen.length === 0) break;
    const gewaehlt =
      offen.filter(([k]) => k !== letzte).sort((a, b) => b[1].length - a[1].length)[0] ??
      offen[0]!;
    raus.push(gewaehlt[1].shift()!);
    letzte = gewaehlt[0];
  }
  return raus;
}

// --- scoring ----------------------------------------------------------------

export const GRUNDWERT = 10;

/**
 * Points for one correct answer. A streak multiplies, capped at five — beyond
 * that the number stops meaning anything and the learner is playing the
 * counter instead of the language.
 */
export function punkteFuer(serie: number): number {
  return GRUNDWERT * Math.min(5, Math.max(1, serie));
}

export interface Stand {
  punkte: number;
  serie: number;
  besteSerie: number;
  leben: number;
  richtig: number;
  falsch: number;
}

export const leererStand = (): Stand => ({
  punkte: 0,
  serie: 0,
  besteSerie: 0,
  leben: LEBEN,
  richtig: 0,
  falsch: 0,
});

export function antworten(stand: Stand, richtig: boolean): Stand {
  if (!richtig)
    return {
      ...stand,
      serie: 0,
      leben: stand.leben - 1,
      falsch: stand.falsch + 1,
    };
  const serie = stand.serie + 1;
  return {
    ...stand,
    punkte: stand.punkte + punkteFuer(serie),
    serie,
    besteSerie: Math.max(stand.besteSerie, serie),
    richtig: stand.richtig + 1,
  };
}

// --- how long the answer stays up -------------------------------------------

/** Time to register the verdict, before any reading. */
export const PAUSE_GRUND_RICHTIG = 1800;
export const PAUSE_GRUND_FALSCH = 2600;

/** Roughly 158 words a minute — a learner reading German, not a native skim. */
export const LESEZEIT_PRO_WORT = 380;

/** Nobody is held longer than this; the Weiter button covers the rest. */
export const PAUSE_MAX = 16_000;

/**
 * How long to leave an answered card on screen.
 *
 * A single fixed pause cannot work here, and two rounds of guessing at one
 * proved it. The explanations differ by more than tenfold: an article card
 * says "der Vorteil (advantage) — Plural: die Vorteile" in seven words, while
 * a grammar-table card carries the row *and* the rule behind it, which runs to
 * thirty-five words and past fifty at the top end. Any single number is either
 * a wait on the short cards or a snatched-away explanation on the long ones.
 *
 * So the pause is the time to register right-or-wrong plus the time to read
 * what is actually there. It is capped, because an auto-advance is a floor
 * under progress rather than a reading test — anyone who wants longer has
 * the Weiter button, and anyone who reads faster has it too.
 */
export function lesepause(erklaerung: string, richtig: boolean): number {
  const grund = richtig ? PAUSE_GRUND_RICHTIG : PAUSE_GRUND_FALSCH;
  const text = erklaerung.trim();
  const woerter = text ? text.split(/\s+/).length : 0;
  return Math.min(PAUSE_MAX, grund + woerter * LESEZEIT_PRO_WORT);
}

// --- a history that outlives the round --------------------------------------

/**
 * One answer, kept for good.
 *
 * Only the *record* is stored, never the card: the question, its solution and
 * its explanation are all generated deterministically from the cheat sheet, so
 * they can be looked up again by id whenever the history is shown. That keeps
 * an entry at a few dozen bytes instead of a few hundred, and it means a
 * correction to the content reaches the history too rather than leaving a
 * stale copy of the old wording sitting in the browser forever.
 *
 * The one thing not recoverable that way is which options were on offer, since
 * those are shuffled per round. Nothing in the review needs them: it shows
 * what was answered and what was right.
 */
export interface Antwortnotiz {
  /** The question's stable id, used to find it again. */
  id: string;
  kategorie: Exclude<Kategorie, 'gemischt'>;
  antwort: string;
  richtig: boolean;
  /** Epoch ms, so the list can be shown newest first. */
  zeit: number;
}

/**
 * How many answers are kept per level.
 *
 * A cap rather than everything: this lives in localStorage, which is a few
 * megabytes for the whole origin and is shared with the rest of the app. Three
 * hundred entries is twenty-five rounds of history at a few dozen bytes each,
 * which is far more than anyone scrolls back through and still nowhere near
 * the limit.
 */
export const VERLAUF_MAX = 300;

/** Newest first, oldest dropped once the cap is reached. */
export function verlaufErgaenzen(
  alt: readonly Antwortnotiz[],
  neu: Antwortnotiz,
  max = VERLAUF_MAX,
): Antwortnotiz[] {
  return [neu, ...alt].slice(0, max);
}

export interface VerlaufZahlen {
  gesamt: number;
  richtig: number;
  falsch: number;
  /** Share correct, 0 to 1. Zero when nothing has been answered yet. */
  quote: number;
}

export function verlaufZahlen(notizen: readonly Antwortnotiz[]): VerlaufZahlen {
  const richtig = notizen.filter((n) => n.richtig).length;
  return {
    gesamt: notizen.length,
    richtig,
    falsch: notizen.length - richtig,
    quote: notizen.length ? richtig / notizen.length : 0,
  };
}

/**
 * The cards behind a history, in the order the answers were given.
 *
 * An entry whose question no longer exists is dropped rather than shown empty:
 * the cheat sheets do change, and a card that has been edited out of the
 * content should leave the history quietly instead of rendering a blank row.
 */
export function verlaufKarten(
  notizen: readonly Antwortnotiz[],
  pool: readonly Frage[],
): { notiz: Antwortnotiz; frage: Frage }[] {
  const nachId = new Map(pool.map((f) => [f.id, f]));
  return notizen
    .map((notiz) => ({ notiz, frage: nachId.get(notiz.id) }))
    .filter((x): x is { notiz: Antwortnotiz; frage: Frage } => x.frage !== undefined);
}

export function verlaufSchluessel(stufe: Stufe): string {
  return `sprachschatz:verlauf:${stufe}`;
}

/** Checking an answer. `bauen` compares the assembled sentence. */
export function istRichtig(frage: Frage, antwort: string): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return norm(frage.loesung) === norm(antwort);
}

/** How the round is summed up. Never scolds: a bad round is still practice. */
export function urteil(stand: Stand, laenge: number): { titel: string; text: string } {
  const quote = laenge > 0 ? stand.richtig / laenge : 0;
  if (stand.leben <= 0)
    return {
      titel: 'Runde vorbei',
      text: `${stand.richtig} richtig, bevor die Leben aufgebraucht waren. Die verpassten Karten kommen als Erstes zurück.`,
    };
  if (quote === 1)
    return {
      titel: 'Alles richtig!',
      text: `${laenge} von ${laenge}. Diese Karten kommen erst in einigen Runden wieder.`,
    };
  if (quote >= 0.75)
    return {
      titel: 'Starke Runde',
      text: `${stand.richtig} von ${laenge} richtig. Beste Serie: ${stand.besteSerie}.`,
    };
  return {
    titel: 'Geschafft',
    text: `${stand.richtig} von ${laenge} richtig. Was heute danebenging, kommt in der nächsten Runde zuerst.`,
  };
}

/** The label under a category tile on the picker. */
export function kategorieTitel(k: Kategorie): string {
  switch (k) {
    case 'wortschatz':
      return 'Wortschatz';
    case 'grammatik':
      return 'Grammatik';
    case 'redemittel':
      return 'Redemittel';
    default:
      return 'Alles gemischt';
  }
}

export function spielSchluessel(stufe: Stufe, kategorie: Kategorie): string {
  return `sprachschatz:${stufe}:${kategorie}`;
}
