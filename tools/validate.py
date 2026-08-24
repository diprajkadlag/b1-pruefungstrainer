#!/usr/bin/env python3
"""Validate practice exams against the schema and the examination specification.

JSON Schema catches shape errors. This script catches the errors that actually
matter for an exam paper: wrong item counts, point totals that do not reach 100,
answer keys that no text supports, glossary entries for words that never appear.

    python tools/validate.py                 # every exam in content/exams
    python tools/validate.py pruefung-01     # just one
    python tools/validate.py --strict        # warnings become failures

Two levels are supported and every rule below is read from the table for the
level the paper declares in meta.stufe. B1 and B2 differ in almost every number,
including which listening parts are heard twice, so nothing here may be
hard-coded to one of them.

Exit code 0 means every paper is structurally sound and safe to build.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "exams"
LERNHILFE = ROOT / "content" / "lernhilfe"
SPRECHEN = ROOT / "content" / "sprechen"
SCHEMA = ROOT / "packages" / "schema" / "exam.schema.json"

MODULNAMEN = ("Lesen", "Hören", "Schreiben", "Sprechen")

BESTEHENSGRENZE = 60

# Share of one answer within a part above which the part stops measuring
# anything. See check_schluesselverteilung for why it is this loose.
MAX_GLEICHE_LOESUNG = 0.8

NARRATOR = "Sprecher"


# --------------------------------------------------------------------------
# The examination specification, as data. Every number below traces back to the
# published format: see docs/EXAM-FORMAT.md for the source of each one.
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Format:
    """One level's rule set. Everything the checks below are allowed to know."""

    stufe: str

    # Lesen — five parts at both levels, but nothing else in common.
    lesen_items: tuple[int, ...]
    lesen_typ: tuple[str, ...]
    lesen_item_typ: tuple[str, ...]
    lesen_ohne_beispiel: tuple[int, ...]  # 0-based Teil indices with no worked example

    # Hören — four parts. `hoeren_item_typ` is None where the part mixes types.
    hoeren_items: tuple[int, ...]
    hoeren_typ: tuple[str, ...]
    hoeren_item_typ: tuple[str | None, ...]
    hoeren_wiederholungen: tuple[int, ...]
    hoeren_zuordnung_teil: int  # the part where items name a speaker

    # Schreiben
    schreiben_typ: tuple[str, ...]
    schreiben_punkte: tuple[int, ...]
    schreiben_zeit: tuple[int, ...]
    schreiben_woerter: tuple[int, ...]
    schreiben_impuls_bei: tuple[int, ...]  # 0-based tasks needing an 'impuls'
    # B2 states a *minimum* word count; B1 states a target. A model answer at
    # 210 words is exemplary at B2 and overlong at B1, so the window differs.
    woerter_ist_mindestmass: bool

    # Sprechen
    sprechen_typ: tuple[str, ...]
    sprechen_punkte: tuple[int, ...]
    sprechen_aussprache: int
    sprechen_themen_teil: int  # the part offering a choice of two topics
    folien: int  # outline points printed on the presentation card

    # B2 only: parts built from a lettered list of alternatives, and how long
    # that list is. Empty at B1, whose one matching task uses `anzeigen`.
    optionenliste: dict[int, int] = field(default_factory=dict)
    # The same, for a *listening* part. A2 Teil 2 matches nine lettered options
    # to five moments of one conversation.
    hoeren_optionenliste: dict[int, int] = field(default_factory=dict)
    lueckenteile: tuple[int, ...] = ()  # parts whose text carries [nr] gap markers

    # What one module is worth on the certificate. B1 and B2 are modular and
    # award 100 per module; A2 is one examination of 100 in which each part is
    # capped at 25. See docs/EXAM-FORMAT.md.
    modul_punkte: int = 100
    # What the writing criteria add up to before any conversion.
    #
    # At B1 and B2 these are the certificate points themselves. At A2 the
    # marking sheet totals 20 raw Messpunkte — 5 for Aufgabenerfüllung and 5
    # for Sprache on each of the two tasks — which are then multiplied by 1.25
    # like Lesen and Hören. Sprechen is the exception: it is scored out of 25
    # directly, with no conversion, which is why it has no field of its own.
    schreiben_maximum: int = 100
    # Upper end of the writing word range, where the level states one. A2 asks
    # for 20-30 and 30-40 words; the other two state a target or a floor.
    schreiben_woerter_max: tuple[int, ...] = ()
    # Items per short text in listening Teil 1: two at B1 and B2 (one
    # true/false and one multiple choice), one at A2 and A1.
    hoeren_teil1_pro_text: int = 2
    # How many cards each speaking part hands the candidate, 0 where a part
    # works from something else. A1 uses cards in all three parts; A2 in one.
    sprechen_karten: tuple[int, ...] = ()
    # Listening parts whose items must each name the short text they belong to,
    # with the number of texts expected. A1 splits every part this way.
    hoeren_abschnitte: dict[int, int] = field(default_factory=dict)

    @property
    def gesamt_items(self) -> int:
        """Items in one receptive module. 20 at A2, 30 at B1 and B2."""
        return sum(self.lesen_items)

    @property
    def module_teile(self) -> dict[str, int]:
        """Highest Teil number per module, for checking `fundstelle` strings."""
        return {
            "Lesen": len(self.lesen_items),
            "Hören": len(self.hoeren_items),
            "Schreiben": len(self.schreiben_typ),
            "Sprechen": len(self.sprechen_typ),
        }


FORMATE: dict[str, Format] = {
    "A1": Format(
        stufe="A1",
        # Three parts per receptive module rather than four, and fifteen items
        # rather than twenty or thirty. Nothing at A1 runs long.
        lesen_items=(5, 5, 5),
        lesen_typ=("kurzmitteilungen", "wo_finde_ich", "hinweisschilder"),
        lesen_item_typ=("richtig_falsch", "zwei_optionen", "richtig_falsch"),
        # Every A1 part carries a worked example, including the first.
        lesen_ohne_beispiel=(),
        hoeren_items=(6, 4, 5),
        hoeren_typ=("kurzgespraeche", "durchsagen", "ansagen"),
        hoeren_item_typ=("multiple_choice", "richtig_falsch", "multiple_choice"),
        # A third pattern again: A2 and B1 repeat 1 and 4, B2 repeats 2 and 4,
        # and A1 repeats 1 and 3 — only the announcements are heard once.
        hoeren_wiederholungen=(2, 1, 2),
        hoeren_zuordnung_teil=0,
        hoeren_teil1_pro_text=1,
        hoeren_abschnitte={1: 6, 2: 4, 3: 5},
        schreiben_typ=("formular", "kurzmitteilung"),
        schreiben_punkte=(5, 10),
        schreiben_zeit=(8, 12),
        # Teil 1 is a form and has no word count at all; Teil 2 asks for about
        # thirty words, as a target rather than a range.
        schreiben_woerter=(0, 30),
        schreiben_impuls_bei=(),
        woerter_ist_mindestmass=False,
        sprechen_typ=(
            "sich_vorstellen", "informationen_erfragen", "bitten_formulieren",
        ),
        sprechen_punkte=(3, 6, 6),
        sprechen_aussprache=0,
        sprechen_themen_teil=0,
        folien=0,
        sprechen_karten=(7, 2, 3),
        modul_punkte=15,
        schreiben_maximum=15,
    ),
    "A2": Format(
        stufe="A2",
        # Four parts of five everywhere, which is the first thing that makes an
        # A2 paper feel different from a B1 one: nothing runs long.
        lesen_items=(5, 5, 5, 5),
        lesen_typ=(
            "multiple_choice", "multiple_choice", "multiple_choice",
            "zuordnung_anzeigen",
        ),
        lesen_item_typ=(
            "multiple_choice", "multiple_choice", "multiple_choice",
            "zuordnung_anzeigen",
        ),
        # Only the matching task carries a worked example in the real paper;
        # the three multiple-choice parts start straight at item 1, 6 and 11.
        lesen_ohne_beispiel=(0, 1, 2),
        hoeren_items=(5, 5, 5, 5),
        hoeren_typ=("kurztexte", "gespraech", "kurzgespraeche", "interview"),
        hoeren_item_typ=(
            "multiple_choice", "zuordnung_buchstabe", "multiple_choice",
            "richtig_falsch",
        ),
        # Teile 1 and 4 twice, as at B1 — and the mirror of B2.
        hoeren_wiederholungen=(2, 1, 1, 2),
        # No part asks which of several speakers said something, so nothing to
        # check. 0 disables it rather than pointing at a real Teil.
        hoeren_zuordnung_teil=0,
        hoeren_optionenliste={2: 9},
        hoeren_teil1_pro_text=1,
        schreiben_typ=("sms", "email_halbformell"),
        schreiben_punkte=(10, 10),
        schreiben_zeit=(10, 20),
        schreiben_woerter=(20, 30),
        schreiben_woerter_max=(30, 40),
        schreiben_impuls_bei=(),
        woerter_ist_mindestmass=False,
        sprechen_typ=(
            "fragen_zur_person", "ueber_sich_erzaehlen", "gemeinsam_planen",
        ),
        sprechen_punkte=(4, 8, 8),
        sprechen_aussprache=5,
        # No presentation, so no choice of topic and no outline to print.
        sprechen_themen_teil=0,
        folien=0,
        # Only Teil 1 works from cards at A2.
        sprechen_karten=(4, 0, 0),
        modul_punkte=25,
        schreiben_maximum=20,
    ),
    "B1": Format(
        stufe="B1",
        lesen_items=(6, 6, 7, 7, 4),
        lesen_typ=(
            "richtig_falsch", "multiple_choice", "zuordnung_anzeigen",
            "ja_nein", "multiple_choice",
        ),
        lesen_item_typ=(
            "richtig_falsch", "multiple_choice", "zuordnung_anzeigen",
            "ja_nein", "multiple_choice",
        ),
        # Teil 2 is the one reading part with no worked example in the real
        # paper — the two articles start straight at item 7.
        lesen_ohne_beispiel=(1,),
        hoeren_items=(10, 5, 7, 8),
        hoeren_typ=("kurztexte", "monolog", "gespraech", "diskussion"),
        hoeren_item_typ=(None, "multiple_choice", "richtig_falsch", "zuordnung_person"),
        hoeren_wiederholungen=(2, 1, 1, 2),
        hoeren_zuordnung_teil=4,
        schreiben_typ=("email_informell", "forumsbeitrag", "email_halbformell"),
        schreiben_punkte=(40, 40, 20),
        schreiben_zeit=(20, 25, 15),
        schreiben_woerter=(80, 80, 40),
        schreiben_impuls_bei=(1,),
        woerter_ist_mindestmass=False,
        sprechen_typ=("gemeinsam_planen", "praesentation", "rueckmeldung"),
        sprechen_punkte=(28, 40, 16),
        sprechen_aussprache=16,
        sprechen_themen_teil=2,
        folien=5,
    ),
    "B2": Format(
        stufe="B2",
        lesen_items=(9, 6, 6, 6, 3),
        lesen_typ=(
            "zuordnung_person", "satz_einfuegen", "multiple_choice",
            "zuordnung_aeusserungen", "zuordnung_ueberschriften",
        ),
        lesen_item_typ=(
            "zuordnung_person", "zuordnung_buchstabe", "multiple_choice",
            "zuordnung_buchstabe", "zuordnung_buchstabe",
        ),
        lesen_ohne_beispiel=(2,),  # the multiple-choice article starts at item 16
        hoeren_items=(10, 6, 6, 8),
        hoeren_typ=("kurztexte", "interview", "gespraech", "vortrag"),
        hoeren_item_typ=(None, "multiple_choice", "zuordnung_person", "multiple_choice"),
        # The mirror image of B1: here it is Teile 2 and 4 that are heard twice.
        hoeren_wiederholungen=(1, 2, 1, 2),
        hoeren_zuordnung_teil=3,
        schreiben_typ=("forumsbeitrag", "nachricht_formell"),
        schreiben_punkte=(60, 40),
        schreiben_zeit=(50, 25),
        schreiben_woerter=(150, 100),
        schreiben_impuls_bei=(0,),
        woerter_ist_mindestmass=True,
        sprechen_typ=("vortrag", "diskussion"),
        sprechen_punkte=(50, 50),
        # Pronunciation is judged inside the two parts, not as a separate block.
        sprechen_aussprache=0,
        sprechen_themen_teil=1,
        folien=4,
        optionenliste={2: 8, 4: 8, 5: 8},
        lueckenteile=(2, 5),
    ),
}

