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

Plus one document per level that belongs to no single exam, into
content/lernhilfe/pdf/ (B1) and content/lernhilfe/b2/pdf/ (B2):

    spickzettel.pdf          strategy, Redemittel, grammar tables, core vocabulary

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
LERNHILFE = ROOT / "content" / "lernhilfe"
SPRECHEN = ROOT / "content" / "sprechen"
TEMPLATES = Path(__file__).resolve().parent / "templates"

DOKUMENTE = ["kandidatenblaetter", "antwortbogen", "sprechen_karten", "loesungen"]

# Levels that can carry their own cheat sheet. Ones without a
# content/lernhilfe/<stufe>/ directory are skipped silently.
STUFEN = ("A1", "A2", "B1", "B2")

# What each part actually is, per level. Printed next to the part number so a
# candidate leafing through the paper knows what is coming. The two levels
# share no single line here, which is why this is keyed by level.
TEIL_NAMEN = {
    "A1": {
        ("lesen", 1): "Zwei kurze Mitteilungen",
        ("lesen", 2): "Wo finden Sie das?",
        ("lesen", 3): "Schilder und Aushänge",
        ("hoeren", 1): "Sechs kurze Texte",
        ("hoeren", 2): "Vier Durchsagen",
        ("hoeren", 3): "Fünf Ansagen am Telefon",
    },
    "A2": {
        ("lesen", 1): "Kurzer Artikel",
        ("lesen", 2): "Tafel oder Programm",
        ("lesen", 3): "Private E-Mail",
        ("lesen", 4): "Kleinanzeigen zuordnen",
        ("hoeren", 1): "Fünf kurze Texte",
        ("hoeren", 2): "Ein Gespräch, neun Stichwörter",
        ("hoeren", 3): "Fünf kurze Gespräche",
        ("hoeren", 4): "Radiointerview",
    },
    "B1": {
        ("lesen", 1): "Blog / persönlicher Bericht",
        ("lesen", 2): "Zeitungsartikel",
        ("lesen", 3): "Anzeigen zuordnen",
        ("lesen", 4): "Meinungen im Forum",
        ("lesen", 5): "Benutzungsordnung",
        ("hoeren", 1): "Fünf kurze Texte",
        ("hoeren", 2): "Vortrag / Führung",
        ("hoeren", 3): "Alltagsgespräch",
        ("hoeren", 4): "Radiodiskussion",
    },
    "B2": {
        ("lesen", 1): "Forumsbeiträge zuordnen",
        ("lesen", 2): "Sätze in Lücken einsetzen",
        ("lesen", 3): "Zeitungsartikel",
        ("lesen", 4): "Meinungen zu Überschriften",
        ("lesen", 5): "Ordnung und Inhaltsverzeichnis",
        ("hoeren", 1): "Fünf kurze Texte",
        ("hoeren", 2): "Radiointerview",
        ("hoeren", 3): "Gespräch mit mehreren Personen",
        ("hoeren", 4): "Kurzvortrag",
    },
}

# Points per module on the certificate. A1 records 15 raw points per part and
# converts only at the end; A2 caps each part at 25; B1 and B2 award 100 each.
# Mirrors BEWERTUNG in packages/core/src/scoring.ts and FORMATE below.
MODULPUNKTE = {"A1": 15, "A2": 25, "B1": 100, "B2": 100}

