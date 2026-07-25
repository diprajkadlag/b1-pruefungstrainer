#!/usr/bin/env python3
"""Render an exam's PDFs from its exam.json.

    python tools/build_pdf.py                 # every exam
    python tools/build_pdf.py pruefung-01
    python tools/build_pdf.py --keep-tex      # leave the .tex for debugging

Four documents per exam, into content/exams/<id>/pdf/:

    kandidatenblaetter.pdf   Lesen + Hören + Schreiben, as the candidate sees it
    antwortbogen.pdf         answer sheet
    sprechen_karten.pdf      speaking cards and notes page
    loesungen.pdf            keys, transcripts, model answers, glossary, grammar

Templates use << >> for variables and <% %> for blocks, so LaTeX's own braces
pass through untouched.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from collections.abc import Iterable
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "exams"
TEMPLATES = Path(__file__).resolve().parent / "templates"

DOKUMENTE = ["kandidatenblaetter", "antwortbogen", "sprechen_karten", "loesungen"]

TEIL_NAMEN = {
    ("lesen", 1): "Blog / persönlicher Bericht",
    ("lesen", 2): "Zeitungsartikel",
    ("lesen", 3): "Anzeigen zuordnen",
    ("lesen", 4): "Meinungen im Forum",
    ("lesen", 5): "Benutzungsordnung",
    ("hoeren", 1): "Fünf kurze Texte",
    ("hoeren", 2): "Vortrag / Führung",
    ("hoeren", 3): "Alltagsgespräch",
    ("hoeren", 4): "Radiodiskussion",
}

AUFGABEN_NAMEN = {
    "email_informell": "Informelle E-Mail",
    "forumsbeitrag": "Forumsbeitrag",
    "email_halbformell": "Halbformelle E-Mail",
}

KURZ = {
    "richtig": "richtig", "falsch": "falsch",
    "ja": "ja (dafür)", "nein": "nein (dagegen)",
}


# ---------------------------------------------------------------------------
# LaTeX escaping
# ---------------------------------------------------------------------------

_TEX_ESCAPES = {
    "\\": r"\textbackslash{}",
    "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#",
    "_": r"\_", "{": r"\{", "}": r"\}",
    "~": r"\textasciitilde{}", "^": r"\textasciicircum{}",
}

# Symbols that read perfectly in the web app but that pdflatex's T1 fonts do
# not carry. Content is authored for the app first, so translate rather than
# forbid: rationales use ✗ to flag a wrong option, and that is worth keeping.
_UNICODE_TO_TEX = {
    "✗": r"\ensuremath{\times}",
    "✓": r"\ensuremath{\checkmark}",
    "→": r"\ensuremath{\rightarrow}",
    "←": r"\ensuremath{\leftarrow}",
    "≥": r"\ensuremath{\geq}", "≤": r"\ensuremath{\leq}",
    "×": r"\ensuremath{\times}",
    "…": r"\dots{}",
    " ": "~",       # non-breaking space
    " ": "~",       # narrow no-break space
    "‑": "-",       # non-breaking hyphen
}


def tex(value: Any) -> str:
    """Escape a string for LaTeX. Applied to every piece of exam content."""
    if value is None:
        return ""
    out = []
    for ch in str(value):
        if ch in _UNICODE_TO_TEX:
            out.append(_UNICODE_TO_TEX[ch])
        else:
            out.append(_TEX_ESCAPES.get(ch, ch))
    return "".join(out)


def texpar(value: Any) -> str:
    """Escape, then turn blank lines into real paragraph breaks."""
    escaped = tex(value)
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", escaped) if p.strip()]
    # A single newline inside a paragraph is not meaningful in LaTeX; a double
    # one is. Regulations use single newlines as hard breaks, so keep those.
    return "\n\n".join(p.replace("\n", r"\\" + "\n") for p in paragraphs)


def kuerzen(value: str, limit: int = 90) -> str:
    """Trim a quoted example so it fits a narrow table column."""
    text = str(value).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut + " …"


def folientext(value: str) -> str:
    """Strip the 'Folie N — ' prefix; the box already carries the label."""
    return re.sub(r"^Folie\s*\d+\s*[—–-]\s*", "", str(value)).strip()


def zeilen(woerter: int) -> int:
    """Ruled lines to print for a target word count (~9 words per line)."""
    return max(6, round(int(woerter) / 9) + 3)


def kurz(loesung: str) -> str:
    return tex(KURZ.get(loesung, loesung))


def teilname(teil: dict[str, Any]) -> str:
    modul = "hoeren" if "skript" in teil else "lesen"
    return TEIL_NAMEN.get((modul, teil["nummer"]), "")


def aufgabenname(aufgabe: dict[str, Any]) -> str:
    return AUFGABEN_NAMEN.get(aufgabe["typ"], aufgabe["typ"])


def alle_items(modul: dict[str, Any]) -> list[dict[str, Any]]:
    return [i for teil in modul["teile"] for i in teil["items"]]


def itemmacro(item: dict[str, Any]) -> str:
    """Emit the right LaTeX item macro for this item's type."""
    nr = "Bsp." if item["nr"] == 0 else str(item["nr"])
    typ = item["typ"]

    if typ in ("multiple_choice", "zuordnung_person"):
        o = item["optionen"]
        return (f"\\itemmc{{{nr}}}{{{tex(item['frage'])}}}"
                f"{{{tex(o['a'])}}}{{{tex(o['b'])}}}{{{tex(o['c'])}}}")
    if typ == "richtig_falsch":
        return f"\\itemrf{{{nr}}}{{{tex(item['frage'])}}}"
    if typ == "ja_nein":
        return f"\\itemja{{{nr}}}{{{tex(item['frage'])}}}"
    if typ == "zuordnung_anzeigen":
        return f"\\itemzuordnung{{{nr}}}{{{tex(item['frage'])}}}"
    raise ValueError(f"no LaTeX macro for item type {typ!r}")


