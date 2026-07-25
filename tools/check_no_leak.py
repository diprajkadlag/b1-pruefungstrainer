#!/usr/bin/env python3
"""Assert that the exported public content contains no answer data.

    python tools/check_no_leak.py

`tools/export_web.py` strips answers, evidence and rationales before writing
the half the browser downloads at exam time. This checks the files that were
actually produced, so a future change to the schema or the exporter cannot
quietly start shipping the key to candidates.

Worked examples are exempt: they are meant to show their answer.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPORT = ROOT / "apps" / "web" / "public" / "content"

VERBOTEN = ("loesung", "beleg", "begruendung", "kompetenz")
VERBOTEN_TEXT = ("musterloesung", "musterantwort", "redemittel")


def main() -> int:
    if not EXPORT.exists():
        print(f"No export at {EXPORT}. Run tools/export_web.py first.")
        return 1

    dateien = sorted(EXPORT.glob("*/exam.public.json"))
    if not dateien:
        print(f"No exam.public.json under {EXPORT}.")
        return 1

    fehler: list[str] = []

    for datei in dateien:
        exam_id = datei.parent.name
        daten = json.loads(datei.read_text(encoding="utf-8"))

        for modul in ("lesen", "hoeren"):
            for teil in daten[modul]["teile"]:
                for item in teil["items"]:
                    for feld in VERBOTEN:
                        if feld in item:
                            fehler.append(
                                f"{exam_id} {modul} Teil {teil['nummer']} "
                                f"item {item['nr']} carries '{feld}'"
                            )

        roh = datei.read_text(encoding="utf-8").casefold()
        for wort in VERBOTEN_TEXT:
            if wort in roh:
                fehler.append(f"{exam_id}: the public half mentions '{wort}'")

    if fehler:
        print("Answer data leaked into the public export:\n")
        for f in fehler:
            print(f"  {f}")
        print(f"\n{len(fehler)} problem(s). The app would show candidates the key.")
        return 1

    print(f"{len(dateien)} exam(s) checked: no answer data in the public export.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