# How each level is marked, in the words the solution booklet prints. This used
# to be three paragraphs of B1 prose hard-coded in loesungen.tex.j2, which meant
# every A2 booklet told its reader that the modules were worth 100 points each.
# The text differs per level far more than the numbers do, so it lives here
# whole rather than as a pile of template branches.
BEWERTUNGSTEXT = {
    "A1": {
        "rezeptiv": r"Hören und Lesen: je 15 Aufgaben, jede Aufgabe 1 Punkt. Auch "
                    r"Schreiben und Sprechen zählen je 15 Punkte, zusammen also 60. "
                    r"Für das Gesamtergebnis wird jeder Punkt mit $1{,}66$ "
                    r"multipliziert; das ergibt 100.",
        "grenze": r"Bestanden ist die \emph{ganze} Prüfung ab \textbf{60 von 100 "
                  r"Punkten}. Weitere Bedingungen gibt es nicht.",
        "schreiben": r"Teil 1 ist ein Formular: fünf Felder, je 1 Punkt. Teil 2 wird "
                     r"mit 10 Punkten bewertet. Zusammen 15 Punkte.",
        "sprechen": r"Teil 1 (3): sich vorstellen. Teil 2 (6): nach Informationen "
                    r"fragen und antworten. Teil 3 (6): bitten und darauf reagieren. "
                    r"Zusammen 15 Punkte.",
    },
    "A2": {
        "rezeptiv": r"Lesen und Hören: je 20 Aufgaben, jede Aufgabe 1 Punkt. Die "
                    r"Rohpunkte werden mit $1{,}25$ multipliziert; jeder Prüfungsteil "
                    r"zählt damit höchstens 25 Punkte, zusammen 100.",
        "grenze": r"A2 ist \emph{eine} Prüfung: bestanden ab \textbf{60 von 100 "
                  r"Punkten}, davon mindestens 45 von 75 in Lesen, Hören und Schreiben "
                  r"zusammen und mindestens 15 von 25 im Sprechen.",
        "schreiben": r"Aufgabe 1 (SMS) und Aufgabe 2 (E-Mail): je 5 Punkte für die "
                     r"Erfüllung der Aufgabe und 5 für die Sprache, zusammen 20 "
                     r"Messpunkte. Wird die Erfüllung mit E bewertet, ist die ganze "
                     r"Aufgabe 0 Punkte.",
        "sprechen": r"Teil 1 (4): Fragen zur Person. Teil 2 (8): von sich erzählen. "
                    r"Teil 3 (8): gemeinsam planen. Aussprache über alle Teile: 5. "
                    r"Zusammen 25 Punkte.",
    },
    "B1": {
        "rezeptiv": r"Lesen und Hören: je 30 Aufgaben, jede Aufgabe 1 Punkt. Die "
                    r"Rohpunkte werden auf 100 Punkte umgerechnet (Punkte $=$ richtige "
                    r"Aufgaben $\times\ 10/3$).",
        "grenze": r"Bestanden ab \textbf{60 Punkten} pro Modul; jedes Modul wird "
                  r"einzeln bestanden.",
        "schreiben": r"Aufgaben 1 und 2: je 10 Punkte für Erfüllung, Kohärenz, "
                     r"Wortschatz und Strukturen (40 Punkte). Aufgabe 3: 4 Punkte für "
                     r"Erfüllung, 4 für Kohärenz, 6 für Wortschatz, 6 für Strukturen "
                     r"(20 Punkte). Zusammen 100 Punkte.",
        "sprechen": r"Teil 1 (28): Erfüllung 8, Interaktion 4, Wortschatz 8, "
                    r"Strukturen 8. Teil 2 (40): Erfüllung 12, Interaktion 4, "
                    r"Wortschatz 12, Strukturen 12. Teil 3 (16): Erfüllung 16. "
                    r"Aussprache über alle Teile: 16. Zusammen 100 Punkte.",
    },
    "B2": {
        "rezeptiv": r"Lesen und Hören: je 30 Aufgaben, jede Aufgabe 1 Punkt. Die "
                    r"Rohpunkte werden auf 100 Punkte umgerechnet (Punkte $=$ richtige "
                    r"Aufgaben $\times\ 10/3$).",
        "grenze": r"Bestanden ab \textbf{60 Punkten} pro Modul; jedes Modul wird "
                  r"einzeln bestanden.",
        "schreiben": r"Aufgabe 1 (Forumsbeitrag): 60 Punkte. Aufgabe 2 (formelle "
                     r"Nachricht): 40 Punkte. Bewertet werden Erfüllung, Kohärenz, "
                     r"Wortschatz und Strukturen. Zusammen 100 Punkte.",
        "sprechen": r"Teil 1 (50): Vortrag mit anschließenden Fragen. Teil 2 (50): "
                    r"Debatte. Die Aussprache wird innerhalb der beiden Teile "
                    r"bewertet, nicht getrennt. Zusammen 100 Punkte.",
    },
}

