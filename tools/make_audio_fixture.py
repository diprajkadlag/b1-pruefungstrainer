#!/usr/bin/env python3
"""Write placeholder listening tracks so the app can be tested without Piper.

    python tools/make_audio_fixture.py

Synthesising the real audio needs the Piper voice models — several hundred
megabytes downloaded and a few minutes of work per exam. That is right for a
release build and wasteful for a pull request that changed a button.

The end-to-end tests care about the *player*: that the start control appears,
that playback locks the part, that seeking and pausing are refused. None of
that depends on the audio being speech. So this writes a short, quiet tone in
place of each track, plus a manifest with the same shape the real pipeline
produces.

These files are obviously not exam material and are never published: they are
written into the app's exported content only, which is gitignored, and the
manifest marks them so nothing mistakes them for the real thing.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
EXPORT = ROOT / "apps" / "web" / "public" / "content"
SR = 22050
DAUER_SEK = 4.0


def ton(sekunden: float, hz: float) -> np.ndarray:
    """A quiet tone with fades, so a test run is not unpleasant to listen to."""
    t = np.arange(int(SR * sekunden)) / SR
    hüll = np.minimum(np.minimum(t, sekunden - t) / 0.05, 1.0)
    return (np.sin(2 * np.pi * hz * t) * hüll * 0.05).astype(np.float32)


def fixture_fuer(exam_id: str, exam: dict) -> dict:
    out_dir = EXPORT / exam_id / "audio"
    out_dir.mkdir(parents=True, exist_ok=True)

    hoeren = []
    for teil in exam["hoeren"]["teile"]:
        nummer = teil["nummer"]
        datei = f"hoeren_teil{nummer}.mp3"
        sf.write(out_dir / datei, ton(DAUER_SEK, 220.0 * nummer), SR, format="MP3")
        hoeren.append({
            "teil": nummer,
            "datei": datei,
            "dauerSek": DAUER_SEK,
            "wiederholungen": teil["wiederholungen"],
            "woerter": 0,
            "wpm": 0.0,
            "cues": [],
        })

    sprechen = []
    for teil in exam["sprechen"]["teile"]:
        for idx, turn in enumerate(teil.get("partnerSkript") or [], start=1):
            datei = f"sprechen_t{teil['nummer']}_partner_{idx:02d}.mp3"
            sf.write(out_dir / datei, ton(2.0, 330.0), SR, format="MP3")
            sprechen.append({
                "teil": teil["nummer"],
                "index": idx,
                "datei": datei,
                "dauerSek": 2.0,
                "wartenSek": turn["wartenSek"],
                "hinweis": turn.get("hinweis", ""),
                "text": turn["text"],
            })

    manifest = {
        "examId": exam_id,
        "provider": "fixture",
        "redistributable": False,
        "istPlatzhalter": True,
        "format": "mp3",
        "sampleRate": SR,
        "voices": {},
        "hoeren": hoeren,
        "sprechen": sprechen,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true",
                    help="overwrite real audio that is already exported")
    args = ap.parse_args(argv)

    if not EXPORT.exists():
        print("No exported content. Run tools/export_web.py first.")
        return 1

    quellen = ROOT / "content" / "exams"
    geschrieben = 0
    for ordner in sorted(EXPORT.iterdir()):
        if not ordner.is_dir():
            continue
        manifest = ordner / "audio" / "manifest.json"
        if manifest.exists() and not args.force:
            vorhanden = json.loads(manifest.read_text(encoding="utf-8"))
            if not vorhanden.get("istPlatzhalter"):
                print(f"  {ordner.name}: real audio present, left alone")
                continue

        exam_pfad = quellen / ordner.name / "exam.json"
        if not exam_pfad.exists():
            continue
        exam = json.loads(exam_pfad.read_text(encoding="utf-8"))
        m = fixture_fuer(ordner.name, exam)
        print(f"  {ordner.name}: {len(m['hoeren'])} Hör-Platzhalter, "
              f"{len(m['sprechen'])} Sprechen-Platzhalter")
        geschrieben += 1

    print(f"\n{geschrieben} exam(s) given placeholder audio. Not exam material.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