VALID_LOESUNG = {
    "richtig_falsch": {"richtig", "falsch"},
    # A1 Lesen Teil 2 offers two places and asks which one has the answer. It
    # is the only task in the collection with two options rather than three.
    "zwei_optionen": {"a", "b"},
    "ja_nein": {"ja", "nein"},
    "multiple_choice": {"a", "b", "c"},
    "zuordnung_person": {"a", "b", "c", "d"},
    # "0" at B1 and "x" at A2 both mean "none of these fits", which each level
    # prints on the paper in its own notation.
    "zuordnung_anzeigen": set("abcdefghij") | {"0", "x"},
    "zuordnung_buchstabe": set("abcdefghij"),
}

GAP = re.compile(r"\[(\d{1,2})\]")

# Longest first, so "zurück" is tried before "zu" and "auseinander" before "aus".
SEPARABLE_PREFIXES = sorted(
    {
        "auseinander", "gegenüber", "zusammen", "entgegen", "zurecht", "zurück",
        "voraus", "vorbei", "weiter", "herunter", "hinunter", "herein", "hinein",
        "davon", "dabei", "durch", "empor", "statt", "unter", "wieder", "hoch",
        "fest", "fort", "heim", "über", "voran", "weg", "her", "hin",
        "los", "mit", "nach", "teil", "vor", "zu", "ab", "an", "auf", "aus",
        "bei", "ein", "um", "frei", "fern", "voll", "wahr", "leer",
    },
    key=len,
    reverse=True,
)


# --------------------------------------------------------------------------
# Findings
# --------------------------------------------------------------------------


@dataclass
class Finding:
    level: str  # "error" | "warn"
    where: str
    message: str

    def __str__(self) -> str:
        tag = "ERROR" if self.level == "error" else "warn "
        return f"  [{tag}] {self.where}: {self.message}"


@dataclass
class Report:
    exam_id: str
    findings: list[Finding] = field(default_factory=list)

    def error(self, where: str, message: str) -> None:
        self.findings.append(Finding("error", where, message))

    def warn(self, where: str, message: str) -> None:
        self.findings.append(Finding("warn", where, message))

    @property
    def errors(self) -> list[Finding]:
        return [f for f in self.findings if f.level == "error"]

    @property
    def warnings(self) -> list[Finding]:
        return [f for f in self.findings if f.level == "warn"]


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def normalise(text: str) -> str:
    """Casefold, strip accents-insensitively-safe, collapse whitespace.

    German umlauts are meaningful, so they are preserved; only case and
    whitespace are normalised, plus the various dash and quote characters that
    creep in from editors.
    """
    text = unicodedata.normalize("NFC", text)
    text = text.replace("’", "'").replace("‘", "'")
    text = text.replace("“", '"').replace("”", '"').replace("„", '"')
    text = text.replace("–", "-").replace("—", "-").replace("‑", "-")
    text = re.sub(r"\s+", " ", text)
    return text.casefold().strip()


def all_prose(exam: dict[str, Any]) -> str:
    """Every word a candidate reads or hears in this paper, as one blob."""
    chunks: list[str] = []

    for teil in exam.get("lesen", {}).get("teile", []):
        for t in teil.get("texte", []) or []:
            chunks.append(t.get("titel", ""))
            chunks.append(t["inhalt"])
        for a in teil.get("anzeigen", []) or []:
            chunks.append(a.get("titel", ""))
            chunks.append(a["inhalt"])
        # The B2 lettered alternatives are as much a part of the paper as the
        # text is — at Teil 4 they *are* the text — so the glossary may cite them.
        for o in teil.get("optionenliste", []) or []:
            chunks.append(o.get("titel", ""))
            chunks.append(o["inhalt"])
        chunks.append(teil.get("these", "") or "")
        for item in list(teil.get("items", [])) + _beispiel_list(teil):
            chunks.append(item.get("frage", ""))
            for opt in (item.get("optionen") or {}).values():
                chunks.append(opt)

    for teil in exam.get("hoeren", {}).get("teile", []):
        for line in teil.get("skript", []):
            chunks.append(line["text"])
        # At A2 Teil 2 the nine lettered labels are printed on the paper and are
        # as much a part of it as the script the candidate hears.
        for o in teil.get("optionenliste", []) or []:
            chunks.append(o.get("titel", ""))
            chunks.append(o["inhalt"])
        chunks.append(teil.get("situation", "") or "")
        for item in list(teil.get("items", [])) + _beispiel_list(teil):
            chunks.append(item.get("frage", ""))
            for opt in (item.get("optionen") or {}).values():
                chunks.append(opt)

    for auf in exam.get("schreiben", {}).get("aufgaben", []):
        chunks.append(auf.get("situation", ""))
        chunks.append(auf.get("impuls", "") or "")
        chunks.append(auf.get("aufgabenstellung", ""))
        chunks.extend(auf.get("leitpunkte", []))
        for ml in auf.get("musterloesungen", []):
            chunks.append(ml["text"])

    for teil in exam.get("sprechen", {}).get("teile", []):
        chunks.append(teil.get("situation", "") or "")
        chunks.append(teil.get("anweisung", ""))
        chunks.extend(teil.get("planungspunkte", []) or [])
        chunks.extend(teil.get("fragen", []) or [])
        for thema in teil.get("themen", []) or []:
            chunks.append(thema["titel"])
            chunks.extend(thema["folien"])
            chunks.append(thema.get("musterantwort", "") or "")
        for p in teil.get("partnerSkript", []) or []:
            chunks.append(p["text"])

    return normalise(" ".join(c for c in chunks if c))


