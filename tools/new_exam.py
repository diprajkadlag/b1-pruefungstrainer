#!/usr/bin/env python3
"""Scaffold a new exam with the right shape already in place.

    python tools/new_exam.py pruefung-06                  # B1
    python tools/new_exam.py a1-pruefung-01               # A1, from the id
    python tools/new_exam.py a2-pruefung-01               # A2
    python tools/new_exam.py b2-pruefung-02               # B2, from the id
    python tools/new_exam.py pruefung-06 --variante jugendliche --niveau mittel

Writes content/exams/<id>/exam.json with every part, the correct number of
placeholder items, and a TODO on each field you have to fill in. Nothing in it
is real content — `validate.py` will reject it until you replace the
placeholders, which is the point.

The level comes from the id: `pruefung-NN` is B1, `a2-pruefung-NN` is A2 and
`b2-pruefung-NN` is B2. They
are not variations on each other — B2 has two writing tasks, a debate, and
three matching task types B1 never uses — so the two skeletons are built
separately. See docs/EXAM-FORMAT.md.

Read docs/AUTHORING.md before you start writing. Rule one: everything must be
original work.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "exams"

TODO = "TODO"

# --------------------------------------------------------------------------
# A1
# --------------------------------------------------------------------------

A1_LESEN = [
    (1, "kurzmitteilungen", 5, 8, "Zwei kurze Mitteilungen, richtig oder falsch"),
    (2, "wo_finde_ich", 5, 9, "Wo finden Sie das? Zwei Orte pro Aufgabe"),
    (3, "hinweisschilder", 5, 8, "Fünf Schilder, je eine Aufgabe"),
]

A1_HOEREN = [
    (1, "kurzgespraeche", 6, 2, "Sechs kurze Texte, je ein MC-Item"),
    (2, "durchsagen", 4, 1, "Vier öffentliche Durchsagen, richtig oder falsch"),
    (3, "ansagen", 5, 2, "Fünf Ansagen auf dem Anrufbeantworter"),
]

A1_SCHREIBEN = [
    (1, "formular", 0, 8, 5),
    (2, "kurzmitteilung", 30, 12, 10),
]

A1_SPRECHEN = [
    (1, "sich_vorstellen", "Sich vorstellen", 3, 3),
    (2, "informationen_erfragen", "Um Informationen bitten", 5, 6),
    (3, "bitten_formulieren", "Bitten formulieren", 5, 6),
]

# --------------------------------------------------------------------------
# A2
# --------------------------------------------------------------------------

A2_LESEN = [
    (1, "multiple_choice", 5, 7, "Kurzer Zeitungs- oder Zeitschriftenartikel"),
    (2, "multiple_choice", 5, 7, "Informationstafel, Wegweiser oder Programm"),
    (3, "multiple_choice", 5, 8, "Eine private E-Mail"),
    (4, "zuordnung_anzeigen", 5, 8, "Sechs Personen, sechs Kleinanzeigen a-f"),
]

A2_HOEREN = [
    (1, "kurztexte", 5, 2, "Fünf kurze Texte, je ein MC-Item"),
    (2, "gespraech", 5, 1, "Ein zusammenhängendes Gespräch, neun Optionen a-i"),
    (3, "kurzgespraeche", 5, 1, "Fünf kurze, voneinander unabhängige Gespräche"),
    (4, "interview", 5, 2, "Ein Radiointerview, 350-450 Wörter"),
]

A2_SCHREIBEN = [
    (1, "sms", 20, 30, 10, 10),
    (2, "email_halbformell", 30, 40, 20, 10),
]

A2_SPRECHEN = [
    (1, "fragen_zur_person", "Fragen zur Person", 3, 4),
    (2, "ueber_sich_erzaehlen", "Von sich erzählen", 4, 8),
    (3, "gemeinsam_planen", "Gemeinsam etwas planen", 5, 8),
]

# --------------------------------------------------------------------------
# B1
# --------------------------------------------------------------------------

B1_LESEN = [
    (1, "richtig_falsch", 6, 10, "Blogeintrag oder persönlicher Bericht"),
    (2, "multiple_choice", 6, 20, "Zwei Zeitungsartikel, je drei Aufgaben"),
    (3, "zuordnung_anzeigen", 7, 10, "Zehn Anzeigen a-j, eine Situation ohne Treffer"),
    (4, "ja_nein", 7, 15, "Sieben Meinungen zu einer These"),
    (5, "multiple_choice", 4, 10, "Benutzungsordnung oder Hausordnung"),
]

B1_HOEREN = [
    (1, "kurztexte", 10, 2, "Fünf kurze Texte, je ein r/f- und ein MC-Item"),
    (2, "monolog", 5, 1, "Vortrag oder Führung, 450-550 Wörter"),
    (3, "gespraech", 7, 1, "Alltagsgespräch, zwei Personen, 450-550 Wörter"),
    (4, "diskussion", 8, 2, "Radiodiskussion, Moderation + zwei Gäste, 600-750 Wörter"),
]

B1_SCHREIBEN = [
    (1, "email_informell", 80, 20, 40),
    (2, "forumsbeitrag", 80, 25, 40),
    (3, "email_halbformell", 40, 15, 20),
]

B1_SPRECHEN = [
    (1, "gemeinsam_planen", "Gemeinsam etwas planen", 3, 28),
    (2, "praesentation", "Ein Thema präsentieren", 3, 40),
    (3, "rueckmeldung", "Über ein Thema sprechen", 2, 16),
]

B1_FOLIEN = [
    "Folie 1 — Nennen Sie das Thema Ihrer Präsentation und erklären Sie kurz, worum es geht.",
    "Folie 2 — Berichten Sie von Ihren eigenen Erfahrungen mit dem Thema.",
    "Folie 3 — Beschreiben Sie die Situation in Ihrem Heimatland. Geben Sie Beispiele.",
    "Folie 4 — Nennen Sie Vor- und Nachteile und sagen Sie dazu Ihre Meinung.",
    "Folie 5 — Beenden Sie Ihre Präsentation und bedanken Sie sich bei den Zuhörern.",
]

# --------------------------------------------------------------------------
# B2
# --------------------------------------------------------------------------

B2_LESEN = [
    (1, "zuordnung_person", 9, 18, "Vier Forumsbeiträge a-d, neun Aussagen zuordnen"),
    (2, "satz_einfuegen", 6, 12, "Zeitschriftenartikel mit sechs Lücken, acht Sätze a-h"),
    (3, "multiple_choice", 6, 12, "Zeitungsartikel, sechs Aufgaben"),
    (4, "zuordnung_aeusserungen", 6, 12, "Acht Meinungen a-h, sechs Überschriften"),
    (5, "zuordnung_ueberschriften", 3, 6, "Ordnung mit Inhaltsverzeichnis a-h"),
]

B2_HOEREN = [
    (1, "kurztexte", 10, 1, "Fünf kurze Gespräche und Äußerungen, je zwei Aufgaben"),
    (2, "interview", 6, 2, "Radiointerview, 500-600 Wörter"),
    (3, "gespraech", 6, 1, "Radiogespräch, Moderation + zwei Gäste, 550-650 Wörter"),
    (4, "vortrag", 8, 2, "Kurzvortrag, eine Person, 600-700 Wörter"),
]

B2_SCHREIBEN = [
    (1, "forumsbeitrag", 150, 50, 60),
    (2, "nachricht_formell", 100, 25, 40),
]

B2_SPRECHEN = [
    (1, "vortrag", "Einen Vortrag halten", 4, 50),
    (2, "diskussion", "Eine Debatte führen", 5, 50),
]

B2_GLIEDERUNG = [
    "Einleitung — Nennen Sie das Thema und sagen Sie, warum es Sie interessiert.",
    "Hauptteil — Beschreiben Sie die Situation und nennen Sie konkrete Beispiele.",
    "Hauptteil — Wägen Sie Vor- und Nachteile gegeneinander ab.",
    "Schluss — Fassen Sie zusammen und begründen Sie Ihre eigene Position.",
]


# Placeholder keys rotate rather than repeating. Partly so the scaffold passes
# the distribution check, and partly as a hint: a part whose answers are all the
# same letter can be ticked without reading it.
ROTATION = {
    "richtig_falsch": ("richtig", "falsch"),
    "ja_nein": ("ja", "nein"),
    "zuordnung_anzeigen": ("a",),
    "zuordnung_buchstabe": ("a",),
}


def item(nr: int, typ: str, mit_optionen: bool, buchstaben: str = "abc",
         dreh: int | None = None) -> dict[str, Any]:
    # `dreh` exists because the item number is not always a usable rotation
    # index: in Teil 1 the true/false items are every second number, so keying
    # off nr alone would give all five the same answer.
    moeglich = ROTATION.get(typ, tuple(buchstaben))
    eintrag: dict[str, Any] = {
        "nr": nr,
        "typ": typ,
        "frage": f"{TODO}: Frage {nr}",
        "loesung": moeglich[(nr if dreh is None else dreh) % len(moeglich)],
        "beleg": f"{TODO}: der Satz aus dem Text, der diese Lösung beweist",
        "kompetenz": "detailverstehen",
        "begruendung": {
            "de": f"{TODO}: Warum ist die Lösung richtig?",
            "en": f"{TODO}: Why is each distractor wrong? This is what learners need.",
        },
    }
    if mit_optionen:
        eintrag["optionen"] = {b: f"{TODO}: Option {b}" for b in buchstaben}
    return eintrag


def beispiel(typ: str, loesung: str, mit_optionen: bool = False,
             buchstaben: str = "abc") -> dict[str, Any]:
    eintrag: dict[str, Any] = {
        "nr": 0,
        "typ": typ,
        "frage": f"{TODO}: Beispielaufgabe",
        "loesung": loesung,
        "begruendung": {
            "de": f"{TODO}: kurze Erklärung",
            "en": f"{TODO}: short explanation",
        },
    }
    if mit_optionen:
        eintrag["optionen"] = {b: f"{TODO}: Option {b}" for b in buchstaben}
    return eintrag


def optionenliste(anzahl: int, was: str, mit_titel: bool) -> list[dict[str, Any]]:
    """The lettered alternatives for a B2 matching task."""
    out = []
    for b in "abcdefghij"[:anzahl]:
        eintrag: dict[str, Any] = {"buchstabe": b}
        if mit_titel:
            eintrag["titel"] = f"{TODO}: Name {b}"
        eintrag["inhalt"] = f"{TODO}: {was} {b}"
        out.append(eintrag)
    return out


# --------------------------------------------------------------------------
# A1 skeleton
# --------------------------------------------------------------------------


def a1_lesen_teil(nummer: int, typ: str, anzahl: int, minuten: int,
                  hinweis: str, start: int) -> dict[str, Any]:
    teil: dict[str, Any] = {
        "nummer": nummer,
        "typ": typ,
        "anweisung": f"{TODO}: Arbeitsanweisung. {hinweis}",
        "richtzeitMinuten": minuten,
    }

    if nummer == 2:
        # No text of its own: each item names a need and offers two places.
        teil["beispiel"] = beispiel("zwei_optionen", "a", True, "ab")
        teil["items"] = [item(start + i, "zwei_optionen", True, "ab", dreh=i)
                         for i in range(anzahl)]
        return teil

    anzahl_texte = 2 if nummer == 1 else 5
    quelle = ("kurze persönliche Mitteilung, etwa 40 bis 60 Wörter"
              if nummer == 1 else "Schild oder Aushang, ein bis drei Zeilen")
    teil["texte"] = [{
        "id": f"text_{nummer}_{i + 1}",
        "titel": f"{TODO}: Überschrift",
        "quelle": f"{TODO}: erfundene Quelle — niemals eine echte Publikation",
        "inhalt": f"{TODO}: {quelle}. Komplett selbst verfasst.",
    } for i in range(anzahl_texte)]

    teil["beispiel"] = beispiel("richtig_falsch", "richtig")
    teil["items"] = [item(start + i, "richtig_falsch", False, dreh=i)
                     for i in range(anzahl)]
    for i, eintrag in enumerate(teil["items"]):
        # Teil 1 splits five items over two messages; Teil 3 gives each sign
        # exactly one item.
        eintrag["textId"] = (f"text_1_{1 if i < 3 else 2}" if nummer == 1
                             else f"text_3_{i + 1}")
    return teil


def a1_hoeren_teil(nummer: int, typ: str, anzahl: int, wiederholungen: int,
                   hinweis: str, start: int) -> dict[str, Any]:
    sprecher = [
        {"rolle": f"Sprecher {i + 1}", "geschlecht": "f" if i % 2 else "m",
         "beschreibung": f"{TODO}: wer spricht und wo"}
        for i in range(min(anzahl, 3))
    ]
    teil = hoeren_geruest(nummer, typ, wiederholungen, hinweis, sprecher,
                          kurztexte=False)

    # Every A1 listening part is a handful of unrelated recordings, so the
    # skeleton lays one out per item rather than one long script.
    teil["skript"] = [teil["skript"][0]]
    for i in range(anzahl):
        marke = f"text_{i + 1}"
        teil["skript"].append({
            "rolle": "Sprecher", "text": f"Nummer {start + i}.",
            "pauseDanachSek": 1.2, "akustik": "studio", "abschnitt": marke,
        })
        teil["skript"].append({
            "rolle": sprecher[i % len(sprecher)]["rolle"],
            "text": f"{TODO}: kurzer Text {i + 1}, etwa 40 Wörter.",
            "pauseDanachSek": 10, "akustik": "mailbox", "betont": True,
            "abschnitt": marke,
        })

    item_typ = "richtig_falsch" if nummer == 2 else "multiple_choice"
    teil["items"] = []
    for i in range(anzahl):
        eintrag = item(start + i, item_typ, item_typ == "multiple_choice", dreh=i)
        eintrag["abschnitt"] = f"text_{i + 1}"
        teil["items"].append(eintrag)
    teil["beispiel"] = beispiel(item_typ, "richtig" if nummer == 2 else "a",
                                item_typ == "multiple_choice")
    return teil


# --------------------------------------------------------------------------
# A2 skeleton
# --------------------------------------------------------------------------


def a2_lesen_teil(nummer: int, typ: str, anzahl: int, minuten: int,
                  hinweis: str, start: int) -> dict[str, Any]:
    teil: dict[str, Any] = {
        "nummer": nummer,
        "typ": typ,
        "anweisung": f"{TODO}: Arbeitsanweisung. {hinweis}",
        "richtzeitMinuten": minuten,
    }

    if nummer == 4:
        teil["anzeigen"] = [
            {
                "buchstabe": b,
                "titel": f"{TODO}: Titel der Anzeige {b}",
                "inhalt": f"{TODO}: Anzeigentext {b}, etwa 25 bis 40 Wörter.",
            }
            for b in "abcdef"
        ]
        # The example consumes ad 'a', so the five items share b-f and one of
        # them finds nothing at all.
        teil["beispiel"] = beispiel(typ, "a")
        teil["items"] = [item(start + i, typ, False) for i in range(anzahl)]
        for i, eintrag in enumerate(teil["items"]):
            eintrag["loesung"] = "bcdef"[i]
            eintrag["kompetenz"] = "zuordnen"
        teil["items"][-1]["loesung"] = "x"
        return teil

    quelle = ("kurzer Artikel, etwa 150 bis 200 Wörter",
              "Tafel oder Programm — kurze Zeilen, keine Fließtexte",
              "private E-Mail, etwa 130 bis 180 Wörter")[nummer - 1]
    teil["texte"] = [{
        "id": f"text_{nummer}",
        "titel": f"{TODO}: Überschrift",
        "quelle": f"{TODO}: erfundene Quelle — niemals eine echte Publikation",
        "inhalt": f"{TODO}: {quelle}. Komplett selbst verfasst.",
    }]
    teil["items"] = [item(start + i, typ, True) for i in range(anzahl)]
    return teil


def a2_hoeren_teil(nummer: int, typ: str, anzahl: int, wiederholungen: int,
                   hinweis: str, start: int) -> dict[str, Any]:
    if nummer == 1:
        sprecher = [
            {"rolle": f"Sprecher {i + 1}", "geschlecht": "f" if i % 2 else "m",
             "beschreibung": f"{TODO}: wer spricht und wo"}
            for i in range(5)
        ]
    elif nummer == 3:
        sprecher = [
            {"rolle": f"Person {i + 1}", "geschlecht": "f" if i % 2 else "m",
             "beschreibung": f"{TODO}: wer spricht und wo"}
            for i in range(2)
        ]
    else:
        sprecher = [
            {"rolle": "Moderatorin" if nummer == 4 else "Sprecherin",
             "geschlecht": "f", "beschreibung": f"{TODO}: wer spricht"},
            {"rolle": "Gast" if nummer == 4 else "Sprecher",
             "geschlecht": "m", "beschreibung": f"{TODO}: wer spricht"},
        ]

    teil = hoeren_geruest(nummer, typ, wiederholungen, hinweis, sprecher,
                          kurztexte=nummer == 1)

    if nummer == 1:
        # One multiple-choice item per short text, not two as at B1.
        for i in range(5):
            eintrag = item(start + i, "multiple_choice", True, dreh=i)
            eintrag["abschnitt"] = f"text_{i + 1}"
            teil["items"].append(eintrag)
        teil["beispiel"] = beispiel("multiple_choice", "a", True)
        return teil

    if nummer == 2:
        # Nine lettered options, one used by the example and four left over.
        teil["optionenliste"] = optionenliste(9, "kurzes Stichwort", mit_titel=False)
        teil["beispiel"] = beispiel("zuordnung_buchstabe", "a")
        teil["items"] = [item(start + i, "zuordnung_buchstabe", False)
                         for i in range(anzahl)]
        for i, eintrag in enumerate(teil["items"]):
            eintrag["loesung"] = "bcdefghi"[i]
            eintrag["kompetenz"] = "zuordnen"
        return teil

    item_typ = "richtig_falsch" if nummer == 4 else "multiple_choice"
    teil["items"] = [item(start + i, item_typ, item_typ == "multiple_choice", dreh=i)
                     for i in range(anzahl)]
    if nummer == 4:
        teil["beispiel"] = beispiel("richtig_falsch", "richtig")
    return teil


# --------------------------------------------------------------------------
# B1 skeleton
# --------------------------------------------------------------------------


def b1_lesen_teil(nummer: int, typ: str, anzahl: int, minuten: int,
                  hinweis: str, start: int) -> dict[str, Any]:
    teil: dict[str, Any] = {
        "nummer": nummer,
        "typ": typ,
        "anweisung": f"{TODO}: Arbeitsanweisung. {hinweis}",
        "richtzeitMinuten": minuten,
    }

    if nummer == 3:
        teil["anzeigen"] = [
            {
                "buchstabe": b,
                "titel": f"{TODO}: Titel der Anzeige {b}",
                "inhalt": f"{TODO}: Anzeigentext {b}, etwa 30 bis 50 Wörter.",
            }
            for b in "abcdefghij"
        ]
    else:
        anzahl_texte = 2 if nummer == 2 else 1
        teil["texte"] = [
            {
                "id": f"text_{nummer}_{i + 1}",
                "titel": f"{TODO}: Überschrift",
                "quelle": f"{TODO}: erfundene Quelle — niemals eine echte Publikation",
                "inhalt": f"{TODO}: Text, etwa 230 bis 300 Wörter. Komplett selbst verfasst.",
            }
            for i in range(anzahl_texte)
        ]

    if nummer == 4:
        teil["these"] = f"{TODO}: die These, zu der sich die sieben Personen äußern"

    if nummer != 2:  # Teil 2 carries no worked example in the real paper
        teil["beispiel"] = beispiel(typ, item(0, typ, False)["loesung"])

    mit_optionen = typ == "multiple_choice"
    teil["items"] = [item(start + i, typ, mit_optionen) for i in range(anzahl)]

    if nummer == 2:
        # Three items per article, tied to the text they belong to.
        for i, eintrag in enumerate(teil["items"]):
            eintrag["textId"] = f"text_2_{1 if i < 3 else 2}"
    if nummer == 3:
        # Exactly one situation must have no matching advertisement.
        teil["items"][-1]["loesung"] = "0"
        for i, eintrag in enumerate(teil["items"][:-1]):
            eintrag["loesung"] = "abcdefghij"[i]
            eintrag["kompetenz"] = "zuordnen"
    if nummer == 4:
        for eintrag in teil["items"]:
            eintrag["kompetenz"] = "meinung_haltung"

    return teil


def b1_hoeren_teil(nummer: int, typ: str, anzahl: int, wiederholungen: int,
                   hinweis: str, start: int) -> dict[str, Any]:
    if nummer == 1:
        sprecher = [
            {"rolle": f"Sprecher {i + 1}", "geschlecht": "f" if i % 2 else "m",
             "beschreibung": f"{TODO}: wer spricht hier?"}
            for i in range(5)
        ]
    elif nummer == 2:
        sprecher = [{"rolle": "Vortragende", "geschlecht": "f",
                     "beschreibung": f"{TODO}: wer spricht?"}]
    elif nummer == 3:
        sprecher = [
            {"rolle": "Person A", "geschlecht": "f", "beschreibung": f"{TODO}"},
            {"rolle": "Person B", "geschlecht": "m", "beschreibung": f"{TODO}"},
        ]
    else:
        sprecher = [
            {"rolle": "Moderatorin", "geschlecht": "f", "beschreibung": "moderiert"},
            {"rolle": "Gast 1", "geschlecht": "m", "beschreibung": f"{TODO}"},
            {"rolle": "Gast 2", "geschlecht": "f", "beschreibung": f"{TODO}"},
        ]

    teil = hoeren_geruest(nummer, typ, wiederholungen, hinweis, sprecher, kurztexte=nummer == 1)

    if nummer == 1:
        fuelle_kurztexte(teil, start)
    elif nummer == 3:
        teil["items"] = [item(start + i, "richtig_falsch", False) for i in range(anzahl)]
    elif nummer == 4:
        teil["items"] = [item(start + i, "zuordnung_person", True) for i in range(anzahl)]
        for i, eintrag in enumerate(teil["items"]):
            eintrag["optionen"] = {"a": "die Moderatorin", "b": "Gast 1", "c": "Gast 2"}
            eintrag["loesung"] = "abc"[i % 3]
            eintrag["kompetenz"] = "zuordnen"
    else:
        teil["items"] = [item(start + i, "multiple_choice", True) for i in range(anzahl)]

    return teil


# --------------------------------------------------------------------------
# Shared listening scaffolding
# --------------------------------------------------------------------------


def hoeren_geruest(nummer: int, typ: str, wiederholungen: int, hinweis: str,
                   sprecher: list[dict[str, Any]], kurztexte: bool) -> dict[str, Any]:
    skript: list[dict[str, Any]] = [{
        "rolle": "Sprecher",
        "text": f"Teil {nummer}. {TODO}: Arbeitsanweisung zum Vorlesen.",
        "pauseDanachSek": 22 if kurztexte else 55,
        "akustik": "studio",
    }]

    if kurztexte:
        for i in range(5):
            skript.append({
                "rolle": "Sprecher", "text": f"Text {i + 1}.",
                "pauseDanachSek": 1.2, "akustik": "studio",
                "abschnitt": f"text_{i + 1}",
            })
            skript.append({
                "rolle": sprecher[i]["rolle"],
                "text": f"{TODO}: kurzer Text {i + 1}, etwa 80 Wörter.",
                "pauseDanachSek": 2, "akustik": "mailbox", "betont": True,
                "abschnitt": f"text_{i + 1}",
            })
    else:
        for s in sprecher:
            skript.append({
                "rolle": s["rolle"],
                "text": f"{TODO}: Redebeitrag. {hinweis}",
                "pauseDanachSek": 0.6,
                "akustik": "radio" if typ in ("diskussion", "interview") else "raum",
                "betont": True,
            })

    teil: dict[str, Any] = {
        "nummer": nummer,
        "typ": typ,
        "anweisung": f"{TODO}: Arbeitsanweisung. {hinweis}",
        "wiederholungen": wiederholungen,
        "sprecher": sprecher,
        "skript": skript,
        "items": [],
    }
    if not kurztexte:
        teil["situation"] = f"{TODO}: Situation, die auf dem Blatt steht"
    return teil


def fuelle_kurztexte(teil: dict[str, Any], start: int) -> None:
    """Each short text carries one true/false and one multiple-choice item."""
    for i in range(5):
        for j, typ_item in enumerate(("richtig_falsch", "multiple_choice")):
            eintrag = item(start + i * 2 + j, typ_item,
                           typ_item == "multiple_choice", dreh=i)
            eintrag["abschnitt"] = f"text_{i + 1}"
            teil["items"].append(eintrag)
    teil["beispiel"] = beispiel("richtig_falsch", "richtig")


# --------------------------------------------------------------------------
# B2 skeleton
# --------------------------------------------------------------------------


def b2_lesen_teil(nummer: int, typ: str, anzahl: int, minuten: int,
                  hinweis: str, start: int) -> dict[str, Any]:
    teil: dict[str, Any] = {
        "nummer": nummer,
        "typ": typ,
        "anweisung": f"{TODO}: Arbeitsanweisung. {hinweis}",
        "richtzeitMinuten": minuten,
    }
    nrs = list(range(start, start + anzahl))

    if nummer == 1:
        # Four forum writers, labelled a-d. The item options name them, so the
        # names live in one place and are copied into every item.
        namen = {b: f"{TODO}: Name {b}" for b in "abcd"}
        teil["texte"] = [
            {
                "id": f"person_{b}",
                "buchstabe": b,
                "titel": namen[b],
                "inhalt": f"{TODO}: Forumsbeitrag von {b}, etwa 130 bis 170 Wörter. "
                          f"Eine klare Haltung, aber nicht in einem Satz zusammenfassbar.",
            }
            for b in "abcd"
        ]
        teil["beispiel"] = beispiel("zuordnung_person", "a", True, "abcd")
        teil["beispiel"]["optionen"] = dict(namen)
        teil["items"] = [item(nr, "zuordnung_person", True, "abcd") for nr in nrs]
        for i, eintrag in enumerate(teil["items"]):
            eintrag["optionen"] = dict(namen)
            eintrag["loesung"] = "abcd"[i % 4]
            eintrag["kompetenz"] = "meinung_haltung"

    elif nummer == 2:
        luecken = " ".join(f"… [{nr}] …" for nr in nrs)
        teil["texte"] = [{
            "id": "text_2",
            "titel": f"{TODO}: Überschrift",
            "quelle": f"{TODO}: erfundene Quelle — niemals eine echte Publikation",
            "inhalt": f"{TODO}: Artikel, etwa 350 bis 420 Wörter, mit sechs Lücken. "
                      f"Jede Lücke steht als Nummer in eckigen Klammern an genau der "
                      f"Stelle, an der der Satz fehlt: {luecken}",
        }]
        teil["optionenliste"] = optionenliste(8, "Satz", mit_titel=False)
        # h is spent on the worked example, g is the decoy nobody uses.
        teil["beispiel"] = beispiel("zuordnung_buchstabe", "h")
        teil["items"] = [item(nr, "zuordnung_buchstabe", False) for nr in nrs]
        for i, eintrag in enumerate(teil["items"]):
            eintrag["loesung"] = "abcdef"[i]
            eintrag["kompetenz"] = "textstruktur"

    elif nummer == 3:
        teil["texte"] = [{
            "id": "text_3",
            "titel": f"{TODO}: Überschrift",
            "quelle": f"{TODO}: erfundene Quelle",
            "inhalt": f"{TODO}: Artikel, etwa 380 bis 450 Wörter. Enthält Haltungen "
                      f"und Abwägungen, nicht nur Fakten.",
        }]
        teil["items"] = [item(nr, "multiple_choice", True) for nr in nrs]

    elif nummer == 4:
        teil["optionenliste"] = optionenliste(8, "Meinungsäußerung, etwa 70 Wörter",
                                              mit_titel=True)
        teil["beispiel"] = beispiel("zuordnung_buchstabe", "a")
        teil["items"] = [item(nr, "zuordnung_buchstabe", False) for nr in nrs]
        for i, eintrag in enumerate(teil["items"]):
            eintrag["frage"] = f"{TODO}: Überschrift {nrs[i]}"
            eintrag["loesung"] = "bcdefg"[i]
            eintrag["kompetenz"] = "meinung_haltung"

    else:
        luecken = " ".join(f"§ [{nr}] …" for nr in nrs)
        teil["texte"] = [{
            "id": "text_5",
            "titel": f"{TODO}: Titel der Ordnung",
            "inhalt": f"{TODO}: Ordnung in Paragraphen, etwa 300 bis 380 Wörter. Drei "
                      f"Paragraphen tragen statt einer Überschrift ihre Nummer in "
                      f"eckigen Klammern: {luecken}",
        }]
        teil["optionenliste"] = optionenliste(8, "Überschrift aus dem Inhaltsverzeichnis",
                                              mit_titel=False)
        teil["beispiel"] = beispiel("zuordnung_buchstabe", "a")
        teil["items"] = [item(nr, "zuordnung_buchstabe", False) for nr in nrs]
        for i, eintrag in enumerate(teil["items"]):
            eintrag["loesung"] = "bcd"[i]
            eintrag["kompetenz"] = "selektivverstehen"

    return teil


def b2_hoeren_teil(nummer: int, typ: str, anzahl: int, wiederholungen: int,
                   hinweis: str, start: int) -> dict[str, Any]:
    if nummer == 1:
        sprecher = [
            {"rolle": f"Sprecher {i + 1}", "geschlecht": "f" if i % 2 else "m",
             "beschreibung": f"{TODO}: wer spricht hier?"}
            for i in range(5)
        ]
    elif nummer == 2:
        sprecher = [
            {"rolle": "Moderator", "geschlecht": "m", "beschreibung": "führt das Interview"},
            {"rolle": "Fachfrau", "geschlecht": "f", "beschreibung": f"{TODO}: wer wird interviewt?"},
        ]
    elif nummer == 3:
        sprecher = [
            {"rolle": "Moderatorin", "geschlecht": "f", "beschreibung": "moderiert"},
            {"rolle": "Gast 1", "geschlecht": "m", "beschreibung": f"{TODO}"},
            {"rolle": "Gast 2", "geschlecht": "f", "beschreibung": f"{TODO}"},
        ]
    else:
        sprecher = [{"rolle": "Vortragender", "geschlecht": "m",
                     "beschreibung": f"{TODO}: wer hält den Vortrag?"}]

    teil = hoeren_geruest(nummer, typ, wiederholungen, hinweis, sprecher,
                          kurztexte=nummer == 1)

    if nummer == 1:
        fuelle_kurztexte(teil, start)
    elif nummer == 3:
        teil["items"] = [item(start + i, "zuordnung_person", True) for i in range(anzahl)]
        for i, eintrag in enumerate(teil["items"]):
            eintrag["optionen"] = {"a": "die Moderatorin", "b": "Gast 1", "c": "Gast 2"}
            eintrag["loesung"] = "abc"[i % 3]
            eintrag["kompetenz"] = "zuordnen"
    else:
        teil["items"] = [item(start + i, "multiple_choice", True) for i in range(anzahl)]

    return teil


# --------------------------------------------------------------------------
# Assembling a whole paper
# --------------------------------------------------------------------------


def schreiben_aufgabe(nummer: int, typ: str, woerter: int, minuten: int,
                      punkte: int, mit_impuls: bool,
                      woerter_max: int | None = None) -> dict[str, Any]:
    if typ == "formular":
        return {
            "nummer": nummer,
            "typ": typ,
            "situation": f"{TODO}: die Situation, aus der die fünf Angaben hervorgehen",
            "aufgabenstellung": f"{TODO}: die Aufgabenstellung",
            "leitpunkte": [f"{TODO}: Hinweis {i + 1}" for i in range(3)],
            "woerter": 0,
            "zeitMinuten": minuten,
            "punkte": punkte,
            "formular": [
                {"feld": f"{TODO}: Feldname {i + 1}",
                 "loesung": f"{TODO}: Eintrag",
                 "begruendung": f"{TODO}: Woraus in der Situation folgt das?"}
                for i in range(5)
            ],
        }

    # A2 asks for three points and a word *range*; B1 and B2 ask for four and
    # state a target or a floor.
    punkte_anzahl = 3 if woerter_max else 4
    return {
        "nummer": nummer,
        "typ": typ,
        "situation": f"{TODO}: die Situation",
        **({"impuls": f"{TODO}: der Beitrag, auf den geantwortet wird"} if mit_impuls else {}),
        "aufgabenstellung": f"{TODO}: die Aufgabenstellung",
        "leitpunkte": [f"{TODO}: Leitpunkt {i + 1}" for i in range(punkte_anzahl)],
        "anrede": f"{TODO}: passende Anrede",
        "woerter": woerter,
        **({"woerterMax": woerter_max} if woerter_max else {}),
        "zeitMinuten": minuten,
        "punkte": punkte,
        "redemittel": [f"{TODO}: nützliche Wendung"],
        "musterloesungen": [
            {"niveau": stufe,
             "text": f"{TODO}: Musterlösung auf Niveau '{stufe}', etwa "
                     f"{(woerter + woerter_max) // 2 if woerter_max else woerter} Wörter.",
             "kommentar": f"{TODO}: Was macht diesen Text '{stufe}'?"}
            for stufe in ("ausreichend", "gut")
        ],
    }


def sprechen_teil(nummer: int, typ: str, titel: str, dauer: float, punkte: int,
                  folien: list[str]) -> dict[str, Any]:
    teil: dict[str, Any] = {
        "nummer": nummer,
        "typ": typ,
        "titel": titel,
        "anweisung": f"{TODO}: Arbeitsanweisung",
        "dauerMinuten": dauer,
        "punkte": punkte,
    }

    if typ == "sich_vorstellen":
        teil["karten"] = [f"{TODO}: Stichwort {i + 1}, z. B. „Name“" for i in range(7)]
        teil["partnerSkript"] = [
            {"text": f"{TODO}: Rückfrage der Prüferin {i + 1}",
             "wartenSek": 15,
             "hinweis": f"{TODO}: Was soll die Kandidatin jetzt sagen?"}
            for i in range(2)
        ]
    elif typ == "informationen_erfragen":
        teil["karten"] = [f"{TODO}: Thema {i + 1}, z. B. „Wohnen“" for i in range(2)]
        teil["planungspunkte"] = [f"{TODO}: Wonach soll gefragt werden? {i + 1}"
                                  for i in range(3)]
        teil["partnerSkript"] = [
            {"text": f"{TODO}: Frage des simulierten Partners {i + 1}",
             "wartenSek": 20,
             "hinweis": f"{TODO}: Hinweis für die Kandidatin"}
            for i in range(2)
        ]
    elif typ == "bitten_formulieren":
        teil["karten"] = [f"{TODO}: Gegenstand {i + 1}, z. B. „ein Glas Wasser“"
                          for i in range(3)]
        teil["partnerSkript"] = [
            {"text": f"{TODO}: Bitte des simulierten Partners {i + 1}",
             "wartenSek": 15,
             "hinweis": f"{TODO}: Wie soll die Kandidatin reagieren?"}
            for i in range(3)
        ]
    elif typ == "fragen_zur_person":
        teil["karten"] = [f"{TODO}: Stichwort {i + 1}, z. B. „Beruf?“" for i in range(4)]
        teil["partnerSkript"] = [
            {"text": f"{TODO}: Frage des simulierten Partners {i + 1}",
             "wartenSek": 15,
             "hinweis": f"{TODO}: Was soll die Kandidatin jetzt antworten?"}
            for i in range(4)
        ]
    elif typ == "ueber_sich_erzaehlen":
        teil["situation"] = (f"{TODO}: die Frage auf der Karte, z. B. "
                             f"„Was machen Sie am Wochenende?“")
        teil["planungspunkte"] = [f"{TODO}: Stichwort {i + 1} auf der Karte"
                                  for i in range(4)]
        teil["fragen"] = [f"{TODO}: Zusatzfrage der Prüferin {i + 1}" for i in range(2)]
    elif typ == "gemeinsam_planen":
        teil["situation"] = f"{TODO}: die zu planende Situation"
        teil["planungspunkte"] = [f"{TODO}: Planungspunkt {i + 1}" for i in range(5)]
        teil["partnerSkript"] = [
            {"text": f"{TODO}: Beitrag des simulierten Partners {i + 1}",
             "wartenSek": 25,
             "hinweis": f"{TODO}: Was soll die Kandidatin jetzt tun?"}
            for i in range(5)
        ]
    elif typ in ("praesentation", "vortrag"):
        teil["themen"] = [
            {"titel": f"{TODO}: Thema {i + 1} — noch in keiner anderen Prüfung",
             "folien": folien,
             "redemittel": [f"{TODO}: Redemittel"],
             "musterantwort": f"{TODO}: Mustervortrag, etwa "
                              f"{250 if typ == 'praesentation' else 400} Wörter, der die "
                              f"ganze Gliederung abdeckt."}
            for i in range(2)
        ]
        teil["fragen"] = [f"{TODO}: Frage nach dem Vortrag {i + 1}" for i in range(3)]
        if typ == "vortrag":
            teil["partnerSkript"] = [
                {"text": f"{TODO}: Rückfrage der Partnerin {i + 1}",
                 "wartenSek": 40,
                 "hinweis": f"{TODO}: Hinweis für die Kandidatin"}
                for i in range(2)
            ]
    elif typ == "rueckmeldung":
        teil["fragen"] = [f"{TODO}: Frage {i + 1}" for i in range(3)]
        teil["partnerSkript"] = [
            {"text": f"{TODO}: Rückmeldung und Frage des Partners",
             "wartenSek": 40,
             "hinweis": f"{TODO}: Hinweis für die Kandidatin"}
        ]
    elif typ == "diskussion":
        teil["situation"] = f"{TODO}: die Debattenfrage, z. B. „Sollen …?“"
        teil["planungspunkte"] = [f"{TODO}: Aspekt {i + 1}, den die Debatte berühren soll"
                                  for i in range(4)]
        teil["partnerSkript"] = [
            {"text": f"{TODO}: Argument der Partnerin {i + 1} — sie vertritt die "
                     f"Gegenposition und geht auf die Kandidatin ein",
             "wartenSek": 35,
             "hinweis": f"{TODO}: Worauf soll die Kandidatin jetzt reagieren?"}
            for i in range(4)
        ]

    return teil


def geruest(exam_id: str, stufe: str, variante: str, niveau: str) -> dict[str, Any]:
    # A2 is short everywhere: 30 minutes per written module rather than 60-75,
    # and no preparation time at all — the cards are handed out during the test.
    modulzeiten = {"lesen": 65, "hoeren": 40, "vorbereitung": 15}
    if stufe == "A1":
        lesen_spec, hoeren_spec = A1_LESEN, A1_HOEREN
        schreiben_spec, sprechen_spec = A1_SCHREIBEN, A1_SPRECHEN
        lesen_bau, hoeren_bau = a1_lesen_teil, a1_hoeren_teil
        folien, schreiben_zeit = [], 20
        impuls_bei = set()
        wortschatzniveau = "A1"
        modulzeiten = {"lesen": 25, "hoeren": 20, "vorbereitung": 0}
    elif stufe == "A2":
        lesen_spec, hoeren_spec = A2_LESEN, A2_HOEREN
        schreiben_spec, sprechen_spec = A2_SCHREIBEN, A2_SPRECHEN
        lesen_bau, hoeren_bau = a2_lesen_teil, a2_hoeren_teil
        folien, schreiben_zeit = [], 30
        impuls_bei = set()
        wortschatzniveau = "A2"
        modulzeiten = {"lesen": 30, "hoeren": 30, "vorbereitung": 0}
    elif stufe == "B2":
        lesen_spec, hoeren_spec = B2_LESEN, B2_HOEREN
        schreiben_spec, sprechen_spec = B2_SCHREIBEN, B2_SPRECHEN
        lesen_bau, hoeren_bau = b2_lesen_teil, b2_hoeren_teil
        folien, schreiben_zeit = B2_GLIEDERUNG, 75
        impuls_bei = {1}
        wortschatzniveau = "B2"
    else:
        lesen_spec, hoeren_spec = B1_LESEN, B1_HOEREN
        schreiben_spec, sprechen_spec = B1_SCHREIBEN, B1_SPRECHEN
        lesen_bau, hoeren_bau = b1_lesen_teil, b1_hoeren_teil
        folien, schreiben_zeit = B1_FOLIEN, 60
        impuls_bei = {2}
        wortschatzniveau = "B1"

    lesen, nr = [], 1
    for nummer, typ, anzahl, minuten, hinweis in lesen_spec:
        lesen.append(lesen_bau(nummer, typ, anzahl, minuten, hinweis, nr))
        nr += anzahl

    hoeren, nr = [], 1
    for nummer, typ, anzahl, wdh, hinweis in hoeren_spec:
        hoeren.append(hoeren_bau(nummer, typ, anzahl, wdh, hinweis, nr))
        nr += anzahl

    return {
        "$schema": "../../../packages/schema/exam.schema.json",
        "meta": {
            "id": exam_id,
            "titel": f"{TODO}: Titel der Prüfung",
            "stufe": stufe,
            "variante": variante,
            "niveau": niveau,
            "contentVersion": "0.1.0",
            "sprechtempoProzent": -8 if niveau == "mittel-leicht" else 0,
            "themen": [f"{TODO}: Thema 1", f"{TODO}: Thema 2", f"{TODO}: Thema 3"],
            "autor": f"{TODO}: Ihr Name",
            "lizenz": "CC-BY-4.0",
            "originalitaet": True,
        },
        "lesen": {"zeitMinuten": modulzeiten["lesen"], "teile": lesen},
        "hoeren": {"zeitMinuten": modulzeiten["hoeren"], "teile": hoeren},
        "schreiben": {
            "zeitMinuten": schreiben_zeit,
            "aufgaben": [
                schreiben_aufgabe(a[0], a[1], a[2], a[-2], a[-1],
                                  a[0] in impuls_bei,
                                  a[3] if len(a) == 6 else None)
                for a in schreiben_spec
            ],
        },
        "sprechen": {
            "vorbereitungMinuten": modulzeiten["vorbereitung"],
            "teile": [
                sprechen_teil(n, typ, titel, dauer, punkte, folien)
                for n, typ, titel, dauer, punkte in sprechen_spec
            ],
        },
        "glossar": [
            {
                "lemma": f"{TODO}: Wort {i + 1} — muss im Text vorkommen",
                "wortart": "nomen",
                "artikel": "der",
                "plural": f"{TODO}: Pluralform",
                "bedeutung_de": f"{TODO}: Erklärung auf Deutsch",
                "bedeutung_en": f"{TODO}: English meaning",
                "beispiel": f"{TODO}: der Satz aus der Prüfung",
                "fundstelle": "Lesen Teil 1",
                "niveau": wortschatzniveau,
            }
            for i in range(25)
        ],
        "redewendungen": [
            {
                "wendung": f"{TODO}: Wendung — muss wörtlich im Text stehen",
                "typ": "redewendung",
                "bedeutung_de": f"{TODO}",
                "bedeutung_en": f"{TODO}",
                "beispiel": f"{TODO}: der Satz aus der Prüfung",
                "fundstelle": "Lesen Teil 1",
            }
        ],
        "grammatik": [
            {
                "phaenomen": f"{TODO}: Grammatikthema {i + 1}",
                "erklaerung_de": f"{TODO}: Erklärung auf Deutsch, mindestens 30 Zeichen.",
                "erklaerung_en": f"{TODO}: Explanation in English, at least 30 characters.",
                "belegSatz": f"{TODO}: ein echter Satz aus dieser Prüfung",
                "fundstelle": "Lesen Teil 1",
                "uebungen": [
                    {"aufgabe": f"{TODO}: Übung {j + 1}",
                     "loesung": f"{TODO}: Lösung",
                     "hinweis": f"{TODO}: Tipp"}
                    for j in range(3)
                ],
            }
            for i in range(3)
        ],
    }


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("exam", help="new exam id, e.g. pruefung-06 or b2-pruefung-02")
    ap.add_argument("--stufe", choices=["A1", "A2", "B1", "B2"],
                    help="level; inferred from the id when omitted")
    ap.add_argument("--variante", choices=["erwachsene", "jugendliche"],
                    default="erwachsene")
    ap.add_argument("--niveau", choices=["mittel-leicht", "mittel"], default="mittel")
    ap.add_argument("--force", action="store_true", help="overwrite an existing exam")
    args = ap.parse_args(list(argv) if argv is not None else None)

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    # The id carries the level, so the two cannot disagree silently.
    aus_id = next((s for p, s in (("a1-", "A1"), ("a2-", "A2"), ("b2-", "B2"))
                   if args.exam.startswith(p)), "B1")
    stufe = args.stufe or aus_id
    if stufe != aus_id:
        vorschlag = f"b2-{args.exam}" if stufe == "B2" else args.exam.removeprefix("b2-")
        print(f"--stufe {stufe} does not match the id {args.exam!r}, which means {aus_id}.\n"
              f"Use {vorschlag!r} instead.")
        return 1

    ziel = CONTENT / args.exam / "exam.json"
    if ziel.exists() and not args.force:
        print(f"{ziel} exists already. Pass --force to overwrite it.")
        return 1

    ziel.parent.mkdir(parents=True, exist_ok=True)
    ziel.write_text(
        json.dumps(geruest(args.exam, stufe, args.variante, args.niveau),
                   ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"""
Created {ziel.relative_to(ROOT)}

  {stufe}, {args.variante}, {args.niveau} — 30 Lesen- und 30 Hören-Aufgaben angelegt.

Next:
  1. Read docs/AUTHORING.md and docs/EXAM-FORMAT.md. Everything must be original.
  2. Replace every "{TODO}" — search for it; the file is full of them.
  3. python tools/validate.py {args.exam} --strict
  4. python tools/generate_audio.py {args.exam}   and listen to all of it
  5. python tools/build_pdf.py {args.exam}

The validator will refuse this file until the placeholders are gone. That is
deliberate: it means a half-finished paper can never reach a learner.
""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