AUFGABEN_NAMEN = {
    "formular": "Formular ausfüllen",
    "kurzmitteilung": "Kurze Mitteilung",
    "sms": "Kurznachricht (SMS)",
    "email_informell": "Informelle E-Mail",
    "forumsbeitrag": "Forumsbeitrag",
    "email_halbformell": "Halbformelle E-Mail",
    "nachricht_formell": "Formelle Nachricht",
}

# How one item is answered on the answer sheet. The sheet is built from this
# rather than from hard-coded number ranges, so it follows whatever the paper
# actually contains.
BOGEN_ART = {
    "richtig_falsch": "rf",
    "ja_nein": "ja",
    "multiple_choice": "abc",
    # A1 Lesen Teil 2 offers two places, so the answer sheet needs two boxes,
    # not three. Printing three would invite an answer that cannot be right.
    "zwei_optionen": "ab",
    "zuordnung_anzeigen": "kasten",
    "zuordnung_buchstabe": "kasten",
}

# Label above the block, and the macro that draws one line of boxes. Choosing
# the macro here rather than branching inside LaTeX keeps the template a loop.
BOGEN_LABEL = {
    "rf": ("richtig / falsch", "\\rfpaar"),
    "ja": ("dafür / dagegen", "\\jnpaar"),
    "ab": ("a / b", "\\abzwei"),
    "abc": ("a / b / c", "\\abcdrei"),
    "abcd": ("a / b / c / d", "\\abcvier"),
    "kasten": ("Buchstabe eintragen", "\\kastenfeld"),
}

GAP = re.compile(r"\[(\d{1,2})\]")

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
    "≠": r"\ensuremath{\neq}",
    "×": r"\ensuremath{\times}",
    "▲": r"\ensuremath{\blacktriangle}",
    "·": r"\textperiodcentered{}",
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


def betont(value: Any) -> str:
    """Escape, then turn **markers** into bold.

    The cheat sheet marks the one word each row is actually about — the changed
    vowel, the case that governs, the ending that gives it away. In a dense
    grammar table that mark carries as much information as the row itself, so
    the content authors it inline rather than splitting every table into a
    "form" and a "what to notice" column.
    """
    return re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", tex(value))


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


def teilname(teil: dict[str, Any], stufe: str = "B1") -> str:
    modul = "hoeren" if "skript" in teil else "lesen"
    return TEIL_NAMEN.get(stufe, {}).get((modul, teil["nummer"]), "")


def kursstufe(meta: dict[str, Any]) -> str:
    """The course stage a paper is pitched at, e.g. "B2.1".

    Language schools split each CEFR level into two teaching stages and
    learners ask for papers in those terms. The *exam* has no such split: a
    Zertifikat B2 is one certificate with four modules, sat together or one at
    a time. So this is a study label; the cover prints it as one.

    Mirrors kursstufe() in packages/core/src/stufen.ts.
    """
    erste = meta.get("niveau") == "mittel-leicht"
    return f"{meta['stufe']}.{1 if erste else 2}"


def luecken(value: Any) -> str:
    """Escape a text and turn its [10] gap markers into printed blanks."""
    return GAP.sub(lambda m: f"\\luecke{{{m.group(1)}}}", texpar(value))


def bogen_art(item: dict[str, Any]) -> str:
    """Which set of boxes this item needs on the answer sheet."""
    if item["typ"] == "zuordnung_person":
        return "abcd" if (item.get("optionen") or {}).get("d") else "abc"
    return BOGEN_ART.get(item["typ"], "abc")


def bogenteile(modul: dict[str, Any]) -> list[dict[str, Any]]:
    """One block per part, with the answer format each item needs.

    Replaces what used to be hard-coded number ranges in the template. B1 and
    B2 number their parts identically and answer them completely differently,
    so the sheet has to be derived from the items rather than described twice.
    """
    out = []
    for teil in modul["teile"]:
        zeilen = [{"nr": i["nr"], "makro": BOGEN_LABEL[bogen_art(i)][1]}
                  for i in teil["items"]]
        arten = sorted({bogen_art(i) for i in teil["items"]})
        label = " und ".join(BOGEN_LABEL[a][0] for a in arten)
        out.append({"nummer": teil["nummer"], "label": label, "zeilen": zeilen})
    return out