def _beispiel_list(teil: dict[str, Any]) -> list[dict[str, Any]]:
    b = teil.get("beispiel")
    return [b] if b else []


def ohne_platzhalter(wendung: str) -> str:
    """Strip what a dictionary writes but a running text never says.

    Citation forms carry articles, reflexive pronouns and placeholder objects —
    "sich etwas abschauen", "jemandem etwas vormachen", "die Gebühr". None of
    them survive into prose in that order, so both the glossary and the idiom
    list match against the reduced form.
    """
    bare = re.sub(
        r"\b(sich|der|die|das|etwas|etw\.?|jemanden|jemandem|jemand|jdn\.?|jdm\.?)\b",
        " ",
        wendung,
        flags=re.IGNORECASE,
    )
    return re.sub(r"\s+", " ", bare).strip()


def lemma_variants(entry: dict[str, Any]) -> list[str]:
    """Surface forms that should count as an occurrence of this lemma.

    A glossary lists `sich bewerben`, but the text says `bewirbt sich`. Matching
    only the citation form would reject perfectly good entries, so accept the
    stem and the supplied inflected forms too.
    """
    lemma = entry["lemma"]
    out = {lemma}

    bare = ohne_platzhalter(lemma)
    out.add(bare)

    if entry["wortart"] == "verb":
        forms = entry.get("stammformen") or {}
        out.update(v for v in forms.values() if isinstance(v, str))
        # Perfect is stored as "hat beworben"; the participle alone is enough.
        perfekt = forms.get("perfekt", "")
        if " " in perfekt:
            out.add(perfekt.split(" ", 1)[1])
        # The stem, for the person forms nobody lists in stammformen. A
        # glossary gives "bestreiten" with its 3rd-person and past forms, but
        # the paper may well say "bestreite ich nicht". Five characters is the
        # floor: shorter stems like "geh" would match "gehört" and let a bogus
        # entry through.
        if len(bare) > 6 and bare.endswith(("en", "ln", "rn")):
            out.add(bare[:-2])

        if entry.get("trennbar"):
            # A separable verb keeps its prefix in a subordinate clause
            # ("...dass die Firma ankündigte") but loses it in a main clause
            # ("die Firma kündigte an", "der Nebel löst sich auf"). Accept the
            # stem both with and without the prefix so either position matches.
            if len(bare) > 4:
                out.add(bare[:-2])  # drop the -en ending: ankündigen -> ankündig
            for prefix in SEPARABLE_PREFIXES:
                if bare.startswith(prefix) and len(bare) - len(prefix) > 4:
                    root = bare[len(prefix):]
                    out.add(root)
                    out.add(root[:-2])  # auflösen -> lösen -> lös
                    # The zu-infinitive: freihalten -> freizuhalten.
                    out.add(f"{prefix}zu{root}")
                    break
    elif entry["wortart"] == "nomen":
        plural = entry.get("plural", "")
        if plural and not plural.startswith(("-", '"')):
            out.add(re.sub(r"^(der|die|das)\s+", "", plural))
        # Nouns compound and decline; the stem is the reliable anchor.
        if len(bare) > 6:
            out.add(bare[:-1])
    elif entry["wortart"] in {"adjektiv", "adverb"} and len(bare) > 5:
        out.add(bare)  # declined endings are handled by substring matching

    return [normalise(v) for v in out if v and len(v) >= 3]


# --------------------------------------------------------------------------
# Rule groups
# --------------------------------------------------------------------------


def check_schema(exam: dict[str, Any], rep: Report) -> bool:
    try:
        import jsonschema
    except ImportError:
        rep.warn("schema", "jsonschema not installed - shape validation skipped "
                           "(pip install -r tools/requirements.txt)")
        return True

    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    validator = jsonschema.Draft202012Validator(schema)
    ok = True
    for err in sorted(validator.iter_errors(exam), key=lambda e: list(e.path)):
        path = "/".join(str(p) for p in err.path) or "<root>"
        rep.error(f"schema:{path}", err.message)
        ok = False
    return ok


def check_lesen(exam: dict[str, Any], spec: Format, rep: Report) -> None:
    teile = exam["lesen"]["teile"]
    seen_nrs: list[int] = []

    for idx, teil in enumerate(teile):
        w = f"lesen/teil{idx + 1}"

        if teil["nummer"] != idx + 1:
            rep.error(w, f"nummer is {teil['nummer']}, expected {idx + 1}")
        if teil["typ"] != spec.lesen_typ[idx]:
            rep.error(w, f"typ is '{teil['typ']}', {spec.stufe} requires "
                         f"'{spec.lesen_typ[idx]}'")

        items = teil["items"]
        expected = spec.lesen_items[idx]
        if len(items) != expected:
            rep.error(w, f"has {len(items)} items, {spec.stufe} requires exactly {expected}")

        for item in items:
            seen_nrs.append(item["nr"])
            check_item(item, spec.lesen_item_typ[idx], f"{w}/item{item['nr']}", rep)

        if spec.stufe == "A1":
            check_lesen_teil_a1(idx, teil, w, rep)
        elif spec.stufe == "A2":
            check_lesen_teil_a2(idx, teil, w, rep)
        elif spec.stufe == "B1":
            check_lesen_teil_b1(idx, teil, w, rep)
        else:
            check_lesen_teil_b2(idx, teil, spec, w, rep)

        check_schluesselverteilung(teil, w, rep)

        if idx not in spec.lesen_ohne_beispiel and not teil.get("beispiel"):
            rep.warn(w, "no Beispiel - this Teil shows a worked example in the real paper")

    check_numbering(seen_nrs, "lesen", sum(spec.lesen_items), rep)


def check_lesen_teil_a1(idx: int, teil: dict[str, Any], w: str, rep: Report) -> None:
    """The three reading sources at A1.

    Teil 1 rests on two short personal messages, Teil 3 on five separate signs
    and notices — one per item, so every item has to say which sign it is
    about. Teil 2 carries no text of its own at all: each item *is* the task,
    naming a need and offering two places to look.
    """
    texte = teil.get("texte") or []

    if idx == 0:
        if len(texte) != 2:
            rep.error(w, f"needs exactly 2 short messages, found {len(texte)}")
        ids = {x["id"] for x in texte}
        for item in teil["items"]:
            if item.get("textId") not in ids:
                rep.error(f"{w}/item{item['nr']}",
                          "no 'textId' - with two messages side by side, an item "
                          "must say which one it is about")

    if idx == 1:
        if texte:
            rep.error(w, "Teil 2 carries no text of its own; the two places to "
                         "choose between belong to each item")
        for item in teil["items"]:
            optionen = item.get("optionen") or {}
            if sorted(optionen) != ["a", "b"]:
                rep.error(f"{w}/item{item['nr']}",
                          f"needs exactly two options a and b, found {sorted(optionen)}")

    if idx == 2:
        if len(texte) != 5:
            rep.error(w, f"needs exactly 5 signs or notices, one per item, "
                         f"found {len(texte)}")
        ids = {x["id"] for x in texte}
        gesehen = set()
        for item in teil["items"]:
            tid = item.get("textId")
            if tid not in ids:
                rep.error(f"{w}/item{item['nr']}", "no 'textId' naming its sign")
            elif tid in gesehen:
                rep.error(f"{w}/item{item['nr']}",
                          f"sign '{tid}' already has an item; A1 asks one question "
                          f"per sign")
            gesehen.add(tid)


def check_lesen_teil_a2(idx: int, teil: dict[str, Any], w: str, rep: Report) -> None:
    """The three reading sources at A2, and the one matching task.

    Teile 1-3 each rest on a single short text and differ only in what kind:
    a press article, a board or programme, and one private email. Teil 4 is the
    small ads, and is the one part of any A2 paper where an item is allowed to
    have no answer at all.
    """
    if idx in (0, 1, 2):
        texte = teil.get("texte") or []
        if len(texte) != 1:
            quelle = ("a short article", "an information board or programme",
                      "one private email")[idx]
            rep.error(w, f"needs exactly one text ({quelle}), found {len(texte)}")

    if idx == 3:
        anzeigen = teil.get("anzeigen") or []
        if len(anzeigen) != 6:
            rep.error(w, f"needs exactly 6 small ads a-f, found {len(anzeigen)}")
        if not teil.get("beispiel"):
            rep.error(w, "the matching task needs a worked example - it consumes "
                         "one ad, which is what makes the count work out")

        keys = [str(i["loesung"]).lower() for i in teil["items"]]
        ohne = [k for k in keys if k == "x"]
        if len(ohne) != 1:
            rep.error(w, f"exactly one item must be keyed 'x' - the instruction "
                         f"promises that one person finds nothing, found {len(ohne)}")

        vergeben = [k for k in keys if k != "x"]
        if len(set(vergeben)) != len(vergeben):
            rep.error(w, "an ad answers two people; each may be used only once")

        beispiel = str((teil.get("beispiel") or {}).get("loesung", "")).lower()
        if beispiel and beispiel in vergeben:
            rep.error(w, f"ad '{beispiel}' is used by the worked example and cannot "
                         f"also be an answer")


