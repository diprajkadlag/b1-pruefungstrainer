/**
 * Shapes the app and the server both read.
 *
 * These mirror packages/schema/exam.schema.json, which is the authority — the
 * Python validator enforces it on every content change. Keep them in step.
 */

export type Stufe = 'B1' | 'B2';
export type Variante = 'erwachsene' | 'jugendliche';
export type Niveau = 'mittel-leicht' | 'mittel';

export type ItemTyp =
  | 'richtig_falsch'
  | 'multiple_choice'
  | 'zuordnung_anzeigen'
  | 'ja_nein'
  | 'zuordnung_person'
  /**
   * B2: pick one letter from the Teil's `optionenliste`. Inserting a sentence
   * into a gap, matching an opinion to a heading and matching a paragraph to a
   * table of contents look nothing alike on paper but are the same decision,
   * so they share a control and are told apart by the Teil's `typ`.
   */
  | 'zuordnung_buchstabe';

export interface Optionen {
  a: string;
  b: string;
  c: string;
  /** Only B2 Lesen Teil 1, which matches statements to four named writers. */
  d?: string;
}

/** One lettered alternative in a B2 matching task. Some are never the answer. */
export interface Zuordnungsoption {
  buchstabe: string;
  titel?: string;
  inhalt: string;
}

/** An item as the candidate sees it: no answer, no evidence, no rationale. */
export interface OeffentlichesItem {
  nr: number;
  typ: ItemTyp;
  frage: string;
  optionen?: Optionen;
  textId?: string;
  abschnitt?: string;
  kompetenz?: string;
}

export interface Beispiel extends OeffentlichesItem {
  loesung: string;
  begruendung: { de: string; en: string };
}

export interface PruefungsText {
  id: string;
  titel?: string;
  quelle?: string;
  /** B2 Lesen Teil 1: which of the four forum writers this post is. */
  buchstabe?: string;
  /**
   * Where the task is to fill gaps (B2 Lesen Teile 2 and 5) each gap appears
   * in the running text as its item number in square brackets: `[10]`.
   */
  inhalt: string;
}

export interface Anzeige {
  buchstabe: string;
  titel: string;
  inhalt: string;
}

export interface LesenTeil {
  nummer: number;
  typ: string;
  anweisung: string;
  richtzeitMinuten: number;
  these?: string;
  texte?: PruefungsText[];
  /** B1 Teil 3: ten classified ads. */
  anzeigen?: Anzeige[];
  /** B2 Teile 2, 4 and 5: the lettered alternatives on offer. */
  optionenliste?: Zuordnungsoption[];
  beispiel?: Beispiel;
  items: OeffentlichesItem[];
}

export interface HoerenTeil {
  nummer: number;
  typ: string;
  anweisung: string;
  wiederholungen: 1 | 2;
  situation?: string;
  sprecher?: { rolle: string; geschlecht: 'm' | 'f'; beschreibung?: string }[];
  beispiel?: Beispiel;
  items: OeffentlichesItem[];
}

export interface SchreibenAufgabe {
  nummer: number;
  typ: 'email_informell' | 'forumsbeitrag' | 'email_halbformell' | 'nachricht_formell';
  situation: string;
  impuls?: string;
  aufgabenstellung: string;
  leitpunkte: string[];
  anrede?: string;
  /** A target at B1, a minimum at B2 — which is why the app labels it per level. */
  woerter: 40 | 80 | 100 | 150;
  zeitMinuten: number;
  punkte: number;
}

export interface SprechenThema {
  titel: string;
  /** Five slides at B1; four outline points at B2, where it is a talk. */
  folien: string[];
}

export interface PartnerTurn {
  text: string;
  wartenSek: number;
  hinweis?: string;
}

export interface SprechenTeil {
  nummer: number;
  typ:
    | 'gemeinsam_planen'
    | 'praesentation'
    | 'rueckmeldung'
    /** B2: a structured talk, then a debate on a set question. */
    | 'vortrag'
    | 'diskussion';
  titel: string;
  anweisung: string;
  dauerMinuten: number;
  punkte: number;
  situation?: string;
  planungspunkte?: string[];
  themen?: SprechenThema[];
  partnerSkript?: PartnerTurn[];
  fragen?: string[];
}

export interface OeffentlichePruefung {
  meta: {
    id: string;
    titel: string;
    stufe: Stufe;
    variante: Variante;
    niveau: Niveau;
    contentVersion: string;
    themen: string[];
  };
  lesen: { zeitMinuten: number; teile: LesenTeil[] };
  hoeren: { zeitMinuten: number; teile: HoerenTeil[] };
  schreiben: { zeitMinuten: number; aufgaben: SchreibenAufgabe[] };
  sprechen: { vorbereitungMinuten: number; teile: SprechenTeil[] };
}

