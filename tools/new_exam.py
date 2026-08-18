#!/usr/bin/env python3
"""Scaffold a new exam with the right shape already in place.

    python tools/new_exam.py pruefung-06                  # B1
    python tools/new_exam.py b2-pruefung-02               # B2, from the id
    python tools/new_exam.py pruefung-06 --variante jugendliche --niveau mittel

Writes content/exams/<id>/exam.json with every part, the correct number of
placeholder items, and a TODO on each field you have to fill in. Nothing in it
is real content — `validate.py` will reject it until you replace the
placeholders, which is the point.

The level comes from the id: `pruefung-NN` is B1, `b2-pruefung-NN` is B2. They
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
                      punkte: int, mit_impuls: bool) -> dict[str, Any]:
    return {
        "nummer": nummer,
        "typ": typ,
        "situation": f"{TODO}: die Situation",
        **({"impuls": f"{TODO}: der Beitrag, auf den geantwortet wird"} if mit_impuls else {}),
        "aufgabenstellung": f"{TODO}: die Aufgabenstellung",
        "leitpunkte": [f"{TODO}: Leitpunkt {i + 1}" for i in range(4)],
        "anrede": f"{TODO}: passende Anrede",
        "woerter": woerter,
        "zeitMinuten": minuten,
        "punkte": punkte,
        "redemittel": [f"{TODO}: nützliche Wendung"],
        "musterloesungen": [
            {"niveau": stufe,
             "text": f"{TODO}: Musterlösung auf Niveau '{stufe}', etwa {woerter} Wörter.",
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

    if typ == "gemeinsam_planen":
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
    if stufe == "B2":
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
        "lesen": {"zeitMinuten": 65, "teile": lesen},
        "hoeren": {"zeitMinuten": 40, "teile": hoeren},
        "schreiben": {
            "zeitMinuten": schreiben_zeit,
            "aufgaben": [
                schreiben_aufgabe(n, typ, woerter, minuten, punkte, n in impuls_bei)
                for n, typ, woerter, minuten, punkte in schreiben_spec
            ],
        },
        "sprechen": {
            "vorbereitungMinuten": 15,
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
    ap.add_argument("--stufe", choices=["B1", "B2"],
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
    aus_id = "B2" if args.exam.startswith("b2-") else "B1"
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