def bogenspalten(modul: dict[str, Any]) -> list[list[dict[str, Any]]]:
    """Split the parts into two roughly equal columns, keeping parts whole."""
    teile = bogenteile(modul)
    gesamt = sum(len(t["zeilen"]) for t in teile)
    links: list[dict[str, Any]] = []
    laufend = 0
    for teil in teile:
        # Move on to the right column once the left one holds about half the
        # items; a part is never split across the fold.
        if laufend and laufend + len(teil["zeilen"]) > gesamt / 2 + 1:
            break
        links.append(teil)
        laufend += len(teil["zeilen"])
    return [links, teile[len(links):]]


def aufgabenname(aufgabe: dict[str, Any]) -> str:
    return AUFGABEN_NAMEN.get(aufgabe["typ"], aufgabe["typ"])


def alle_items(modul: dict[str, Any]) -> list[dict[str, Any]]:
    return [i for teil in modul["teile"] for i in teil["items"]]


def itemmacro(item: dict[str, Any]) -> str:
    """Emit the right LaTeX item macro for this item's type."""
    nr = "Bsp." if item["nr"] == 0 else str(item["nr"])
    typ = item["typ"]

    if typ == "zwei_optionen":
        o = item["optionen"]
        return (f"\\itemzwei{{{nr}}}{{{tex(item['frage'])}}}"
                f"{{{tex(o['a'])}}}{{{tex(o['b'])}}}")
    if typ in ("multiple_choice", "zuordnung_person"):
        o = item["optionen"]
        gemeinsam = (f"{{{nr}}}{{{tex(item['frage'])}}}"
                     f"{{{tex(o['a'])}}}{{{tex(o['b'])}}}{{{tex(o['c'])}}}")
        # Four options only where the paper offers four — B2 Lesen Teil 1.
        if o.get("d"):
            return f"\\itemmcvier{gemeinsam}{{{tex(o['d'])}}}"
        return f"\\itemmc{gemeinsam}"
    if typ == "richtig_falsch":
        return f"\\itemrf{{{nr}}}{{{tex(item['frage'])}}}"
    if typ == "ja_nein":
        return f"\\itemja{{{nr}}}{{{tex(item['frage'])}}}"
    if typ in ("zuordnung_anzeigen", "zuordnung_buchstabe"):
        # Both answer with a single letter written into a box.
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
            lines.append(f"{{\\scriptsize\\color{{pruefmute}}{tex(', '.join(marks))}}}")

    if g.get("praeposition"):
        p = g["praeposition"]
        lines.append(f"{{\\scriptsize\\color{{pruefmark}}+ {tex(p['wort'])} "
                     f"({tex(p['kasus'])})}}")

    return "\\newline ".join(lines)


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