def check_lesen_teil_b1(idx: int, teil: dict[str, Any], w: str, rep: Report) -> None:
    if idx == 0 and not teil.get("texte"):
        rep.error(w, "Teil 1 needs one text (blog / personal report)")
    if idx == 1:
        texte = teil.get("texte") or []
        if len(texte) != 2:
            rep.error(w, f"Teil 2 needs exactly 2 articles, found {len(texte)}")
        else:
            per_text: dict[str, int] = {}
            for item in teil["items"]:
                tid = item.get("textId")
                if not tid:
                    rep.error(w, f"item {item['nr']} has no textId; Teil 2 items must "
                                 "say which article they belong to")
                else:
                    per_text[tid] = per_text.get(tid, 0) + 1
            known = {t["id"] for t in texte}
            for tid, count in per_text.items():
                if tid not in known:
                    rep.error(w, f"textId '{tid}' does not match any text in this Teil")
                elif count != 3:
                    rep.error(w, f"text '{tid}' has {count} items, spec requires 3 per article")
    if idx == 2:
        check_zuordnung(teil, w, rep)
    if idx == 3 and not teil.get("these"):
        rep.error(w, "Teil 4 needs a 'these' - the proposition readers react to")
    if idx == 4 and not teil.get("texte"):
        rep.error(w, "Teil 5 needs one text (Benutzungs- or Hausordnung)")


def check_lesen_teil_b2(idx: int, teil: dict[str, Any], spec: Format,
                        w: str, rep: Report) -> None:
    nummer = idx + 1

    if nummer == 1:
        check_vier_personen(teil, w, rep)
    elif nummer == 3 and len(teil.get("texte") or []) != 1:
        rep.error(w, "Teil 3 needs exactly one article")

    if nummer in spec.optionenliste:
        check_optionenliste(teil, spec.optionenliste[nummer], w, rep)
    elif teil.get("optionenliste"):
        rep.error(w, "this Teil has no lettered alternatives at B2, but carries "
                     "an 'optionenliste'")

    if nummer in spec.lueckenteile:
        check_luecken(teil, w, rep)
    if nummer == 4 and teil.get("texte"):
        rep.error(w, "Teil 4 is built from the lettered opinions themselves; it must "
                     "not also carry 'texte'")


def check_vier_personen(teil: dict[str, Any], w: str, rep: Report) -> None:
    """B2 Lesen Teil 1: nine statements matched to four named forum writers."""
    texte = teil.get("texte") or []
    if len(texte) != 4:
        rep.error(w, f"Teil 1 needs exactly 4 forum posts, found {len(texte)}")

    buchstaben = [t.get("buchstabe") for t in texte]
    if sorted(b for b in buchstaben if b) != list("abcd"):
        rep.error(w, f"the four posts must be labelled a-d exactly once each, "
                     f"found {sorted(b for b in buchstaben if b)}")

    namen = {t.get("buchstabe"): (t.get("titel") or "").strip() for t in texte}
    keys: list[str] = []
    for item in teil["items"]:
        keys.append(item["loesung"])
        opts = item.get("optionen") or {}
        if sorted(opts) != list("abcd"):
            rep.error(f"{w}/item{item['nr']}",
                      f"needs one option per writer (a-d), found {sorted(opts)}")
            continue
        for buchstabe, label in opts.items():
            erwartet = namen.get(buchstabe)
            if not erwartet:
                continue
            # The post is headed "Name, Beruf" while the option lists the name
            # alone, exactly as the printed paper does. So one has to contain
            # the other — equality would forbid the normal form, and no check
            # at all would let an option point at somebody who is not there.
            kurz, lang = normalise(label), normalise(erwartet)
            if kurz not in lang and lang not in kurz:
                rep.error(f"{w}/item{item['nr']}",
                          f"option {buchstabe} is '{label}' but post {buchstabe} is "
                          f"'{erwartet}' - the labels must name the same writer")

    # Reuse is expected here, unlike every other matching task. What is not
    # acceptable is a writer who answers nothing: they are then pure scenery.
    for buchstabe in "abcd":
        if buchstabe not in keys:
            rep.warn(w, f"no statement is keyed '{buchstabe}' - that writer carries no "
                        f"answer, which makes the task easier than the real thing")


def check_optionenliste(teil: dict[str, Any], erwartet: int, w: str, rep: Report) -> None:
    """B2 Teile 2, 4 and 5: a lettered list of which some entries are decoys."""
    liste = teil.get("optionenliste") or []
    if not liste:
        rep.error(w, f"needs an 'optionenliste' of {erwartet} lettered alternatives")
        return

    letters = [o["buchstabe"] for o in liste]
    erwartete_letters = list("abcdefghij")[:erwartet]
    if sorted(letters) != erwartete_letters:
        rep.error(w, f"alternatives must be labelled {erwartete_letters[0]}-"
                     f"{erwartete_letters[-1]} exactly once each, found {sorted(letters)}")

    keys = [i["loesung"] for i in teil["items"]]
    beispiel = teil.get("beispiel")
    if beispiel:
        # The letter shown in the worked example is spent: the candidate can see
        # it is taken, and re-using it would make one item free.
        keys.append(beispiel["loesung"])

    dupes = {k for k in keys if keys.count(k) > 1}
    if dupes:
        rep.error(w, f"each alternative may answer at most one item; reused: {sorted(dupes)}")

    unknown = set(keys) - set(letters)
    if unknown:
        rep.error(w, f"keys point at alternatives that do not exist: {sorted(unknown)}")

    uebrig = len(letters) - len(set(keys))
    if uebrig < 1:
        rep.error(w, "every alternative is used - the task needs at least one decoy")


def check_luecken(teil: dict[str, Any], w: str, rep: Report) -> None:
    """B2 Teile 2 and 5: each gap in the text is marked with its item number."""
    texte = teil.get("texte") or []
    if len(texte) != 1:
        rep.error(w, f"needs exactly one text to place the gaps in, found {len(texte)}")
        return

    inhalt = texte[0]["inhalt"]
    gefunden = [int(n) for n in GAP.findall(inhalt)]
    erwartet = [i["nr"] for i in teil["items"]]

    fehlend = sorted(set(erwartet) - set(gefunden))
    if fehlend:
        rep.error(w, f"the text has no gap marker for item(s) {fehlend}; write them "
                     f"as {' '.join(f'[{n}]' for n in fehlend)} where the gap belongs")

    verwaist = sorted(set(gefunden) - set(erwartet))
    if verwaist:
        rep.error(w, f"the text marks gap(s) {verwaist} that no item asks about")

    doppelt = sorted({n for n in gefunden if gefunden.count(n) > 1})
    if doppelt:
        rep.error(w, f"gap marker(s) {doppelt} appear more than once in the text")


def check_zuordnung(teil: dict[str, Any], w: str, rep: Report) -> None:
    """B1 Teil 3: ten ads, seven situations, exactly one of which has no match."""
    anzeigen = teil.get("anzeigen") or []
    letters = [a["buchstabe"] for a in anzeigen]

    if sorted(letters) != list("abcdefghij"):
        rep.error(w, f"ads must be labelled a-j exactly once each, found {sorted(letters)}")

    keys = [i["loesung"] for i in teil["items"]]
    null_count = keys.count("0")
    if null_count != 1:
        rep.error(w, f"exactly one situation must have no matching ad (key '0'), "
                     f"found {null_count}")

    used = [k for k in keys if k != "0"]
    dupes = {k for k in used if used.count(k) > 1}
    if dupes:
        rep.error(w, f"each ad may answer at most one situation; reused: {sorted(dupes)}")

    unknown = set(used) - set(letters)
    if unknown:
        rep.error(w, f"keys point at ads that do not exist: {sorted(unknown)}")

    # A distractor ad that no situation uses is correct and expected: 10 ads,
    # 6 real matches. But if too few are distractors the task is trivial.
    if len(set(used)) > 7:
        rep.warn(w, "almost every ad is a key - the task needs more distractor ads")


