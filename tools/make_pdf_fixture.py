#!/usr/bin/env python3
"""Write placeholder PDFs so the print links can be tested without LaTeX.

    python tools/make_pdf_fixture.py

Building the real papers needs a TeX distribution — a few hundred megabytes of
apt packages that a pull request changing a button has no business installing.
But the tests that matter most here are not about typography: they check that
every advertised link resolves to a real PDF, and — the important one — that
the solution booklet is neither shown nor fetched while an exam is open. Those
hold regardless of what is printed on the page.

So this writes a one-page PDF saying what it is in place of each document, and
re-runs the export so the registry advertises them. Like the audio fixture,
it refuses to touch anything real: it writes only into the app's exported
content, which is gitignored, and it will not overwrite a genuine build.

See also tools/make_audio_fixture.py, which does the same for the listening
tracks and for the same reason.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPORT = ROOT / "apps" / "web" / "public" / "content"
GEBAUT = ROOT / "content" / "exams"

DOKUMENTE = ("kandidatenblaetter", "antwortbogen", "sprechen_karten", "loesungen")

# Anything a real build produces is far larger than this; the check below uses
# the threshold only to refuse to clobber something that is plainly not ours.
PLATZHALTER_MAX = 4096


_ASCII = str.maketrans({
    "ä": "ae", "ö": "oe", "ü": "ue", "Ä": "Ae", "Ö": "Oe", "Ü": "Ue", "ß": "ss",
    "—": "-", "–": "-", "„": '"', "“": '"', "”": '"', "’": "'", "·": "-", "…": "...",
})


def pdf_text(zeile: str) -> str:
    """Fold to ASCII and escape the three characters a PDF string reserves.

    Base-14 Helvetica has no umlauts without an encoding dictionary, so they
    are transliterated rather than dropped — a placeholder should still be
    readable. And an unescaped bracket in an exam title would end the string
    early and corrupt the file, which is a silly way to lose an afternoon.
    """
    gefaltet = zeile.translate(_ASCII).encode("ascii", "replace").decode("ascii")
    for zeichen in ("\\", "(", ")"):
        gefaltet = gefaltet.replace(zeichen, "\\" + zeichen)
    return gefaltet


def minimal_pdf(zeilen: list[str]) -> bytes:
    """A valid single-page PDF, assembled by hand.

    Hand-rolled rather than pulled from a library: this exists so the test
    environment needs *nothing* installed, and adding a PDF dependency to buy
    a 700-byte file would defeat the point. The structure is the minimum the
    specification allows — catalogue, page tree, one page, one font, one
    content stream — plus a correct xref table, because browsers and
    Playwright's `request.get` both check the header and will not be fobbed
    off with a text file named .pdf.
    """
    text = "\n".join(
        f"BT /F1 {14 if i == 0 else 10} Tf 56 {720 - i * 22} Td ({pdf_text(z)}) Tj ET"
        for i, z in enumerate(zeilen)
    )
    stream = text.encode("ascii")

    objekte = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream
        + b"\nendstream",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, koerper in enumerate(objekte, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + koerper + b"\nendobj\n"

    xref = len(out)
    out += f"xref\n0 {len(objekte) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objekte) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(out)


def echte_pdfs_vorhanden() -> list[str]:
    """Exam ids whose real PDFs have been built, so we leave them alone."""
    if not GEBAUT.exists():
        return []
    return [
        f.name for f in sorted(GEBAUT.iterdir())
        if (f / "pdf" / "kandidatenblaetter.pdf").exists()
    ]


def schreiben(exam_id: str, titel: str) -> int:
    ziel = EXPORT / exam_id / "pdf"
    ziel.mkdir(parents=True, exist_ok=True)

    geschrieben = 0
    for name in DOKUMENTE:
        datei = ziel / f"{name}.pdf"
        if datei.exists() and datei.stat().st_size > PLATZHALTER_MAX:
            print(f"  {exam_id}/{name}.pdf looks like a real build — left alone")
            continue
        datei.write_bytes(
            minimal_pdf([
                "PLATZHALTER - kein Pruefungsmaterial",
                "",
                f"Dokument: {name}",
                f"Pruefung: {titel}",
                "",
                "Diese Datei wurde von tools/make_pdf_fixture.py erzeugt,",
                "damit die Tests ohne LaTeX laufen koennen.",
                "Das echte Dokument entsteht mit: npm run content:pdf",
            ])
        )
        geschrieben += 1
    return geschrieben


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.parse_args(list(argv) if argv is not None else None)

    index = EXPORT / "index.json"
    if not index.exists():
        print("No exported content. Run tools/export_web.py first.")
        return 1

    echte = echte_pdfs_vorhanden()
    if echte:
        print(f"Real PDFs exist for {', '.join(echte)}; refusing to replace them.")
        return 0

    registry = json.loads(index.read_text(encoding="utf-8"))
    gesamt = 0
    for eintrag in registry["pruefungen"]:
        gesamt += schreiben(eintrag["id"], eintrag["titel"])
        # The app decides what to offer from these two lists, so a fixture that
        # writes files without updating them would be invisible to the UI.
        eintrag["pdfsVorAbgabe"] = [d for d in DOKUMENTE if d != "loesungen"]
        eintrag["pdfsNachAbgabe"] = ["loesungen"]

    index.write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{gesamt} placeholder PDF(s) written for "
          f"{len(registry['pruefungen'])} exam(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
