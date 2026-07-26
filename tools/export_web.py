#!/usr/bin/env python3
"""Split each exam into a public half and a keyed half for the web app.

    python tools/export_web.py

Writes into apps/web/public/content/:

    index.json                  the exam registry the start screen reads
    <id>/exam.public.json       texts, items and options — no answers
    <id>/exam.keys.json         answers, evidence, rationales, glossary, grammar
    <id>/audio/*                listening tracks and the partner turns
    <id>/pdf/*                  the printable papers, if they have been built
    lernhilfe.json              the cheat sheet

Why the split: the app must not ship the answer key in the bundle a candidate
can open before submitting. The public half contains nothing that gives an
answer away; the keyed half is fetched only once an attempt is closed. The
printable solution booklet is treated the same way — copied, but linked only
from the result screen.
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "exams"
LERNHILFE = ROOT / "content" / "lernhilfe"
TARGET = ROOT / "apps" / "web" / "public" / "content"

# Anything that reveals or justifies an answer, plus metadata the app does not
# need before submission. "kompetenz" gives nothing away, but the weak-spot
# report reads it from the keyed half anyway, so there is no reason to ship it.
GEHEIM = {
    "loesung", "beleg", "begruendung", "musterloesungen", "musterantwort",
    "kompetenz",
}

# Printable documents, split the same way the JSON is: what a candidate may
# have on the desk before the exam, and what only makes sense afterwards.
# loesungen.pdf is copied too — it is the offline twin of exam.keys.json and
# gets the same treatment: present at a URL, but linked only once an attempt
# is closed. The app enforces that; an end-to-end test asserts it.
PDF_VOR_ABGABE = ("kandidatenblaetter", "antwortbogen", "sprechen_karten")
PDF_NACH_ABGABE = ("loesungen",)


def strip_item(item: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in item.items() if k not in GEHEIM}


def public_half(exam: dict[str, Any]) -> dict[str, Any]:
    """The exam as a candidate may see it before submitting."""
    out: dict[str, Any] = {"meta": exam["meta"]}

    for modul in ("lesen", "hoeren"):
        teile = []
        for teil in exam[modul]["teile"]:
            copy = {k: v for k, v in teil.items() if k not in ("items", "beispiel", "skript")}
            copy["items"] = [strip_item(i) for i in teil["items"]]
            if teil.get("beispiel"):
                # The worked example keeps its answer: that is the point of it.
                copy["beispiel"] = teil["beispiel"]
            teile.append(copy)
        out[modul] = {"zeitMinuten": exam[modul]["zeitMinuten"], "teile": teile}

    out["schreiben"] = {
        "zeitMinuten": exam["schreiben"]["zeitMinuten"],
        "aufgaben": [{k: v for k, v in a.items() if k not in GEHEIM and k != "redemittel"}
                     for a in exam["schreiben"]["aufgaben"]],
    }

    sprechen_teile = []
    for teil in exam["sprechen"]["teile"]:
        copy = {k: v for k, v in teil.items() if k != "themen"}
        if teil.get("themen"):
            copy["themen"] = [{k: v for k, v in t.items()
                               if k not in GEHEIM and k != "redemittel"}
                              for t in teil["themen"]]
        sprechen_teile.append(copy)
    out["sprechen"] = {"vorbereitungMinuten": exam["sprechen"]["vorbereitungMinuten"],
                       "teile": sprechen_teile}
    return out


def keyed_half(exam: dict[str, Any]) -> dict[str, Any]:
    """Everything held back until the attempt is closed."""
    keys: dict[str, dict[str, Any]] = {}
    for modul in ("lesen", "hoeren"):
        for teil in exam[modul]["teile"]:
            for item in teil["items"]:
                keys[f"{modul}-{item['nr']}"] = {
                    "loesung": item["loesung"],
                    "beleg": item.get("beleg", ""),
                    "begruendung": item["begruendung"],
                    "kompetenz": item.get("kompetenz", ""),
                    "teil": teil["nummer"],
                }

    return {
        "meta": {"id": exam["meta"]["id"], "contentVersion": exam["meta"]["contentVersion"]},
        "keys": keys,
        "transkripte": [
            {"teil": t["nummer"], "wiederholungen": t["wiederholungen"],
             "zeilen": [{"rolle": z["rolle"], "text": z["text"],
                         "betont": bool(z.get("betont"))} for z in t["skript"]]}
            for t in exam["hoeren"]["teile"]
        ],
        "schreiben": [
            {"nummer": a["nummer"], "redemittel": a.get("redemittel", []),
             "musterloesungen": a["musterloesungen"]}
            for a in exam["schreiben"]["aufgaben"]
        ],
        "sprechen": [
            {"nummer": t["nummer"],
             "themen": [{"titel": th["titel"], "redemittel": th.get("redemittel", []),
                         "musterantwort": th.get("musterantwort", "")}
                        for th in t.get("themen") or []]}
            for t in exam["sprechen"]["teile"]
        ],
        "glossar": exam["glossar"],
        "redewendungen": exam.get("redewendungen", []),
        "grammatik": exam["grammatik"],
    }


def leak_check(public: dict[str, Any], exam: dict[str, Any]) -> list[str]:
    """Fail loudly if answer data survived into the public half.

    Cheap insurance against a schema change quietly re-exposing keys. The same
    rules run again in CI over the written files, via tools/check_no_leak.py.
    Worked examples are exempt: showing their answer is the point of them.
    """
    del exam
    problems: list[str] = []
    for modul in ("lesen", "hoeren"):
        for teil in public[modul]["teile"]:
            for item in teil["items"]:
                for key in GEHEIM:
                    if key in item:
                        problems.append(
                            f"{modul} Teil {teil['nummer']} item {item['nr']} "
                            f"still carries {key!r}"
                        )
    return problems


def copy_pdfs(exam_id: str, out_dir: Path) -> dict[str, bool]:
    """Copy whatever PDFs have been built so the app can offer them.

    They are optional: the PDFs need a LaTeX installation, and someone working
    on the app alone should not have to have one. When they are missing the app
    falls back to a link to the release download.
    """
    quelle = CONTENT / exam_id / "pdf"
    vorhanden: dict[str, bool] = {}
    if not quelle.exists():
        return vorhanden

    ziel = out_dir / "pdf"
    ziel.mkdir(exist_ok=True)
    for name in (*PDF_VOR_ABGABE, *PDF_NACH_ABGABE):
        datei = quelle / f"{name}.pdf"
        if datei.exists():
            shutil.copy2(datei, ziel / datei.name)
            vorhanden[name] = True
    return vorhanden


def export(exam_id: str, exam: dict[str, Any], with_audio: bool,
           with_pdf: bool) -> dict[str, Any]:
    out_dir = TARGET / exam_id
    out_dir.mkdir(parents=True, exist_ok=True)

    public = public_half(exam)
    problems = leak_check(public, exam)
    if problems:
        raise SystemExit("Answer data leaked into the public half:\n  "
                         + "\n  ".join(problems))

    (out_dir / "exam.public.json").write_text(
        json.dumps(public, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out_dir / "exam.keys.json").write_text(
        json.dumps(keyed_half(exam), ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    audio_src = CONTENT / exam_id / "audio"
    audio_files: list[str] = []
    if with_audio and audio_src.exists():
        audio_dst = out_dir / "audio"
        audio_dst.mkdir(exist_ok=True)
        for f in sorted(audio_src.iterdir()):
            if f.suffix in (".mp3", ".ogg", ".wav", ".json"):
                shutil.copy2(f, audio_dst / f.name)
                audio_files.append(f.name)

    pdfs = copy_pdfs(exam_id, out_dir) if with_pdf else {}

    manifest_path = audio_src / "manifest.json"
    audio_manifest = json.loads(manifest_path.read_text(encoding="utf-8")) \
        if manifest_path.exists() else None

    return {
        "id": exam_id,
        "titel": exam["meta"]["titel"],
        "variante": exam["meta"]["variante"],
        "niveau": exam["meta"]["niveau"],
        "contentVersion": exam["meta"]["contentVersion"],
        "themen": exam["meta"]["themen"],
        "hatAudio": bool(audio_manifest),
        "audioFormat": (audio_manifest or {}).get("format", "mp3"),
        "audioDauerSek": sum(t["dauerSek"] for t in (audio_manifest or {}).get("hoeren", [])),
        "dateien": len(audio_files),
        # Two lists, not one flag: the start screen may only offer the first.
        "pdfsVorAbgabe": [n for n in PDF_VOR_ABGABE if pdfs.get(n)],
        "pdfsNachAbgabe": [n for n in PDF_NACH_ABGABE if pdfs.get(n)],
    }


def export_lernhilfe() -> bool:
    """Copy the cheat sheet into the app as one file.

    No split is needed here — it belongs to no attempt and gives away no
    answer, so it stays readable before, during preparation and after.
    """
    quelle = LERNHILFE / "lernhilfe.json"
    if not quelle.exists():
        return False

    daten = json.loads(quelle.read_text(encoding="utf-8"))
    daten["wortschatz"] = json.loads(
        (LERNHILFE / "wortschatz.json").read_text(encoding="utf-8")
    )
    (TARGET / "lernhilfe.json").write_text(
        json.dumps(daten, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return True


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("exam", nargs="?")
    ap.add_argument("--no-audio", action="store_true",
                    help="skip copying audio (much faster while iterating on the app)")
    ap.add_argument("--no-pdf", action="store_true",
                    help="skip copying PDFs even if they have been built")
    args = ap.parse_args(list(argv) if argv is not None else None)

    # Exam titles and this summary contain German text and an arrow; a Windows
    # console defaulting to cp1252 would otherwise crash on the last line, long
    # after the files were written.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    if not CONTENT.exists():
        print("No content/exams directory.")
        return 1
    TARGET.mkdir(parents=True, exist_ok=True)

    registry = []
    for folder in sorted(CONTENT.iterdir()):
        if not folder.is_dir() or (args.exam and folder.name != args.exam):
            continue
        exam = json.loads((folder / "exam.json").read_text(encoding="utf-8"))
        entry = export(folder.name, exam, not args.no_audio, not args.no_pdf)
        registry.append(entry)
        n_pdf = len(entry["pdfsVorAbgabe"]) + len(entry["pdfsNachAbgabe"])
        print(f"  {entry['id']}  {entry['titel'][:44]:44} "
              f"{entry['audioDauerSek'] / 60:5.1f} min Audio, {entry['dateien']} Dateien, "
              f"{n_pdf} PDFs")

    if not args.exam:
        hat_lernhilfe = export_lernhilfe()
        (TARGET / "index.json").write_text(
            json.dumps({"pruefungen": registry, "hatLernhilfe": hat_lernhilfe},
                       ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8")
        print(f"\nRegistry: {len(registry)} Prüfung(en) → {TARGET / 'index.json'}")
        if hat_lernhilfe:
            print(f"Spickzettel → {TARGET / 'lernhilfe.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
