#!/usr/bin/env python3
"""Validate B1 practice exams against the schema and the examination specification.

JSON Schema catches shape errors. This script catches the errors that actually
matter for an exam paper: wrong item counts, point totals that do not reach 100,
answer keys that no text supports, glossary entries for words that never appear.

    python tools/validate.py                 # every exam in content/exams
    python tools/validate.py pruefung-01     # just one
    python tools/validate.py --strict        # warnings become failures

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
SCHEMA = ROOT / "packages" / "schema" / "exam.schema.json"

MODULNAMEN = ("Lesen", "Hören", "Schreiben", "Sprechen")

# --------------------------------------------------------------------------
# The examination specification, as data. Every rule below traces back to the
# published format: see docs/EXAM-FORMAT.md for the source of each number.
# --------------------------------------------------------------------------

LESEN_ITEMS_PRO_TEIL = [6, 6, 7, 7, 4]  # = 30
LESEN_TYP_PRO_TEIL = [
    "richtig_falsch",
    "multiple_choice",
    "zuordnung_anzeigen",
    "ja_nein",
    "multiple_choice",
]
LESEN_ITEM_TYP_PRO_TEIL = [
    "richtig_falsch",
    "multiple_choice",
    "zuordnung_anzeigen",
    "ja_nein",
    "multiple_choice",
]

HOEREN_ITEMS_PRO_TEIL = [10, 5, 7, 8]  # = 30
HOEREN_TYP_PRO_TEIL = ["kurztexte", "monolog", "gespraech", "diskussion"]
HOEREN_WIEDERHOLUNGEN = [2, 1, 1, 2]  # Teile 1 and 4 are heard twice

SCHREIBEN_PUNKTE = [40, 40, 20]  # = 100
SCHREIBEN_ZEIT = [20, 25, 15]  # = 60 minutes
SCHREIBEN_WOERTER = [80, 80, 40]
SCHREIBEN_TYP = ["email_informell", "forumsbeitrag", "email_halbformell"]

SPRECHEN_PUNKTE = [28, 40, 16]  # + 16 Aussprache = 100
SPRECHEN_AUSSPRACHE_PUNKTE = 16
SPRECHEN_TYP = ["gemeinsam_planen", "praesentation", "rueckmeldung"]

GESAMT_ITEMS = 30
BESTEHENSGRENZE = 60

VALID_LOESUNG = {
    "richtig_falsch": {"richtig", "falsch"},
    "ja_nein": {"ja", "nein"},
    "multiple_choice": {"a", "b", "c"},
    "zuordnung_person": {"a", "b", "c"},
    "zuordnung_anzeigen": set("abcdefghij") | {"0"},
}

NARRATOR = "Sprecher"

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
        chunks.append(teil.get("these", "") or "")
        for item in list(teil.get("items", [])) + _beispiel_list(teil):
            chunks.append(item.get("frage", ""))
            for opt in (item.get("optionen") or {}).values():
                chunks.append(opt)

    for teil in exam.get("hoeren", {}).get("teile", []):
        for line in teil.get("skript", []):
            chunks.append(line["text"])
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


def lemma_variants(entry: dict[str, Any]) -> list[str]:
    """Surface forms that should count as an occurrence of this lemma.

    A glossary lists `sich bewerben`, but the text says `bewirbt sich`. Matching
    only the citation form would reject perfectly good entries, so accept the
    stem and the supplied inflected forms too.
    """
    lemma = entry["lemma"]
    out = {lemma}

    # Reduce the dictionary citation form to something that can actually appear
    # in running text: drop the article, the reflexive pronoun, and placeholder
    # objects. "sich etwas abschauen" -> "abschauen"; "die Gebühr" -> "Gebühr".
    bare = re.sub(
        r"\b(sich|der|die|das|etwas|etw\.?|jemanden|jemandem|jemand|jdn\.?|jdm\.?)\b",
        " ",
        lemma,
        flags=re.IGNORECASE,
    )
    bare = re.sub(r"\s+", " ", bare).strip()
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


def check_lesen(exam: dict[str, Any], rep: Report) -> None:
    teile = exam["lesen"]["teile"]
    seen_nrs: list[int] = []

    for idx, teil in enumerate(teile):
        w = f"lesen/teil{idx + 1}"

        if teil["nummer"] != idx + 1:
            rep.error(w, f"nummer is {teil['nummer']}, expected {idx + 1}")
        if teil["typ"] != LESEN_TYP_PRO_TEIL[idx]:
            rep.error(w, f"typ is '{teil['typ']}', spec requires '{LESEN_TYP_PRO_TEIL[idx]}'")

        items = teil["items"]
        expected = LESEN_ITEMS_PRO_TEIL[idx]
        if len(items) != expected:
            rep.error(w, f"has {len(items)} items, spec requires exactly {expected}")

        for item in items:
            seen_nrs.append(item["nr"])
            check_item(item, LESEN_ITEM_TYP_PRO_TEIL[idx], f"{w}/item{item['nr']}", rep)

        # Teil-specific structure
        if idx == 0 and not teil.get("texte"):
            rep.error(w, "Teil 1 needs one text (blog / personal report)")
        if idx == 1:
            texte = teil.get("texte") or []
            if len(texte) != 2:
                rep.error(w, f"Teil 2 needs exactly 2 articles, found {len(texte)}")
            else:
                per_text: dict[str, int] = {}
                for item in items:
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

        # Teil 2 is the one part of the reading module that carries no worked
        # example in the real paper - the two articles start straight at item 7.
        if idx != 1 and not teil.get("beispiel"):
            rep.warn(w, "no Beispiel - this Teil shows a worked example in the real paper")

    check_numbering(seen_nrs, "lesen", rep)


def check_zuordnung(teil: dict[str, Any], w: str, rep: Report) -> None:
    """Teil 3: ten ads, seven situations, exactly one of which has no match."""
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


def check_hoeren(exam: dict[str, Any], rep: Report) -> None:
    teile = exam["hoeren"]["teile"]
    seen_nrs: list[int] = []

    for idx, teil in enumerate(teile):
        w = f"hoeren/teil{idx + 1}"

        if teil["nummer"] != idx + 1:
            rep.error(w, f"nummer is {teil['nummer']}, expected {idx + 1}")
        if teil["typ"] != HOEREN_TYP_PRO_TEIL[idx]:
            rep.error(w, f"typ is '{teil['typ']}', spec requires '{HOEREN_TYP_PRO_TEIL[idx]}'")
        if teil["wiederholungen"] != HOEREN_WIEDERHOLUNGEN[idx]:
            rep.error(w, f"heard {teil['wiederholungen']}x, spec requires "
                         f"{HOEREN_WIEDERHOLUNGEN[idx]}x")

        items = teil["items"]
        expected = HOEREN_ITEMS_PRO_TEIL[idx]
        if len(items) != expected:
            rep.error(w, f"has {len(items)} items, spec requires exactly {expected}")

        for item in items:
            seen_nrs.append(item["nr"])

        # Item types per Teil
        if idx == 0:
            check_hoeren_teil1(teil, w, rep)
        elif idx in (1,):
            for item in items:
                check_item(item, "multiple_choice", f"{w}/item{item['nr']}", rep)
        elif idx == 2:
            for item in items:
                check_item(item, "richtig_falsch", f"{w}/item{item['nr']}", rep)
        elif idx == 3:
            for item in items:
                check_item(item, "zuordnung_person", f"{w}/item{item['nr']}", rep)
            check_diskussion(teil, w, rep)

        check_skript(teil, w, rep)

    check_numbering(seen_nrs, "hoeren", rep)


def check_hoeren_teil1(teil: dict[str, Any], w: str, rep: Report) -> None:
    """Five short texts, each with one true/false and one multiple-choice item."""
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

    for name, items in sorted(abschnitte.items()):
        typen = sorted(i["typ"] for i in items)
        if typen != ["multiple_choice", "richtig_falsch"]:
            rep.error(f"{w}/{name}", f"each short text needs exactly one richtig_falsch and "
                                     f"one multiple_choice item, found {typen}")
        for item in items:
            check_item(item, item["typ"], f"{w}/item{item['nr']}", rep)


def check_diskussion(teil: dict[str, Any], w: str, rep: Report) -> None:
    """Teil 4: a moderator plus exactly two guests; keys map a/b/c onto them."""
    sprecher = [s for s in teil.get("sprecher", []) if s["rolle"] != NARRATOR]
    if len(sprecher) != 3:
        rep.error(w, f"radio discussion needs a moderator and exactly 2 guests "
                     f"(3 roles), found {len(sprecher)}")

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

    is_mc = item["typ"] in {"multiple_choice", "zuordnung_person"}
    if is_mc and not item.get("optionen"):
        rep.error(w, "multiple choice item has no 'optionen'")
    if not is_mc and item.get("optionen"):
        rep.error(w, f"item of typ '{item['typ']}' must not carry 'optionen'")

    if item["nr"] != 0 and not item.get("beleg"):
        rep.error(w, "no 'beleg' - every scored item must quote the sentence that proves the key")

    if not item.get("kompetenz"):
        rep.warn(w, "no 'kompetenz' tag - the weak-spot report cannot classify this item")

    if is_mc and item.get("optionen"):
        opts = [normalise(v) for v in item["optionen"].values()]
        if len(set(opts)) != len(opts):
            rep.error(w, "two answer options are identical")


def check_numbering(nrs: list[int], modul: str, rep: Report) -> None:
    expected = list(range(1, GESAMT_ITEMS + 1))
    if sorted(nrs) != expected:
        missing = sorted(set(expected) - set(nrs))
        extra = sorted(n for n in nrs if nrs.count(n) > 1 or n > GESAMT_ITEMS)
        detail = []
        if missing:
            detail.append(f"missing {missing}")
        if extra:
            detail.append(f"duplicate/out-of-range {sorted(set(extra))}")
        rep.error(modul, f"items must be numbered 1-{GESAMT_ITEMS} exactly once: "
                         f"{'; '.join(detail) or f'found {len(nrs)} items'}")


def check_schreiben(exam: dict[str, Any], rep: Report) -> None:
    aufgaben = exam["schreiben"]["aufgaben"]

    for idx, auf in enumerate(aufgaben):
        w = f"schreiben/aufgabe{idx + 1}"
        for feld, erwartet, _liste in (
            ("typ", SCHREIBEN_TYP[idx], SCHREIBEN_TYP),
            ("punkte", SCHREIBEN_PUNKTE[idx], SCHREIBEN_PUNKTE),
            ("zeitMinuten", SCHREIBEN_ZEIT[idx], SCHREIBEN_ZEIT),
            ("woerter", SCHREIBEN_WOERTER[idx], SCHREIBEN_WOERTER),
        ):
            if auf[feld] != erwartet:
                rep.error(w, f"{feld} is {auf[feld]!r}, spec requires {erwartet!r}")

        niveaus = sorted(m["niveau"] for m in auf["musterloesungen"])
        if niveaus != ["ausreichend", "gut"]:
            rep.error(w, f"needs exactly one 'ausreichend' and one 'gut' model answer, "
                         f"found {niveaus}")

        for m in auf["musterloesungen"]:
            count = len(m["text"].split())
            lo, hi = auf["woerter"] * 0.7, auf["woerter"] * 1.6
            if not lo <= count <= hi:
                rep.warn(f"{w}/{m['niveau']}", f"model answer is {count} words, target is "
                                               f"~{auf['woerter']} (accepted {lo:.0f}-{hi:.0f})")

        if idx == 1 and not auf.get("impuls"):
            rep.error(w, "the forum task needs an 'impuls' - the post being responded to")

    total_punkte = sum(a["punkte"] for a in aufgaben)
    if total_punkte != 100:
        rep.error("schreiben", f"points total {total_punkte}, must be exactly 100")
    total_zeit = sum(a["zeitMinuten"] for a in aufgaben)
    if total_zeit != exam["schreiben"]["zeitMinuten"]:
        rep.error("schreiben", f"task times total {total_zeit} min but the module is "
                               f"{exam['schreiben']['zeitMinuten']} min")


def check_sprechen(exam: dict[str, Any], rep: Report) -> None:
    teile = exam["sprechen"]["teile"]

    for idx, teil in enumerate(teile):
        w = f"sprechen/teil{idx + 1}"
        if teil["typ"] != SPRECHEN_TYP[idx]:
            rep.error(w, f"typ is '{teil['typ']}', spec requires '{SPRECHEN_TYP[idx]}'")
        if teil["punkte"] != SPRECHEN_PUNKTE[idx]:
            rep.error(w, f"punkte is {teil['punkte']}, spec requires {SPRECHEN_PUNKTE[idx]}")

        if idx == 0:
            if not teil.get("planungspunkte"):
                rep.error(w, "the planning task needs 'planungspunkte'")
            if not teil.get("partnerSkript"):
                rep.error(w, "no 'partnerSkript' - solo candidates cannot do this Teil "
                             "without a simulated partner")
        if idx == 1:
            themen = teil.get("themen") or []
            if len(themen) != 2:
                rep.error(w, f"the candidate chooses between exactly 2 topics, found {len(themen)}")
            for t in themen:
                if len(t["folien"]) != 5:
                    rep.error(f"{w}/{t['titel']}", f"needs exactly 5 slides, found {len(t['folien'])}")
        if idx == 2 and not teil.get("fragen"):
            rep.error(w, "the feedback task needs 'fragen'")

    total = sum(t["punkte"] for t in teile) + SPRECHEN_AUSSPRACHE_PUNKTE
    if total != 100:
        rep.error("sprechen", f"points total {total} (incl. {SPRECHEN_AUSSPRACHE_PUNKTE} for "
                              f"Aussprache), must be exactly 100")


def check_glossar(exam: dict[str, Any], rep: Report) -> None:
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

    for r in exam.get("redewendungen", []):
        wendung = normalise(r["wendung"])
        ohne_reflexiv = re.sub(r"^sich\s+", "", wendung)
        if wendung not in prose and ohne_reflexiv not in prose:
            rep.error(f"redewendungen/{r['wendung']}",
                      "does not occur in this paper")

    for g in exam["grammatik"]:
        if normalise(g["belegSatz"]) not in prose:
            rep.error(f"grammatik/{g['phaenomen']}", "belegSatz is not a real sentence from "
                                                     "this paper")


def check_cross_exam(exams: dict[str, dict[str, Any]], rep_by_id: dict[str, Report]) -> None:
    """Papers must not recycle each other's topics, or practice value collapses."""
    ids = sorted(exams)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            ta = {t.casefold() for t in exams[a]["meta"]["themen"]}
            tb = {t.casefold() for t in exams[b]["meta"]["themen"]}
            shared = ta & tb
            if len(shared) > 1:
                rep_by_id[a].warn("meta/themen", f"shares {len(shared)} topics with {b}: "
                                                 f"{sorted(shared)}")

    # Speaking presentation topics are the most visible repeat, so they are strict.
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


