#!/usr/bin/env python3
"""Scaffold a new exam with the right shape already in place.

    python tools/new_exam.py pruefung-06
    python tools/new_exam.py pruefung-06 --variante jugendliche --niveau mittel

Writes content/exams/<id>/exam.json with every part, the correct number of
placeholder items, and a TODO on each field you have to fill in. Nothing in it
is real content — `validate.py` will reject it until you replace the
placeholders, which is the point.

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

LESEN_TEILE = [
    (1, "richtig_falsch", 6, 10, "Blogeintrag oder persönlicher Bericht"),
    (2, "multiple_choice", 6, 20, "Zwei Zeitungsartikel, je drei Aufgaben"),
    (3, "zuordnung_anzeigen", 7, 10, "Zehn Anzeigen a-j, eine Situation ohne Treffer"),
    (4, "ja_nein", 7, 15, "Sieben Meinungen zu einer These"),
    (5, "multiple_choice", 4, 10, "Benutzungsordnung oder Hausordnung"),
]

HOEREN_TEILE = [
    (1, "kurztexte", 10, 2, "Fünf kurze Texte, je ein r/f- und ein MC-Item"),
    (2, "monolog", 5, 1, "Vortrag oder Führung, 450-550 Wörter"),
    (3, "gespraech", 7, 1, "Alltagsgespräch, zwei Personen, 450-550 Wörter"),
    (4, "diskussion", 8, 2, "Radiodiskussion, Moderation + zwei Gäste, 600-750 Wörter"),
]

SCHREIBEN = [
    (1, "email_informell", 80, 20, 40),
    (2, "forumsbeitrag", 80, 25, 40),
    (3, "email_halbformell", 40, 15, 20),
]

SPRECHEN = [
    (1, "gemeinsam_planen", "Gemeinsam etwas planen", 3, 28),
    (2, "praesentation", "Ein Thema präsentieren", 3, 40),
    (3, "rueckmeldung", "Über ein Thema sprechen", 2, 16),
]

FOLIEN = [
    "Folie 1 — Nennen Sie das Thema Ihrer Präsentation und erklären Sie kurz, worum es geht.",
    "Folie 2 — Berichten Sie von Ihren eigenen Erfahrungen mit dem Thema.",
    "Folie 3 — Beschreiben Sie die Situation in Ihrem Heimatland. Geben Sie Beispiele.",
    "Folie 4 — Nennen Sie Vor- und Nachteile und sagen Sie dazu Ihre Meinung.",
    "Folie 5 — Beenden Sie Ihre Präsentation und bedanken Sie sich bei den Zuhörern.",
]


def item(nr: int, typ: str, mit_optionen: bool) -> dict[str, Any]:
    eintrag: dict[str, Any] = {
        "nr": nr,
        "typ": typ,
        "frage": f"{TODO}: Frage {nr}",
        "loesung": {
            "richtig_falsch": "richtig",
            "ja_nein": "ja",
            "zuordnung_anzeigen": "a",
        }.get(typ, "a"),
        "beleg": f"{TODO}: der Satz aus dem Text, der diese Lösung beweist",
        "kompetenz": "detailverstehen",
        "begruendung": {
            "de": f"{TODO}: Warum ist die Lösung richtig?",
            "en": f"{TODO}: Why is each distractor wrong? This is what learners need.",
        },
    }
    if mit_optionen:
        eintrag["optionen"] = {b: f"{TODO}: Option {b}" for b in ("a", "b", "c")}
    return eintrag


def lesen_teil(nummer: int, typ: str, anzahl: int, minuten: int,
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
        teil["beispiel"] = {
            "nr": 0,
            "typ": typ,
            "frage": f"{TODO}: Beispielaufgabe",
            "loesung": item(0, typ, False)["loesung"],
            "begruendung": {
                "de": f"{TODO}: kurze Erklärung",
                "en": f"{TODO}: short explanation",
            },
        }

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


def hoeren_teil(nummer: int, typ: str, anzahl: int, wiederholungen: int,
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

    skript = [{
        "rolle": "Sprecher",
        "text": f"Teil {nummer}. {TODO}: Arbeitsanweisung zum Vorlesen.",
        "pauseDanachSek": 22 if nummer == 1 else 55,
        "akustik": "studio",
    }]

    if nummer == 1:
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
                "akustik": "radio" if nummer == 4 else "raum",
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
    if nummer != 1:
        teil["situation"] = f"{TODO}: Situation, die auf dem Blatt steht"

    if nummer == 1:
        # Each short text carries one true/false and one multiple-choice item.
        for i in range(5):
            for j, typ_item in enumerate(("richtig_falsch", "multiple_choice")):
                eintrag = item(start + i * 2 + j, typ_item, typ_item == "multiple_choice")
                eintrag["abschnitt"] = f"text_{i + 1}"
                teil["items"].append(eintrag)
        teil["beispiel"] = {
            "nr": 0, "typ": "richtig_falsch", "frage": f"{TODO}: Beispiel",
            "loesung": "richtig",
            "begruendung": {"de": f"{TODO}", "en": f"{TODO}"},
        }
    elif nummer == 3:
        teil["items"] = [item(start + i, "richtig_falsch", False) for i in range(anzahl)]
    elif nummer == 4:
        teil["items"] = [item(start + i, "zuordnung_person", True) for i in range(anzahl)]
        for i, eintrag in enumerate(teil["items"]):
            eintrag["optionen"] = {
                "a": "die Moderatorin", "b": "Gast 1", "c": "Gast 2",
            }
            eintrag["loesung"] = "abc"[i % 3]
            eintrag["kompetenz"] = "zuordnen"
    else:
        teil["items"] = [item(start + i, "multiple_choice", True) for i in range(anzahl)]

    return teil


def geruest(exam_id: str, variante: str, niveau: str) -> dict[str, Any]:
    lesen, nr = [], 1
    for nummer, typ, anzahl, minuten, hinweis in LESEN_TEILE:
        lesen.append(lesen_teil(nummer, typ, anzahl, minuten, hinweis, nr))
        nr += anzahl

    hoeren, nr = [], 1
    for nummer, typ, anzahl, wdh, hinweis in HOEREN_TEILE:
        hoeren.append(hoeren_teil(nummer, typ, anzahl, wdh, hinweis, nr))
        nr += anzahl

    return {
        "$schema": "../../../packages/schema/exam.schema.json",
        "meta": {
            "id": exam_id,
            "titel": f"{TODO}: Titel der Prüfung",
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
            "zeitMinuten": 60,
            "aufgaben": [
                {
                    "nummer": n,
                    "typ": typ,
                    "situation": f"{TODO}: die Situation",
                    **({"impuls": f"{TODO}: der Forumsbeitrag, auf den geantwortet wird"}
                       if typ == "forumsbeitrag" else {}),
                    "aufgabenstellung": f"{TODO}: die Aufgabenstellung",
                    "leitpunkte": [f"{TODO}: Leitpunkt {i + 1}" for i in range(3)],
                    "anrede": f"{TODO}: passende Anrede",
                    "woerter": woerter,
                    "zeitMinuten": minuten,
                    "punkte": punkte,
                    "redemittel": [f"{TODO}: nützliche Wendung"],
                    "musterloesungen": [
                        {"niveau": stufe,
                         "text": f"{TODO}: Musterlösung auf Niveau '{stufe}', "
                                 f"etwa {woerter} Wörter.",
                         "kommentar": f"{TODO}: Was macht diesen Text '{stufe}'?"}
                        for stufe in ("ausreichend", "gut")
                    ],
                }
                for n, typ, woerter, minuten, punkte in SCHREIBEN
            ],
        },
        "sprechen": {
            "vorbereitungMinuten": 15,
            "teile": [
                {
                    "nummer": n,
                    "typ": typ,
                    "titel": titel,
                    "anweisung": f"{TODO}: Arbeitsanweisung",
                    "dauerMinuten": dauer,
                    "punkte": punkte,
                    **({"situation": f"{TODO}: die zu planende Situation",
                        "planungspunkte": [f"{TODO}: Planungspunkt {i + 1}" for i in range(5)],
                        "partnerSkript": [
                            {"text": f"{TODO}: Beitrag des simulierten Partners {i + 1}",
                             "wartenSek": 25,
                             "hinweis": f"{TODO}: Was soll die Kandidatin jetzt tun?"}
                            for i in range(5)
                        ]} if typ == "gemeinsam_planen" else {}),
                    **({"themen": [
                        {"titel": f"{TODO}: Thema {i + 1} — noch in keiner anderen Prüfung",
                         "folien": FOLIEN,
                         "redemittel": [f"{TODO}: Redemittel"],
                         "musterantwort": f"{TODO}: Musterpräsentation, etwa 250 Wörter, "
                                          f"die alle fünf Folien abdeckt."}
                        for i in range(2)
                    ]} if typ == "praesentation" else {}),
                    **({"fragen": [f"{TODO}: Frage {i + 1}" for i in range(3)],
                        "partnerSkript": [
                            {"text": f"{TODO}: Rückmeldung und Frage des Partners",
                             "wartenSek": 40,
                             "hinweis": f"{TODO}: Hinweis für die Kandidatin"}
                        ]} if typ == "rueckmeldung" else {}),
                }
                for n, typ, titel, dauer, punkte in SPRECHEN
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
                "niveau": "B1",
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
    ap.add_argument("exam", help="new exam id, e.g. pruefung-06")
    ap.add_argument("--variante", choices=["erwachsene", "jugendliche"],
                    default="erwachsene")
    ap.add_argument("--niveau", choices=["mittel-leicht", "mittel"], default="mittel")
    ap.add_argument("--force", action="store_true", help="overwrite an existing exam")
    args = ap.parse_args(list(argv) if argv is not None else None)

    ziel = CONTENT / args.exam / "exam.json"
    if ziel.exists() and not args.force:
        print(f"{ziel} exists already. Pass --force to overwrite it.")
        return 1

    ziel.parent.mkdir(parents=True, exist_ok=True)
    ziel.write_text(
        json.dumps(geruest(args.exam, args.variante, args.niveau),
                   ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"""
Created {ziel.relative_to(ROOT)}

  {args.variante}, {args.niveau} — 30 Lesen- und 30 Hören-Aufgaben angelegt.

Next:
  1. Read docs/AUTHORING.md. Everything you write must be original.
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
