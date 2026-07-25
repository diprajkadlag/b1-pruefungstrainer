/**
 * Shapes the app and the server both read.
 *
 * These mirror packages/schema/exam.schema.json, which is the authority — the
 * Python validator enforces it on every content change. Keep them in step.
 */

export type Variante = 'erwachsene' | 'jugendliche';
export type Niveau = 'mittel-leicht' | 'mittel';

export type ItemTyp =
  | 'richtig_falsch'
  | 'multiple_choice'
  | 'zuordnung_anzeigen'
  | 'ja_nein'
  | 'zuordnung_person';

export interface Optionen {
  a: string;
  b: string;
  c: string;
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
  anzeigen?: Anzeige[];
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
  typ: 'email_informell' | 'forumsbeitrag' | 'email_halbformell';
  situation: string;
  impuls?: string;
  aufgabenstellung: string;
  leitpunkte: string[];
  anrede?: string;
  woerter: 40 | 80;
  zeitMinuten: number;
  punkte: number;
}

export interface SprechenThema {
  titel: string;
  folien: string[];
}

export interface PartnerTurn {
  text: string;
  wartenSek: number;
  hinweis?: string;
}

export interface SprechenTeil {
  nummer: number;
  typ: 'gemeinsam_planen' | 'praesentation' | 'rueckmeldung';
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