def check_hoeren(exam: dict[str, Any], spec: Format, rep: Report) -> None:
    teile = exam["hoeren"]["teile"]
    seen_nrs: list[int] = []

    for idx, teil in enumerate(teile):
        w = f"hoeren/teil{idx + 1}"

        if teil["nummer"] != idx + 1:
            rep.error(w, f"nummer is {teil['nummer']}, expected {idx + 1}")
        if teil["typ"] != spec.hoeren_typ[idx]:
            rep.error(w, f"typ is '{teil['typ']}', {spec.stufe} requires "
                         f"'{spec.hoeren_typ[idx]}'")
        if teil["wiederholungen"] != spec.hoeren_wiederholungen[idx]:
            rep.error(w, f"heard {teil['wiederholungen']}x, {spec.stufe} requires "
                         f"{spec.hoeren_wiederholungen[idx]}x")

        items = teil["items"]
        expected = spec.hoeren_items[idx]
        if len(items) != expected:
            rep.error(w, f"has {len(items)} items, {spec.stufe} requires exactly {expected}")

        for item in items:
            seen_nrs.append(item["nr"])

        erwarteter_typ = spec.hoeren_item_typ[idx]
        if erwarteter_typ is None:
            check_hoeren_teil1(teil, spec, w, rep)
        else:
            for item in items:
                check_item(item, erwarteter_typ, f"{w}/item{item['nr']}", rep)
            # A2 keeps the five-short-texts shape but hangs one item off each
            # rather than two, so the grouping still has to be checked. A1 has
            # its own count per part and is covered by check_abschnitte below.
            if (idx == 0 and spec.hoeren_teil1_pro_text == 1
                    and not spec.hoeren_abschnitte):
                check_hoeren_teil1(teil, spec, w, rep)

        if teil["nummer"] in spec.hoeren_abschnitte:
            check_abschnitte(teil, spec.hoeren_abschnitte[teil["nummer"]], w, rep)

        if teil["nummer"] in spec.hoeren_optionenliste:
            check_optionenliste(teil, spec.hoeren_optionenliste[teil["nummer"]], w, rep)

        check_schluesselverteilung(teil, w, rep)

        if teil["nummer"] == spec.hoeren_zuordnung_teil:
            check_mehrere_sprecher(teil, w, rep)

        check_skript(teil, w, rep)

    check_numbering(seen_nrs, "hoeren", sum(spec.hoeren_items), rep)


def check_hoeren_teil1(teil: dict[str, Any], spec: Format, w: str, rep: Report) -> None:
    """Five short texts, with the items each level hangs off them.

    B1 and B2 ask two questions per text — one true/false and one multiple
    choice. A2 asks one, always multiple choice. Either way there are exactly
    five texts and every item must say which one it belongs to, or a candidate
    cannot tell where one announcement ends and the next begins.
    """
    pro_text = spec.hoeren_teil1_pro_text
    abschnitte: dict[str, list[dict[str, Any]]] = {}
    for item in teil["items"]:
        key = item.get("abschnitt")
        if not key:
            rep.error(w, f"item {item['nr']} has no 'abschnitt'; Teil 1 items must say "
                         "which of the five short texts they belong to")
            continue
        abschnitte.setdefault(key, []).append(item)

    if abschnitte and len(abschnitte) != 5:
        rep.error(w, f"Teil 1 must contain exactly 5 short texts, found {len(abschnitte)}")

    erwartet = (["multiple_choice"] if pro_text == 1
                else ["multiple_choice", "richtig_falsch"])
    for name, items in sorted(abschnitte.items()):
        typen = sorted(i["typ"] for i in items)
        if typen != erwartet:
            rep.error(f"{w}/{name}", f"each short text needs exactly {' and '.join(erwartet)}, "
                                     f"found {typen}")
        if pro_text != 1:
            for item in items:
                check_item(item, item["typ"], f"{w}/item{item['nr']}", rep)


def check_abschnitte(teil: dict[str, Any], erwartet: int, w: str, rep: Report) -> None:
    """One short text per item, and every item saying which one it belongs to.

    At A1 every listening part is a handful of unrelated recordings rather than
    one continuous text, so a candidate who loses their place has no way back.
    The `abschnitt` marker is what lets the app and the printed paper show where
    each recording starts.
    """
    gesehen: dict[str, int] = {}
    for item in teil["items"]:
        marke = item.get("abschnitt")
        if not marke:
            rep.error(f"{w}/item{item['nr']}",
                      "no 'abschnitt'; every item must say which recording it "
                      "belongs to")
            continue
        gesehen[marke] = gesehen.get(marke, 0) + 1

    if gesehen and len(gesehen) != erwartet:
        rep.error(w, f"must contain exactly {erwartet} recordings, found {len(gesehen)}")
    mehrfach = sorted(k for k, n in gesehen.items() if n > 1)
    if mehrfach:
        rep.error(w, f"one question per recording; these carry more: {mehrfach}")


def check_mehrere_sprecher(teil: dict[str, Any], w: str, rep: Report) -> None:
    """The part where items name a speaker: a host plus exactly two guests."""
    sprecher = [s for s in teil.get("sprecher", []) if s["rolle"] != NARRATOR]
    if len(sprecher) != 3:
        rep.error(w, f"this Teil needs a host and exactly 2 guests (3 roles), "
                     f"found {len(sprecher)}")

    keys = [i["loesung"] for i in teil["items"]]
    for letter in ("a", "b", "c"):
        if letter not in keys:
            rep.warn(w, f"no item is keyed '{letter}' - a speaker never carries an answer, "
                        "which makes the task easier than the real thing")


def check_skript(teil: dict[str, Any], w: str, rep: Report) -> None:
    roles = {s["rolle"] for s in teil.get("sprecher", [])} | {NARRATOR}
    abschnitte_im_skript: set[str] = set()

    for i, line in enumerate(teil.get("skript", [])):
        if line["rolle"] not in roles:
            rep.error(f"{w}/skript[{i}]", f"role '{line['rolle']}' is not in the sprecher "
                                          f"table {sorted(roles)}")
        if line.get("abschnitt"):
            abschnitte_im_skript.add(line["abschnitt"])

    item_abschnitte = {i["abschnitt"] for i in teil["items"] if i.get("abschnitt")}
    missing = item_abschnitte - abschnitte_im_skript
    if missing:
        rep.error(w, f"items reference script sections that do not exist: {sorted(missing)}")

    # A rough duration sanity check: German at exam pace is ~130 wpm.
    words = sum(len(line["text"].split()) for line in teil.get("skript", []))
    pauses = sum(line.get("pauseDanachSek", 0.4) for line in teil.get("skript", []))
    seconds = (words / 130) * 60 + pauses
    seconds *= teil["wiederholungen"]
    if seconds < 45:
        rep.warn(w, f"script is very short (~{seconds:.0f}s incl. repeats) for "
                    f"{len(teil['items'])} items")


def check_item(item: dict[str, Any], expected_typ: str, w: str, rep: Report) -> None:
    if item["typ"] != expected_typ:
        rep.error(w, f"typ is '{item['typ']}', this Teil requires '{expected_typ}'")

    valid = VALID_LOESUNG.get(item["typ"], set())
    if valid and item["loesung"] not in valid:
        rep.error(w, f"loesung '{item['loesung']}' is not valid for typ '{item['typ']}' "
                     f"(expected one of {sorted(valid)})")

    is_mc = item["typ"] in {"multiple_choice", "zuordnung_person", "zwei_optionen"}
    if is_mc and not item.get("optionen"):
        rep.error(w, "multiple choice item has no 'optionen'")
    if not is_mc and item.get("optionen"):
        rep.error(w, f"item of typ '{item['typ']}' must not carry 'optionen'")

    # An item that carries its own options is the authority on which keys exist:
    # two at A1 Lesen Teil 2, three at B1, four where B2 matches statements to
    # four writers.
    if is_mc and item.get("optionen") and item["loesung"] not in item["optionen"]:
        rep.error(w, f"loesung '{item['loesung']}' is not one of this item's options "
                     f"{sorted(item['optionen'])}")

    if item["nr"] != 0 and not item.get("beleg"):
        rep.error(w, "no 'beleg' - every scored item must quote the sentence that proves the key")

    if not item.get("kompetenz"):
        rep.warn(w, "no 'kompetenz' tag - the weak-spot report cannot classify this item")

    if is_mc and item.get("optionen"):
        opts = [normalise(v) for v in item["optionen"].values()]
        if len(set(opts)) != len(opts):
            rep.error(w, "two answer options are identical")


def check_schluesselverteilung(teil: dict[str, Any], w: str, rep: Report) -> None:
    """Refuse a part whose answers are effectively one answer.

    A candidate who notices that every multiple-choice item in a part is keyed
    'b' can tick 'b' five times and score full marks without reading anything.
    That is not a stylistic complaint; it is a hole in the measurement.

    The threshold is deliberately loose. Real papers are not evenly balanced —
    a true/false part running four-to-two is ordinary — so only a part that is
    *essentially* single-answer fails. Anything tighter would reject valid
    papers and tempt authors to key items by arithmetic instead of by evidence.

    Matching tasks are exempt: their letters are already forced to be distinct.
    """
    nach_typ: dict[str, list[str]] = {}
    for item in teil["items"]:
        if item["typ"] in ("zuordnung_anzeigen", "zuordnung_buchstabe"):
            continue
        nach_typ.setdefault(item["typ"], []).append(item["loesung"])

    for typ, keys in nach_typ.items():
        if len(keys) < 4:
            continue
        haeufigste = max(set(keys), key=keys.count)
        anteil = keys.count(haeufigste) / len(keys)
        if anteil > MAX_GLEICHE_LOESUNG:
            rep.error(w, f"{keys.count(haeufigste)} of {len(keys)} '{typ}' items are "
                         f"keyed '{haeufigste}' ({anteil:.0%}) - a candidate can tick "
                         f"one answer throughout and score them without reading")