// --- the half withheld until an attempt is closed ---------------------------

export interface GlossarEintrag {
  lemma: string;
  wortart: string;
  artikel?: string;
  plural?: string;
  stammformen?: {
    praesens_3sg: string;
    praeteritum: string;
    perfekt: string;
    unregelmaessig?: boolean;
  };
  trennbar?: boolean;
  praeposition?: { wort: string; kasus: string };
  bedeutung_de?: string;
  bedeutung_en: string;
  beispiel: string;
  fundstelle: string;
  niveau?: string;
}

export interface GrammatikFokus {
  phaenomen: string;
  erklaerung_de: string;
  erklaerung_en: string;
  belegSatz: string;
  fundstelle: string;
  uebungen: { aufgabe: string; loesung: string; hinweis?: string }[];
}

export interface Redewendung {
  wendung: string;
  typ?: string;
  bedeutung_de: string;
  bedeutung_en: string;
  beispiel: string;
  fundstelle: string;
}

export interface Schluesseldaten {
  meta: { id: string; contentVersion: string };
  keys: Record<
    string,
    {
      loesung: string;
      beleg: string;
      begruendung: { de: string; en: string };
      kompetenz: string;
      teil: number;
    }
  >;
  transkripte: {
    teil: number;
    wiederholungen: number;
    zeilen: { rolle: string; text: string; betont: boolean }[];
  }[];
  schreiben: {
    nummer: number;
    redemittel: string[];
    musterloesungen: { niveau: string; text: string; kommentar: string }[];
  }[];
  sprechen: {
    nummer: number;
    themen: { titel: string; redemittel: string[]; musterantwort: string }[];
  }[];
  glossar: GlossarEintrag[];
  redewendungen: Redewendung[];
  grammatik: GrammatikFokus[];
}

// --- audio ------------------------------------------------------------------

export interface AudioCue {
  label: string;
  start: number;
  end: number;
  kind: 'ansage' | 'text' | 'wiederholung' | 'pause';
}

export interface AudioManifest {
  examId: string;
  provider: string;
  redistributable: boolean;
  format: string;
  sampleRate: number;
  voices: Record<string, string>;
  hoeren: {
    teil: number;
    datei: string;
    dauerSek: number;
    wiederholungen: number;
    wpm: number;
    cues: AudioCue[];
  }[];
  komplett?: { datei: string; dauerSek: number };
  sprechen: {
    teil: number;
    index: number;
    datei: string;
    dauerSek: number;
    wartenSek: number;
    hinweis: string;
    text: string;
  }[];
}

// --- an attempt -------------------------------------------------------------

export interface Versuch {
  id: string;
  examId: string;
  name: string;
  gestartet: string;
  abgegeben?: string;
  antworten: {
    lesen: Record<string, string>;
    hoeren: Record<string, string>;
  };
  schreiben: Record<string, string>;
  sprechen: Record<string, Blob>;
  gehoerteTeile: number[];
}

// --- the cheat sheet --------------------------------------------------------
// Belongs to no single exam: it is the reference the candidate reads before
// sitting one, so it carries no answers and needs no public/keyed split.

export interface Tabelle {
  kopf: string[];
  zeilen: string[][];
}

export interface Lernhilfe {
  titel: string;
  untertitel: string;
  /** Which level's sheet this is. Stamped on by the exporter. */
  stufe: Stufe;
  version: string;
  ueberblick: {
    einleitung: string;
    module: {
      modul: string;
      zeit: string;
      teile: string;
      punkte: string;
      kern: string;
    }[];
    noten: { note: string; von: number; bis: number }[];
  };
  strategie: {
    modul: string;
    zeitplan: string;
    goldregeln: string[];
    tipps?: { teil: string; text: string }[];
    aufgaben?: { aufgabe: string; aufbau: string; hinweis: string }[];
    teile?: { teil: string; ziel: string; ablauf: string; achtung: string }[];
    fehlerliste?: { falsch: string; richtig: string; grund: string }[];
  }[];
  redemittel: {
    bereich: string;
    gruppen: { funktion: string; phrasen: string[] }[];
  }[];
  grammatik: { thema: string; erklaerung: string; tabelle: Tabelle }[];
  wortschatz: {
    titel: string;
    hinweis: string;
    verben: {
      gruppe: string;
      eintraege: {
        inf: string;
        en: string;
        er: string;
        prät: string;
        perf: string;
        unreg: boolean;
        bsp: string;
      }[];
    }[];
    nomen: {
      gruppe: string;
      eintraege: { art: string; wort: string; pl: string; en: string }[];
    }[];
    adjektive: { wort: string; gegenteil: string; en: string }[];
    kleineWoerter: { gruppe: string; woerter: string }[];
  };
}