def environment(stufe: str = "B1"):
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
    # What a module is worth, per level. The printed header used to say
    # "30 Aufgaben - 100 Punkte" on every paper, which is right at B1 and B2
    # and wrong at A1 and A2 — on the candidate's own sheet.
    env.globals["stufe"] = stufe
    env.globals["modulpunkte"] = MODULPUNKTE.get(stufe, 100)
    env.globals["bewertung"] = BEWERTUNGSTEXT.get(stufe, BEWERTUNGSTEXT["B1"])

    env.filters.update(
        tex=tex, texpar=texpar, betont=betont, kuerzen=kuerzen,
        folientext=folientext, zeilen=zeilen, kurz=kurz,
        # The part names differ entirely between levels, so the filter is bound
        # to the level of the paper being rendered rather than taking it as an
        # argument at every one of its call sites.
        teilname=lambda teil: teilname(teil, stufe),
        aufgabenname=aufgabenname, alle_items=alle_items, itemmacro=itemmacro,
        glossarformen=glossarformen, luecken=luecken, bogenspalten=bogenspalten,
        kursstufe=kursstufe,
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
    env = environment(exam.get("meta", {}).get("stufe", "B1"))
    source = env.get_template(f"{name}.tex.j2").render(**exam)

    work = Path(tempfile.mkdtemp(prefix=f"pruefung-{name}-"))
    try:
        (work / f"{name}.tex").write_text(source, encoding="utf-8")
        shutil.copy(TEMPLATES / "pruefung.sty", work / "pruefung.sty")

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


def build_sprechtraining(keep_tex: bool, stufe: str = "B1") -> bool:
    """The speaking trainer: one book of tasks with answers, per level.

    Separate from the exam documents because it is not a paper. Nothing here is
    sat under time in one sitting; it is worked through over weeks, and the
    answers belong in the same file as the tasks rather than behind the
    submission gate an exam has.
    """
    quelle = SPRECHEN / f"{stufe.lower()}.json"
    if not quelle.exists():
        return True

    daten = json.loads(quelle.read_text(encoding="utf-8"))
    ziel = SPRECHEN / "pdf"
    print(f"\nsprechtraining {stufe}")
    try:
        pdf, n_pages = build_document("sprechtraining", daten, ziel, keep_tex)
        print(f"    {'sprechtraining':22} {n_pages:3d} Seiten  "
              f"{pdf.stat().st_size / 1024:6.0f} kB")
        return True
    except Exception as exc:  # noqa: BLE001 - reported, not swallowed
        print(f"    {'sprechtraining':22} FAILED\n{exc}")
        return False


def lernhilfe_ordner(stufe: str) -> Path:
    """Where a level's cheat sheet lives. B1's stayed at the top of the tree."""
    return LERNHILFE if stufe == "B1" else LERNHILFE / stufe.lower()


def build_lernhilfe(keep_tex: bool, stufe: str = "B1") -> bool:
    """Build one level's cheat sheet.

    It sits outside the per-exam loop on purpose: it belongs to no single paper
    and is what the student takes to the cafe the evening before, so it is
    built once per level rather than once per paper.
    """
    ordner = lernhilfe_ordner(stufe)
    if not (ordner / "lernhilfe.json").exists():
        return True

    daten = json.loads((ordner / "lernhilfe.json").read_text(encoding="utf-8"))
    daten["wortschatz"] = json.loads(
        (ordner / "wortschatz.json").read_text(encoding="utf-8")
    )
    # The template prints the level on the cover, and the shipped B1 sheet
    # predates the field, so supply it rather than requiring it in the content.
    daten.setdefault("stufe", stufe)

    print(f"\nlernhilfe {stufe}")
    try:
        pdf, n_pages = build_document("spickzettel", daten, ordner / "pdf", keep_tex)
        print(f"    {'spickzettel':22} {n_pages:3d} Seiten  "
              f"{pdf.stat().st_size / 1024:6.0f} KB")
        return True
    except Exception as exc:  # noqa: BLE001 — report and continue
        print(f"    {'spickzettel':22} FAILED\n{exc}")
        return False


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("exam", nargs="?", help="exam id, e.g. pruefung-01")
    ap.add_argument("--keep-tex", action="store_true",
                    help="write the generated .tex next to the PDF")
    ap.add_argument("--only", choices=[*DOKUMENTE, "spickzettel", "sprechtraining"],
                    help="build a single document")
    args = ap.parse_args(list(argv) if argv is not None else None)

    # A LaTeX error quotes the offending source line back at us, so the failure
    # path is exactly where non-cp1252 characters turn up — and a console that
    # cannot print the error is worse than the error.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    if shutil.which("pdflatex") is None:
        print("pdflatex not found. Install TeX Live or MiKTeX and retry.")
        return 1
    if not CONTENT.exists():
        print("No content/exams directory.")
        return 1

    if args.only == "sprechtraining":
        return 0 if build_sprechtraining(args.keep_tex) else 1

    if args.only == "spickzettel":
        ok = all(build_lernhilfe(args.keep_tex, s) for s in STUFEN)
        print("\nDone." if ok else "\nSome documents failed.")
        return 0 if ok else 1

    folders = [f for f in sorted(CONTENT.iterdir())
               if f.is_dir() and (not args.exam or f.name == args.exam)]
    if not folders:
        print(f"No exam matching {args.exam!r}.")
        return 1

    # all() short-circuits, and a failed exam must not stop the rest.
    results = [build_exam(f.name, args.keep_tex, args.only) for f in folders]
    if not args.exam and not args.only:
        results.extend(build_lernhilfe(args.keep_tex, s) for s in STUFEN)

    ok = all(results)
    print("\nDone." if ok else "\nSome documents failed.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