def check_numbering(nrs: list[int], modul: str, gesamt: int, rep: Report) -> None:
    expected = list(range(1, gesamt + 1))
    if sorted(nrs) != expected:
        missing = sorted(set(expected) - set(nrs))
        extra = sorted(n for n in nrs if nrs.count(n) > 1 or n > gesamt)
        detail = []
        if missing:
            detail.append(f"missing {missing}")
        if extra:
            detail.append(f"duplicate/out-of-range {sorted(set(extra))}")
        rep.error(modul, f"items must be numbered 1-{gesamt} exactly once: "
                         f"{'; '.join(detail) or f'found {len(nrs)} items'}")


def check_schreiben(exam: dict[str, Any], spec: Format, rep: Report) -> None:
    aufgaben = exam["schreiben"]["aufgaben"]

    if len(aufgaben) != len(spec.schreiben_typ):
        rep.error("schreiben", f"has {len(aufgaben)} tasks, {spec.stufe} requires "
                               f"{len(spec.schreiben_typ)}")
        return

    for idx, auf in enumerate(aufgaben):
        w = f"schreiben/aufgabe{idx + 1}"
        for feld, erwartet in (
            ("typ", spec.schreiben_typ[idx]),
            ("punkte", spec.schreiben_punkte[idx]),
            ("zeitMinuten", spec.schreiben_zeit[idx]),
            ("woerter", spec.schreiben_woerter[idx]),
        ):
            if auf[feld] != erwartet:
                rep.error(w, f"{feld} is {auf[feld]!r}, {spec.stufe} requires {erwartet!r}")

        # A form has no model answers and no word count: five fields, five
        # right entries, five points. It is checked on its own terms.
        if auf["typ"] == "formular":
            check_formular(auf, w, rep)
            continue

        niveaus = sorted(m["niveau"] for m in auf["musterloesungen"])
        if niveaus != ["ausreichend", "gut"]:
            rep.error(w, f"needs exactly one 'ausreichend' and one 'gut' model answer, "
                         f"found {niveaus}")

        # Three ways of stating a length, and each admits a different model
        # answer. B2 states a floor, so an answer must clear it and may run
        # long. B1 states a target, which can be missed from either side. A2
        # states a *range*, and going over it is as wrong as falling short —
        # a 60-word SMS is not a better SMS.
        ziel = auf["woerter"]
        if spec.schreiben_woerter_max:
            obergrenze = spec.schreiben_woerter_max[idx]
            if auf.get("woerterMax") != obergrenze:
                rep.error(w, f"woerterMax is {auf.get('woerterMax')!r}, {spec.stufe} "
                             f"requires {obergrenze!r}")
            lo, hi = ziel, obergrenze
            wie = f"{ziel}-{obergrenze}"
        elif spec.woerter_ist_mindestmass:
            lo, hi = ziel, ziel * 1.8
            wie = f"min. {ziel}"
        else:
            lo, hi = ziel * 0.7, ziel * 1.6
            wie = f"~{ziel}"

        for m in auf["musterloesungen"]:
            count = len(m["text"].split())
            if not lo <= count <= hi:
                rep.warn(f"{w}/{m['niveau']}", f"model answer is {count} words, target is "
                                               f"{wie} (accepted {lo:.0f}-{hi:.0f})")

        if idx in spec.schreiben_impuls_bei and not auf.get("impuls"):
            rep.error(w, "this task needs an 'impuls' - the post or message being "
                         "responded to")

    total_punkte = sum(a["punkte"] for a in aufgaben)
    if total_punkte != spec.schreiben_maximum:
        rep.error("schreiben", f"points total {total_punkte}, must be exactly "
                               f"{spec.schreiben_maximum}")
    total_zeit = sum(a["zeitMinuten"] for a in aufgaben)
    if total_zeit != exam["schreiben"]["zeitMinuten"]:
        rep.error("schreiben", f"task times total {total_zeit} min but the module is "
                               f"{exam['schreiben']['zeitMinuten']} min")


def check_formular(auf: dict[str, Any], w: str, rep: Report) -> None:
    """A1 Schreiben Teil 1: five gaps in a form, one point each.

    Every field needs the answer *and* where in the situation that answer comes
    from. Without that a learner sees only a mark and cannot tell whether they
    misread the form or missed the detail.
    """
    felder = auf.get("formular") or []
    if len(felder) != 5:
        rep.error(w, f"the form must leave exactly 5 fields blank, found {len(felder)}")

    for i, feld in enumerate(felder):
        wo = f"{w}/feld{i + 1}"
        for schluessel in ("feld", "loesung", "begruendung"):
            if not feld.get(schluessel):
                rep.error(wo, f"missing {schluessel!r}")

    beschriftungen = [f.get("feld") for f in felder]
    doppelt = sorted({b for b in beschriftungen if beschriftungen.count(b) > 1 and b})
    if doppelt:
        rep.error(w, f"two fields carry the same label: {doppelt}")

    if auf.get("musterloesungen"):
        rep.error(w, "a form has no model answers - the five entries are the answer")


def check_sprechen(exam: dict[str, Any], spec: Format, rep: Report) -> None:
    teile = exam["sprechen"]["teile"]

    if len(teile) != len(spec.sprechen_typ):
        rep.error("sprechen", f"has {len(teile)} parts, {spec.stufe} requires "
                              f"{len(spec.sprechen_typ)}")
        return

    for idx, teil in enumerate(teile):
        w = f"sprechen/teil{idx + 1}"
        if teil["typ"] != spec.sprechen_typ[idx]:
            rep.error(w, f"typ is '{teil['typ']}', {spec.stufe} requires "
                         f"'{spec.sprechen_typ[idx]}'")
        if teil["punkte"] != spec.sprechen_punkte[idx]:
            rep.error(w, f"punkte is {teil['punkte']}, {spec.stufe} requires "
                         f"{spec.sprechen_punkte[idx]}")

        typ = teil["typ"]
        if typ == "gemeinsam_planen":
            if not teil.get("planungspunkte"):
                rep.error(w, "the planning task needs 'planungspunkte'")
            if not teil.get("partnerSkript"):
                rep.error(w, "no 'partnerSkript' - solo candidates cannot do this Teil "
                             "without a simulated partner")
        if typ == "diskussion":
            if not teil.get("situation"):
                rep.error(w, "the debate needs a 'situation' - the question being argued")
            if not teil.get("planungspunkte"):
                rep.error(w, "the debate needs 'planungspunkte' - the aspects to cover")
            if not teil.get("partnerSkript"):
                rep.error(w, "no 'partnerSkript' - a debate with nobody arguing back is "
                             "not a debate; solo candidates need the other side")
        if typ == "rueckmeldung" and not teil.get("fragen"):
            rep.error(w, "the feedback task needs 'fragen'")
        if typ == "vortrag" and not teil.get("fragen"):
            rep.error(w, "the talk is followed by questions - add 'fragen'")

        erwartete_karten = (spec.sprechen_karten[idx] if idx < len(spec.sprechen_karten)
                            else 0)
        if erwartete_karten:
            karten = teil.get("karten") or []
            if len(karten) != erwartete_karten:
                rep.error(w, f"this Teil hands out exactly {erwartete_karten} cards, "
                             f"found {len(karten)}")
        elif teil.get("karten"):
            rep.error(w, "this Teil works from something other than cards")

        if typ == "fragen_zur_person":
            pass
        if typ == "informationen_erfragen" and not teil.get("planungspunkte"):
            rep.error(w, "this task needs 'planungspunkte' - what the candidate is "
                         "expected to ask about each subject")
        if typ == "bitten_formulieren" and not teil.get("partnerSkript"):
            rep.error(w, "no 'partnerSkript' - a request needs somebody to answer it, "
                         "and a solo candidate needs the other side")

        if typ == "ueber_sich_erzaehlen":
            if not teil.get("situation"):
                rep.error(w, "this task needs a 'situation' - the question the "
                             "candidate is asked to talk about")
            if not teil.get("planungspunkte"):
                rep.error(w, "this task needs 'planungspunkte' - the aspects printed "
                             "on the card")

        if spec.sprechen_themen_teil and teil["nummer"] == spec.sprechen_themen_teil:
            themen = teil.get("themen") or []
            if len(themen) != 2:
                rep.error(w, f"the candidate chooses between exactly 2 topics, found {len(themen)}")
            for t in themen:
                if len(t["folien"]) != spec.folien:
                    rep.error(f"{w}/{t['titel']}", f"needs exactly {spec.folien} outline "
                                                   f"points, found {len(t['folien'])}")

    total = sum(t["punkte"] for t in teile) + spec.sprechen_aussprache
    if total != spec.modul_punkte:
        aussprache = (f" (incl. {spec.sprechen_aussprache} for Aussprache)"
                      if spec.sprechen_aussprache else "")
        rep.error("sprechen", f"points total {total}{aussprache}, must be exactly "
                              f"{spec.modul_punkte}")