def glossarformen(g: dict[str, Any]) -> str:
    """Render a glossary headword with every form a learner needs.

    Nouns get article and plural, verbs get all principal parts and any
    governed preposition with its case. That detail is the whole reason the
    glossary is worth printing.
    """
    art = g.get("artikel")
    head = f"{art} {g['lemma'].split(' ', 1)[-1]}" if art and not g["lemma"].startswith(art) \
        else g["lemma"]
    lines = [f"\\textbf{{{tex(head)}}}"]

    if g["wortart"] == "nomen" and g.get("plural"):
        lines.append(f"{{\\scriptsize Pl.: {tex(g['plural'])}}}")

    if g["wortart"] == "verb" and g.get("stammformen"):
        s = g["stammformen"]
        forms = f"{s['praesens_3sg']} · {s['praeteritum']} · {s['perfekt']}"
        marks = []
        if s.get("unregelmaessig"):
            marks.append("unregelmäßig")
        if g.get("trennbar"):
            marks.append("trennbar")
        lines.append(f"{{\\scriptsize {tex(forms)}}}")
        if marks:
            lines.append(f"{{\\scriptsize\\color{{b1mute}}{tex(', '.join(marks))}}}")

    if g.get("praeposition"):
        p = g["praeposition"]
        lines.append(f"{{\\scriptsize\\color{{b1mark}}+ {tex(p['wort'])} "
                     f"({tex(p['kasus'])})}}")

    return "\\newline ".join(lines)


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def environment():
    import jinja2

    env = jinja2.Environment(
        loader=jinja2.FileSystemLoader(str(TEMPLATES)),
        block_start_string="<%", block_end_string="%>",
        variable_start_string="<<", variable_end_string=">>",
        comment_start_string="<#", comment_end_string="#>",
        trim_blocks=True, lstrip_blocks=True,
        keep_trailing_newline=True,
        undefined=jinja2.StrictUndefined,
        autoescape=False,
    )
    env.filters.update(
        tex=tex, texpar=texpar, kuerzen=kuerzen, folientext=folientext,
        zeilen=zeilen, kurz=kurz, teilname=teilname, aufgabenname=aufgabenname,
        alle_items=alle_items, itemmacro=itemmacro, glossarformen=glossarformen,
    )
    return env