def validate_one(exam: dict[str, Any], exam_id: str) -> Report:
    rep = Report(exam_id)
    if not check_schema(exam, rep):
        # Shape is wrong; the semantic rules below would raise KeyError.
        return rep

    if exam["meta"]["id"] != exam_id:
        rep.error("meta/id", f"is '{exam['meta']['id']}' but the folder is '{exam_id}'")

    check_lesen(exam, rep)
    check_hoeren(exam, rep)
    check_schreiben(exam, rep)
    check_sprechen(exam, rep)
    check_glossar(exam, rep)
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


def check_lernhilfe(rep: Report) -> None:
    """Validate the cheat sheet.

    It has no JSON Schema of its own because it is one hand-written document,
    not a repeated form — but it feeds both a LaTeX build and a React screen,
    and both fail unhelpfully on a missing key. These checks turn "StrictUndefined
    raised on line 214" into "grammatik[7] has no tabelle".
    """
    quelle = LERNHILFE / "lernhilfe.json"
    if not quelle.exists():
        return

    daten = json.loads(quelle.read_text(encoding="utf-8"))
    wort = json.loads((LERNHILFE / "wortschatz.json").read_text(encoding="utf-8"))

    for feld in ("titel", "untertitel", "version", "ueberblick", "strategie",
                 "redemittel", "grammatik"):
        if feld not in daten:
            rep.error("lernhilfe", f"missing top-level field {feld!r}")
    if rep.errors:
        return

    module = {m["modul"] for m in daten["ueberblick"]["module"]}
    if module != set(MODULNAMEN):
        rep.error("lernhilfe.ueberblick", f"expected the four modules, got {sorted(module)}")

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

    # The cheat sheet stands apart from any exam, so it gets its own report
    # rather than being blamed on whichever paper happened to be first.
    lernhilfe_rep = Report("lernhilfe")
    if args.exam is None:
        check_lernhilfe(lernhilfe_rep)
        if lernhilfe_rep.findings:
            reports["lernhilfe"] = lernhilfe_rep

    n_err = n_warn = 0
    for exam_id in sorted(reports):
        rep = reports[exam_id]
        n_err += len(rep.errors)
        n_warn += len(rep.warnings)
        status = "FAIL" if rep.errors else ("warn" if rep.warnings else "ok")
        print(f"\n{exam_id}  [{status}]")
        if not rep.findings:
            print("  30 Lesen + 30 Hören items, 100 points per module, glossary verified.")
        for f in rep.findings:
            print(f)

    if args.exam is None and not lernhilfe_rep.findings:
        print("\nlernhilfe  [ok]")
        print("  Cheat sheet: four modules, Redemittel, grammar tables, word lists.")

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