def check_glossar(exam: dict[str, Any], spec: Format, rep: Report) -> None:
    prose = all_prose(exam)
    seen: set[str] = set()

    for entry in exam["glossar"]:
        lemma = entry["lemma"]
        w = f"glossar/{lemma}"

        key = normalise(lemma)
        if key in seen:
            rep.error(w, "duplicate glossary entry")
        seen.add(key)

        if entry["wortart"] == "nomen":
            if not entry.get("artikel"):
                rep.error(w, "a noun must carry its article")
            if not entry.get("plural"):
                rep.error(w, "a noun must carry its plural form")
        if entry["wortart"] == "verb" and not entry.get("stammformen"):
            rep.error(w, "a verb must carry its principal parts (praesens_3sg / praeteritum / perfekt)")

        if not any(v in prose for v in lemma_variants(entry)):
            rep.error(w, "does not occur anywhere in this paper - a glossary is built from "
                         "the words the candidate actually met")

        if normalise(entry["beispiel"]) not in prose:
            rep.warn(w, "the example sentence is not taken verbatim from this paper")

        check_fundstelle(entry["fundstelle"], spec, w, rep)

    for r in exam.get("redewendungen", []):
        wendung = normalise(r["wendung"])
        knapp = normalise(ohne_platzhalter(r["wendung"]))
        w = f"redewendungen/{r['wendung']}"
        if wendung not in prose and knapp not in prose:
            rep.error(w, "does not occur in this paper")
        check_fundstelle(r["fundstelle"], spec, w, rep)

    for g in exam["grammatik"]:
        w = f"grammatik/{g['phaenomen']}"
        if normalise(g["belegSatz"]) not in prose:
            rep.error(w, "belegSatz is not a real sentence from this paper")
        check_fundstelle(g["fundstelle"], spec, w, rep)


def check_fundstelle(fundstelle: str, spec: Format, w: str, rep: Report) -> None:
    """'Sprechen Teil 3' is a real place at B1 and nowhere at all at B2."""
    match = re.match(r"^(Lesen|Hören|Schreiben|Sprechen) Teil ([1-5])$", fundstelle)
    if not match:
        return  # the schema pattern already rejected it
    modul, nummer = match.group(1), int(match.group(2))
    hoechste = spec.module_teile[modul]
    if nummer > hoechste:
        rep.error(w, f"fundstelle '{fundstelle}' does not exist at {spec.stufe}: "
                     f"{modul} has {hoechste} Teile")


def check_cross_exam(exams: dict[str, dict[str, Any]], rep_by_id: dict[str, Report]) -> None:
    """Papers must not recycle each other's topics, or practice value collapses.

    Compared within a level only. A B1 and a B2 paper may share a subject —
    the tasks built on it are nothing like each other, and a learner working up
    from one level to the next is not sitting them on the same afternoon.
    """
    nach_stufe: dict[str, list[str]] = {}
    for eid, exam in exams.items():
        nach_stufe.setdefault(exam["meta"].get("stufe", "B1"), []).append(eid)

    for ids in nach_stufe.values():
        ids = sorted(ids)
        for i, a in enumerate(ids):
            for b in ids[i + 1:]:
                ta = {t.casefold() for t in exams[a]["meta"]["themen"]}
                tb = {t.casefold() for t in exams[b]["meta"]["themen"]}
                shared = ta & tb
                if len(shared) > 1:
                    rep_by_id[a].warn("meta/themen", f"shares {len(shared)} topics with {b}: "
                                                     f"{sorted(shared)}")

        # Speaking topics are the most visible repeat, so they are strict.
        seen_topics: dict[str, str] = {}
        for eid in ids:
            for teil in exams[eid]["sprechen"]["teile"]:
                for thema in teil.get("themen", []) or []:
                    key = normalise(thema["titel"])
                    if key in seen_topics:
                        rep_by_id[eid].error("sprechen/themen",
                                             f"presentation topic '{thema['titel']}' already "
                                             f"appears in {seen_topics[key]}")
                    else:
                        seen_topics[key] = eid


# --------------------------------------------------------------------------
# Driver
# --------------------------------------------------------------------------


def stufe_von(exam_id: str) -> str:
    """The level a folder name claims, before the file is trusted to agree.

    Unprefixed ids are B1: those five papers shipped before a second level
    existed, and renaming them would strand attempts already saved in a
    learner's browser.
    """
    for prefix, stufe in (("a1-", "A1"), ("a2-", "A2"), ("b2-", "B2")):
        if exam_id.startswith(prefix):
            return stufe
    return "B1"


def validate_one(exam: dict[str, Any], exam_id: str) -> Report:
    rep = Report(exam_id)
    if not check_schema(exam, rep):
        # Shape is wrong; the semantic rules below would raise KeyError.
        return rep

    if exam["meta"]["id"] != exam_id:
        rep.error("meta/id", f"is '{exam['meta']['id']}' but the folder is '{exam_id}'")

    stufe = exam["meta"]["stufe"]
    erwartet = stufe_von(exam_id)
    if stufe != erwartet:
        rep.error("meta/stufe", f"is '{stufe}' but the folder '{exam_id}' means "
                                f"'{erwartet}'. Rename the folder to "
                                f"'b2-{exam_id}' or fix the level.")
        return rep

    spec = FORMATE[stufe]
    check_lesen(exam, spec, rep)
    check_hoeren(exam, spec, rep)
    check_schreiben(exam, spec, rep)
    check_sprechen(exam, spec, rep)
    check_glossar(exam, spec, rep)
    return rep


def load_exams(only: str | None) -> dict[str, dict[str, Any]]:
    if not CONTENT.exists():
        return {}
    out: dict[str, dict[str, Any]] = {}
    for folder in sorted(CONTENT.iterdir()):
        if not folder.is_dir() or (only and folder.name != only):
            continue
        path = folder / "exam.json"
        if not path.exists():
            print(f"  [ERROR] {folder.name}: no exam.json", file=sys.stderr)
            continue
        try:
            out[folder.name] = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"  [ERROR] {folder.name}/exam.json: invalid JSON - {exc}", file=sys.stderr)
    return out


def check_sprechtraining(rep: Report, stufe: str = "B1") -> None:
    """Validate the speaking trainer.

    Like the cheat sheet it has no schema of its own: it is one long document,
    not a repeated form. But it drives a 116-page LaTeX build and an app screen,
    and the failure modes are specific enough to be worth naming. The word
    window is the interesting one — a model answer that does not fit the three
    minutes it claims teaches the wrong pace, which is the whole point of
    printing a time next to it.
    """
    quelle = SPRECHEN / f"{stufe.lower()}.json"
    if not quelle.exists():
        return

    daten = json.loads(quelle.read_text(encoding="utf-8"))
    for feld in ("titel", "untertitel", "stufe", "hinweis", "teile", "folien",
                 "vorbereitungMinuten", "aufgaben"):
        if feld not in daten:
            rep.error("sprechtraining", f"missing top-level field {feld!r}")
    if rep.errors:
        return

    if len(daten["folien"]) != 5:
        rep.error("sprechtraining.folien",
                  f"B1 Teil 2 has five slides, found {len(daten['folien'])}")
    if len(daten["teile"]) != 3:
        rep.error("sprechtraining.teile",
                  f"B1 Sprechen has three parts, found {len(daten['teile'])}")

    themen: dict[str, int] = {}
    situationen: dict[str, int] = {}

    for a in daten["aufgaben"]:
        nr = a.get("nummer", "?")
        ort = f"sprechtraining[{nr}]"
        t1, t2, t3 = a.get("teil1", {}), a.get("teil2", {}), a.get("teil3", {})

        if len(t1.get("punkte", [])) != 5:
            rep.error(f"{ort}.teil1", "Teil 1 needs exactly five planning points")
        if len(t1.get("musterdialog", [])) < 6:
            rep.error(f"{ort}.teil1", "the model dialogue is too short to show a "
                                      "negotiation reaching a decision")

        titel = t2.get("titel", "")
        if not titel.endswith("?"):
            rep.error(f"{ort}.teil2", "the presentation topic should be a question")
        themen[titel] = themen.get(titel, 0) + 1
        sit = t1.get("situation", "")
        situationen[sit] = situationen.get(sit, 0) + 1

        loesung = t2.get("musterloesung", [])
        if len(loesung) != 5:
            rep.error(f"{ort}.teil2", f"one model answer per slide, found {len(loesung)}")
        woerter = sum(len(b.split()) for b in loesung)
        # 90 words a minute for a learner reading a prepared presentation: this
        # window is 2:40 to 4:20 against a three-minute slot.
        if not 240 <= woerter <= 390:
            rep.error(f"{ort}.teil2",
                      f"model answer is {woerter} words - outside the 240-390 that "
                      f"fits 'ca. 3 Minuten'")
        gemeldet = t2.get("umfang", {}).get("woerter")
        if gemeldet is not None and gemeldet != woerter:
            rep.error(f"{ort}.teil2",
                      f"printed word count {gemeldet} does not match the text ({woerter})")

        kultur = t2.get("kultur", {})
        for sprache in ("de", "en"):
            if len(kultur.get(sprache, "")) < 200:
                rep.error(f"{ort}.teil2.kultur",
                          f"the {sprache} culture note is too short to explain the "
                          f"German context a newcomer is missing")
        if len(t2.get("wortschatz", [])) < 6:
            rep.error(f"{ort}.teil2", "too little topic vocabulary")
        for w in t2.get("wortschatz", []):
            # The printed table is two plain columns and cannot wrap.
            if len(w.get("de", "")) > 34 or len(w.get("en", "")) > 46:
                rep.error(f"{ort}.teil2.wortschatz",
                          f"entry too long for the printed table: {w.get('de')!r}")

        for feld in ("rueckmeldung", "frage", "antwort"):
            if not t3.get(feld, "").strip():
                rep.error(f"{ort}.teil3", f"missing {feld}")

    for titel, n in themen.items():
        if n > 1:
            rep.error("sprechtraining", f"presentation topic used {n} times: {titel!r}")
    for sit, n in situationen.items():
        if n > 1:
            rep.error("sprechtraining", f"planning situation used {n} times: {sit[:50]!r}")