def latex_error(log: str) -> str:
    """Pull the first real error out of a LaTeX log, which is mostly noise."""
    lines = log.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("!"):
            return "\n".join(lines[i:i + 8])
    return "\n".join(lines[-25:])


def build_document(name: str, exam: dict[str, Any], out_dir: Path,
                   keep_tex: bool) -> tuple[Path, int]:
    env = environment()
    source = env.get_template(f"{name}.tex.j2").render(**exam)

    work = Path(tempfile.mkdtemp(prefix=f"b1-{name}-"))
    try:
        (work / f"{name}.tex").write_text(source, encoding="utf-8")
        shutil.copy(TEMPLATES / "b1pruefung.sty", work / "b1pruefung.sty")

        if keep_tex:
            out_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy(work / f"{name}.tex", out_dir / f"{name}.tex")

        # Twice: longtable and the layout boxes need a second pass to settle.
        stdout = ""
        for run in range(2):
            proc = subprocess.run(
                ["pdflatex", "-interaction=nonstopmode", "-halt-on-error",
                 "-file-line-error", f"{name}.tex"],
                cwd=work, capture_output=True, text=True, encoding="utf-8",
                errors="replace",
            )
            stdout = proc.stdout
            if proc.returncode != 0:
                log = (work / f"{name}.log")
                detail = latex_error(log.read_text(encoding="utf-8", errors="replace")
                                     if log.exists() else proc.stdout)
                raise RuntimeError(
                    f"pdflatex failed on {name} (pass {run + 1}):\n{detail}\n"
                    f"Re-run with --keep-tex and inspect {out_dir / (name + '.tex')}"
                )

        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / f"{name}.pdf"
        shutil.copy(work / f"{name}.pdf", target)
        return target, pages_from_log(stdout)
    finally:
        if not keep_tex:
            shutil.rmtree(work, ignore_errors=True)
        else:
            print(f"      tex kept in {work}")


def pages_from_log(stdout: str) -> int:
    """Page count as pdflatex reports it.

    Counting /Type /Page in the file does not work: hyperref enables object
    streams, so the page objects are compressed and never appear as plain text.
    """
    match = re.search(r"Output written on .*?\((\d+) pages?", stdout)
    return int(match.group(1)) if match else 0


def build_exam(exam_id: str, keep_tex: bool, only: str | None) -> bool:
    path = CONTENT / exam_id / "exam.json"
    exam = json.loads(path.read_text(encoding="utf-8"))
    out_dir = CONTENT / exam_id / "pdf"

    print(f"\n{exam_id}")
    ok = True
    for name in DOKUMENTE:
        if only and name != only:
            continue
        try:
            pdf, n_pages = build_document(name, exam, out_dir, keep_tex)
            print(f"    {name:22} {n_pages:3d} Seiten  "
                  f"{pdf.stat().st_size / 1024:6.0f} KB")
        except Exception as exc:  # noqa: BLE001 — report and continue
            ok = False
            print(f"    {name:22} FAILED\n{exc}")
    return ok


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("exam", nargs="?", help="exam id, e.g. pruefung-01")
    ap.add_argument("--keep-tex", action="store_true",
                    help="write the generated .tex next to the PDF")
    ap.add_argument("--only", choices=DOKUMENTE, help="build a single document")
    args = ap.parse_args(list(argv) if argv is not None else None)

    if shutil.which("pdflatex") is None:
        print("pdflatex not found. Install TeX Live or MiKTeX and retry.")
        return 1
    if not CONTENT.exists():
        print("No content/exams directory.")
        return 1

    folders = [f for f in sorted(CONTENT.iterdir())
               if f.is_dir() and (not args.exam or f.name == args.exam)]
    if not folders:
        print(f"No exam matching {args.exam!r}.")
        return 1

    ok = all(build_exam(f.name, args.keep_tex, args.only) for f in folders)
    print("\nDone." if ok else "\nSome documents failed.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