def lernhilfe_ordner(stufe: str) -> Path:
    """Where a level's cheat sheet lives.

    B1's sits at the top of content/lernhilfe/ because it was there before a
    second level existed, and the PDF build, the app route and the release
    assets all name that path. Later levels get a subdirectory.
    """
    return LERNHILFE if stufe == "B1" else LERNHILFE / stufe.lower()


def check_lernhilfe(rep: Report, stufe: str = "B1") -> None:
    """Validate the cheat sheet.

    It has no JSON Schema of its own because it is one hand-written document,
    not a repeated form — but it feeds both a LaTeX build and a React screen,
    and both fail unhelpfully on a missing key. These checks turn "StrictUndefined
    raised on line 214" into "grammatik[7] has no tabelle".
    """
    ordner = lernhilfe_ordner(stufe)
    quelle = ordner / "lernhilfe.json"
    if not quelle.exists():
        return

    daten = json.loads(quelle.read_text(encoding="utf-8"))
    wort = json.loads((ordner / "wortschatz.json").read_text(encoding="utf-8"))

    for feld in ("titel", "untertitel", "version", "ueberblick", "strategie",
                 "redemittel", "grammatik"):
        if feld not in daten:
            rep.error("lernhilfe", f"missing top-level field {feld!r}")
    if rep.errors:
        return

    module = {m["modul"] for m in daten["ueberblick"]["module"]}
    if module != set(MODULNAMEN):
        rep.error("lernhilfe.ueberblick", f"expected the four modules, got {sorted(module)}")

    # The template prints a grade table and StrictUndefined stops the whole
    # LaTeX build if it is absent, with an error that names a line rather than
    # a field. Catch it here instead.
    if not daten["ueberblick"].get("noten"):
        rep.error("lernhilfe.ueberblick", "missing 'noten' - the grade bands the "
                                          "cheat sheet prints")

    strategie = [s["modul"] for s in daten["strategie"]]
    if set(strategie) != set(MODULNAMEN):
        rep.error("lernhilfe.strategie", f"expected the four modules, got {strategie}")
    for s in daten["strategie"]:
        if len(s["goldregeln"]) < 4:
            rep.warn(f"lernhilfe.strategie[{s['modul']}]",
                     f"only {len(s['goldregeln'])} Goldregeln; aim for at least 4")

    # The whole point of the sheet is that Sprechen and Schreiben get more room
    # than the receptive skills, which is what the user asked for. Guard it, so
    # a later edit cannot quietly rebalance it.
    phrasen = {}
    for r in daten["redemittel"]:
        for g in r["gruppen"]:
            if not g["phrasen"]:
                rep.error(f"lernhilfe.redemittel[{r['bereich']}]",
                          f"group {g['funktion']!r} has no phrases")
        phrasen[r["bereich"]] = sum(len(g["phrasen"]) for g in r["gruppen"])
    produktiv = sum(n for b, n in phrasen.items()
                    if b.startswith(("Sprechen", "Schreiben")))
    gesamt = sum(phrasen.values())
    if gesamt and produktiv / gesamt < 0.8:
        rep.warn("lernhilfe.redemittel",
                 f"only {produktiv}/{gesamt} phrases serve Sprechen or Schreiben; "
                 "the sheet is meant to weight those two")

    for i, g in enumerate(daten["grammatik"]):
        tab = g.get("tabelle")
        if not tab or not tab.get("kopf") or not tab.get("zeilen"):
            rep.error(f"lernhilfe.grammatik[{i}]", f"{g.get('thema')!r} has no table")
            continue
        breite = len(tab["kopf"])
        for j, zeile in enumerate(tab["zeilen"]):
            if len(zeile) != breite:
                rep.error(f"lernhilfe.grammatik[{g['thema']}]",
                          f"row {j} has {len(zeile)} cells, header has {breite}")

    verben = [v for gruppe in wort["verben"] for v in gruppe["eintraege"]]
    nomen = [n for gruppe in wort["nomen"] for n in gruppe["eintraege"]]
    for v in verben:
        fehlend = [k for k in ("inf", "en", "er", "prät", "perf", "bsp") if not v.get(k)]
        if fehlend:
            rep.error("lernhilfe.wortschatz", f"verb {v.get('inf')!r} missing {fehlend}")
    for n in nomen:
        if n.get("art") not in ("der", "die", "das"):
            rep.error("lernhilfe.wortschatz",
                      f"noun {n.get('wort')!r} has article {n.get('art')!r}")

    for name, eintraege, schluessel, ziel in (
        ("verbs", verben, "inf", 100),
        ("nouns", nomen, "wort", 100),
    ):
        doppelt = [k for k in {e[schluessel] for e in eintraege}
                   if [e[schluessel] for e in eintraege].count(k) > 1]
        if doppelt:
            rep.error("lernhilfe.wortschatz", f"duplicate {name}: {sorted(doppelt)}")
        if len(eintraege) < ziel:
            rep.warn("lernhilfe.wortschatz",
                     f"{len(eintraege)} {name}; the sheet promises {ziel}")


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("exam", nargs="?", help="validate a single exam, e.g. pruefung-01")
    ap.add_argument("--strict", action="store_true", help="treat warnings as failures")
    args = ap.parse_args(list(argv) if argv is not None else None)

    # Exam ids, German findings and the arrow in the level mismatch message all
    # go through here, and a cp1252 console would crash on the error path.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    exams = load_exams(args.exam)
    if not exams:
        target = args.exam or "content/exams"
        print(f"No exams found in {target}.")
        return 0 if args.exam is None else 1

    reports: dict[str, Report] = {}
    for exam_id, exam in exams.items():
        reports[exam_id] = validate_one(exam, exam_id)

    if len(exams) > 1:
        check_cross_exam(exams, reports)

    # Each level's cheat sheet stands apart from any exam, so it gets its own
    # report rather than being blamed on whichever paper happened to be first.
    lernhilfe_reps: dict[str, Report] = {}
    if args.exam is None:
        for stufe in FORMATE:
            if not (lernhilfe_ordner(stufe) / "lernhilfe.json").exists():
                continue
            rep = Report(f"spickzettel-{stufe.lower()}")
            check_lernhilfe(rep, stufe)
            lernhilfe_reps[stufe] = rep
            if rep.findings:
                reports[rep.exam_id] = rep

        for stufe in FORMATE:
            if not (SPRECHEN / f"{stufe.lower()}.json").exists():
                continue
            rep = Report(f"sprechtraining-{stufe.lower()}")
            check_sprechtraining(rep, stufe)
            lernhilfe_reps[f"sprechen-{stufe}"] = rep
            if rep.findings:
                reports[rep.exam_id] = rep

    n_err = n_warn = 0
    for exam_id in sorted(reports):
        rep = reports[exam_id]
        n_err += len(rep.errors)
        n_warn += len(rep.warnings)
        status = "FAIL" if rep.errors else ("warn" if rep.warnings else "ok")
        stufe = exams.get(exam_id, {}).get("meta", {}).get("stufe", "")
        print(f"\n{exam_id}  [{status}]{f'  {stufe}' if stufe else ''}")
        if not rep.findings:
            spec = FORMATE.get(stufe)
            n = spec.gesamt_items if spec else 0
            punkte = spec.modul_punkte if spec else 0
            print(f"  {n} Lesen + {n} Hören items, {punkte} points per module, "
                  f"glossary verified.")
        for f in rep.findings:
            print(f)

    # Two different documents share this dict, so the summary line has to say
    # which one it is describing rather than calling everything a Spickzettel.
    for schluessel, rep in lernhilfe_reps.items():
        if rep.findings:
            continue
        print(f"\n{rep.exam_id}  [ok]")
        if schluessel.startswith("sprechen-"):
            stufe = schluessel.removeprefix("sprechen-")
            n = len(
                json.loads((SPRECHEN / f"{stufe.lower()}.json").read_text(encoding="utf-8"))[
                    "aufgaben"
                ]
            )
            print(f"  Sprechtraining {stufe}: {n} tasks, each with a culture note, "
                  f"topic vocabulary and timed model answers.")
        else:
            print(f"  Spickzettel {schluessel}: four modules, Redemittel, grammar "
                  f"tables, word lists.")

    print(f"\n{'-' * 60}")
    print(f"{len(exams)} exam(s): {n_err} error(s), {n_warn} warning(s)")

    if n_err:
        return 1
    if n_warn and args.strict:
        print("--strict: warnings are failures")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
