"""Tests for the content pipeline.

Run with `pytest tools/`. These cover the parts where a silent mistake would
be expensive: the glossary matcher (a false negative blocks a valid exam, a
false positive lets a bogus entry through), the LaTeX escaper (a missed
character breaks the build), and the audio DSP (a wrong sample rate makes
every voice sound comical).
"""

from __future__ import annotations

import json
import pathlib
import re

import audio_dsp as dsp
import make_pdf_fixture
import new_exam
import numpy as np
import pytest
import validate
from build_pdf import betont, folientext, tex, texpar, zeilen
from validate import lemma_variants, normalise

# --------------------------------------------------------------------------
# Glossary matching
# --------------------------------------------------------------------------


def nomen(lemma: str, **kw) -> dict:
    return {"lemma": lemma, "wortart": "nomen", **kw}


def verb(lemma: str, **kw) -> dict:
    return {"lemma": lemma, "wortart": "verb", **kw}


def trifft(entry: dict, satz: str) -> bool:
    """Would the validator accept this lemma as occurring in this sentence?"""
    return any(v in normalise(satz) for v in lemma_variants(entry))


class TestLemmaVariants:
    def test_matches_the_citation_form(self):
        assert trifft(nomen("die Gebühr", plural="die Gebühren"), "eine Gebühr von 50 Cent")

    def test_strips_the_article_from_the_headword(self):
        assert trifft(nomen("der Vorort", plural="die Vororte"), "Ich schaue in den Vororten.")

    def test_matches_a_participle_via_the_principal_parts(self):
        eintrag = verb(
            "mieten",
            stammformen={"praesens_3sg": "mietet", "praeteritum": "mietete",
                         "perfekt": "hat gemietet"},
        )
        assert trifft(eintrag, "habe ich ein Haus gemietet")

    def test_matches_a_separable_verb_left_whole_in_a_subclause(self):
        # "…dass die Firma ankündigte" keeps the prefix attached.
        eintrag = verb(
            "ankündigen", trennbar=True,
            stammformen={"praesens_3sg": "kündigt an", "praeteritum": "kündigte an",
                         "perfekt": "hat angekündigt"},
        )
        assert trifft(eintrag, "Als meine Firma ankündigte, dass …")

    def test_matches_a_separable_verb_split_in_a_main_clause(self):
        # The regression this rule exists for: "löst sich der Nebel auf" shares
        # no contiguous substring with "auflösen".
        eintrag = verb(
            "sich auflösen", trennbar=True,
            stammformen={"praesens_3sg": "löst sich auf", "praeteritum": "löste sich auf",
                         "perfekt": "hat sich aufgelöst"},
        )
        assert trifft(eintrag, "Bis zum Mittag löst sich der Nebel auf.")

    def test_ignores_dictionary_placeholders_in_the_headword(self):
        eintrag = verb(
            "sich etwas abschauen", trennbar=True,
            stammformen={"praesens_3sg": "schaut sich ab", "praeteritum": "schaute sich ab",
                         "perfekt": "hat sich abgeschaut"},
        )
        assert trifft(eintrag, "Andere Betriebe sollten sich das ruhig abschauen.")

    def test_does_not_match_an_unrelated_word(self):
        assert not trifft(nomen("die Ausrüstung", plural="die Ausrüstungen"),
                          "Der Zug fährt von Gleis sieben.")

    def test_matching_is_case_insensitive(self):
        assert trifft(verb("streichen",
                           stammformen={"praesens_3sg": "streicht", "praeteritum": "strich",
                                        "perfekt": "hat gestrichen"}),
                      "hilfst du mir beim Streichen")


class TestNormalise:
    def test_collapses_whitespace_and_case(self):
        assert normalise("  Der   GARTEN\nist gut ") == "der garten ist gut"

    def test_unifies_the_dashes_and_quotes_editors_produce(self):
        assert normalise("„Test“ – ok") == normalise('"Test" - ok')

    def test_keeps_umlauts_because_they_change_meaning(self):
        assert normalise("schön") != normalise("schon")

    def test_folds_eszett_to_ss(self):
        # str.casefold() maps ß to ss. That is fine and in fact useful here:
        # both the glossary lemma and the paper's prose go through the same
        # function, so they still match, and the Swiss spelling "Strasse"
        # matches "Straße" too.
        assert normalise("Straße") == "strasse"
        assert normalise("Straße") == normalise("Strasse")


# --------------------------------------------------------------------------
# LaTeX escaping
# --------------------------------------------------------------------------


class TestTex:
    @pytest.mark.parametrize(
        "roh,erwartet",
        [
            ("100 % richtig", r"100 \% richtig"),
            ("Fisch & Chips", r"Fisch \& Chips"),
            ("50 $ pro Tag", r"50 \$ pro Tag"),
            ("a_b", r"a\_b"),
            ("{Klammer}", r"\{Klammer\}"),
            ("#1", r"\#1"),
        ],
    )
    def test_escapes_latex_specials(self, roh, erwartet):
        assert tex(roh) == erwartet

    def test_translates_symbols_the_t1_fonts_lack(self):
        # These appear in the English distractor analyses and would otherwise
        # abort the build with "Unicode character not set up for use".
        assert tex("✗ falsch") == r"\ensuremath{\times} falsch"
        assert tex("a → b") == r"a \ensuremath{\rightarrow} b"

    def test_passes_german_text_through_untouched(self):
        assert tex("Grüße aus Köln – schön!") == "Grüße aus Köln – schön!"

    def test_handles_none(self):
        assert tex(None) == ""

    def test_texpar_makes_blank_lines_into_paragraphs(self):
        assert texpar("Eins\n\nZwei") == "Eins\n\nZwei"

    def test_texpar_turns_single_newlines_into_hard_breaks(self):
        # Regulations use single newlines to separate numbered paragraphs.
        assert r"\\" in texpar("§ 1 Anmeldung\nDie Benutzung ist kostenlos.")


def test_folientext_strips_the_slide_prefix():
    assert folientext("Folie 3 — Beschreiben Sie die Situation") == (
        "Beschreiben Sie die Situation"
    )


@pytest.mark.parametrize("woerter,mindestens", [(40, 6), (80, 10)])
def test_zeilen_scales_with_the_word_target(woerter, mindestens):
    assert zeilen(woerter) >= mindestens


# --------------------------------------------------------------------------
# Audio DSP
# --------------------------------------------------------------------------


def ton(sekunden: float = 0.5, sr: int = 22050, hz: float = 440.0) -> np.ndarray:
    t = np.arange(int(sr * sekunden)) / sr
    return (np.sin(2 * np.pi * hz * t) * 0.3).astype(np.float32)


class TestResample:
    def test_changes_length_by_the_rate_ratio(self):
        # The bug this guards: Piper's kerstin renders at 16 kHz while thorsten
        # renders at 22.05 kHz. Mixed untouched, kerstin plays 38 % fast.
        x = ton(1.0, sr=16000)
        y = dsp.resample(x, 16000, 22050)
        assert abs(len(y) - 22050) <= 2

    def test_preserves_duration_in_seconds(self):
        x = ton(0.5, sr=16000)
        y = dsp.resample(x, 16000, 22050)
        assert pytest.approx(len(y) / 22050, abs=0.01) == 0.5

    def test_is_a_no_op_at_the_same_rate(self):
        x = ton()
        assert np.array_equal(dsp.resample(x, 22050, 22050), x)

    def test_roughly_preserves_amplitude(self):
        x = ton(0.5, sr=16000)
        y = dsp.resample(x, 16000, 22050)
        assert pytest.approx(dsp.rms(y), rel=0.15) == dsp.rms(x)

    def test_handles_empty_input(self):
        assert dsp.resample(np.zeros(0, dtype=np.float32), 16000, 22050).size == 0


class TestPegelNormalisierung:
    def test_hits_the_target_level(self):
        loud = dsp.normalise(ton() * 10)
        ziel = 10 ** (dsp.TARGET_RMS_DBFS / 20)
        assert pytest.approx(dsp.rms(loud), rel=0.05) == ziel

    def test_never_clips(self):
        assert np.max(np.abs(dsp.normalise(ton() * 50))) <= dsp.PEAK_CEILING + 1e-6

    def test_leaves_silence_alone_rather_than_dividing_by_zero(self):
        still = np.zeros(1000, dtype=np.float32)
        assert not np.any(np.isnan(dsp.normalise(still)))


class TestAkustik:
    @pytest.mark.parametrize("modus", dsp.AKUSTIK_MODES)
    def test_every_mode_produces_usable_audio(self, modus):
        out = dsp.apply_akustik(ton(1.0), 22050, modus)
        assert out.size > 0
        assert not np.any(np.isnan(out))
        assert np.max(np.abs(out)) <= 1.0

    def test_the_telephone_band_removes_the_low_end(self):
        # Tested on the filter itself, not on apply_akustik: that preset ends
        # with normalise(), which re-levels the output and would hide any
        # attenuation from an RMS comparison.
        tief = dsp.bandpass(ton(0.5, hz=100.0), 22050, 300.0, 3400.0)
        mitte = dsp.bandpass(ton(0.5, hz=1000.0), 22050, 300.0, 3400.0)
        assert dsp.rms(tief) < dsp.rms(mitte) * 0.25

    def test_the_telephone_band_keeps_speech_frequencies(self):
        durch = dsp.bandpass(ton(0.5, hz=1000.0), 22050, 300.0, 3400.0)
        assert pytest.approx(dsp.rms(durch), rel=0.1) == dsp.rms(ton(0.5, hz=1000.0))

    def test_mailbox_mode_prepends_the_answering_tone(self):
        assert (
            dsp.apply_akustik(ton(1.0), 22050, "mailbox").size
            > dsp.apply_akustik(ton(1.0), 22050, "telefon").size
        )

    def test_rejects_an_unknown_mode(self):
        with pytest.raises(ValueError, match="unknown akustik mode"):
            dsp.apply_akustik(ton(), 22050, "konzerthalle")


def test_concat_skips_empty_segments():
    joined = dsp.concat([ton(0.1), np.zeros(0, dtype=np.float32), ton(0.1)])
    assert joined.size == ton(0.1).size * 2


def test_to_int16_clamps_out_of_range_samples():
    out = dsp.to_int16(np.array([-2.0, 0.0, 2.0], dtype=np.float32))
    assert out.tolist() == [-32767, 0, 32767]


# --------------------------------------------------------------------------
# Cheat sheet
# --------------------------------------------------------------------------
# The sheet has no JSON Schema — it is one document, not a repeated form — so
# these tests are what stands between a typo and a LaTeX build that fails four
# hundred lines deep in a longtable.


class TestSpickzettel:
    """The shipped cheat sheet, and the checks that guard it."""

    def test_shipped_sheet_is_clean(self):
        rep = validate.Report("lernhilfe")
        validate.check_lernhilfe(rep)
        assert rep.findings == [], "\n".join(str(f) for f in rep.findings)

    def test_ragged_grammar_table_is_an_error(self, tmp_path, monkeypatch):
        daten = self._laden()
        daten["grammatik"][0]["tabelle"]["zeilen"][0].append("eine Zelle zu viel")
        rep = self._pruefen(daten, tmp_path, monkeypatch)
        assert any("cells, header has" in f.message for f in rep.errors)

    def test_missing_verb_form_is_an_error(self, tmp_path, monkeypatch):
        daten = self._laden()
        wort = self._wortschatz()
        wort["verben"][0]["eintraege"][0]["prät"] = ""
        rep = self._pruefen(daten, tmp_path, monkeypatch, wort)
        assert any("missing ['prät']" in f.message for f in rep.errors)

    def test_noun_without_a_real_article_is_an_error(self, tmp_path, monkeypatch):
        wort = self._wortschatz()
        wort["nomen"][0]["eintraege"][0]["art"] = "den"
        rep = self._pruefen(self._laden(), tmp_path, monkeypatch, wort)
        assert any("has article 'den'" in f.message for f in rep.errors)

    def test_dropping_a_module_is_an_error(self, tmp_path, monkeypatch):
        daten = self._laden()
        daten["strategie"] = [s for s in daten["strategie"] if s["modul"] != "Sprechen"]
        rep = self._pruefen(daten, tmp_path, monkeypatch)
        assert any("expected the four modules" in f.message for f in rep.errors)

    def test_receptive_heavy_redemittel_warns(self, tmp_path, monkeypatch):
        """Sprechen and Schreiben are meant to dominate; drifting away warns."""
        daten = self._laden()
        daten["redemittel"] = [
            r for r in daten["redemittel"]
            if not r["bereich"].startswith(("Sprechen", "Schreiben"))
        ]
        rep = self._pruefen(daten, tmp_path, monkeypatch)
        assert any("Sprechen or Schreiben" in f.message for f in rep.warnings)

    # -- helpers ----------------------------------------------------------

    @staticmethod
    def _laden() -> dict:
        return json.loads(
            (validate.LERNHILFE / "lernhilfe.json").read_text(encoding="utf-8"))

    @staticmethod
    def _wortschatz() -> dict:
        return json.loads(
            (validate.LERNHILFE / "wortschatz.json").read_text(encoding="utf-8"))

    def _pruefen(self, daten, tmp_path, monkeypatch, wortschatz=None):
        """Write a doctored copy to a temp dir and validate that instead."""
        (tmp_path / "lernhilfe.json").write_text(
            json.dumps(daten, ensure_ascii=False), encoding="utf-8")
        (tmp_path / "wortschatz.json").write_text(
            json.dumps(wortschatz or self._wortschatz(), ensure_ascii=False),
            encoding="utf-8")
        monkeypatch.setattr(validate, "LERNHILFE", tmp_path)
        rep = validate.Report("lernhilfe")
        validate.check_lernhilfe(rep)
        return rep


def test_betont_marks_become_bold():
    assert betont("Ich **bin** müde.") == r"Ich \textbf{bin} müde."


def test_betont_still_escapes_latex():
    assert betont("100 % **sicher**") == r"100 \% \textbf{sicher}"


# --------------------------------------------------------------------------
# PDF fixture
# --------------------------------------------------------------------------


class TestPdfFixture:
    """The stand-in PDFs the end-to-end tests download when LaTeX is absent."""

    def test_is_a_structurally_valid_pdf(self):
        pdf = make_pdf_fixture.minimal_pdf(["Titel", "Zeile"])
        assert pdf.startswith(b"%PDF-")
        assert pdf.rstrip().endswith(b"%%EOF")
        # One xref entry per object plus the free head entry.
        assert pdf.count(b" 00000 n \n") == 5
        assert b"/Type /Catalog" in pdf and b"/Type /Page " in pdf

    def test_declared_stream_length_matches_the_stream(self):
        """A wrong /Length is the classic way to produce a file readers reject."""
        pdf = make_pdf_fixture.minimal_pdf(["Ein Titel", "und eine Zeile"])
        declared = int(re.search(rb"/Length (\d+) >>", pdf).group(1))
        body = re.search(rb"stream\n(.*?)\nendstream", pdf, re.S).group(1)
        assert declared == len(body)

    def test_brackets_in_a_title_cannot_end_the_string_early(self):
        """An exam title with a bracket would otherwise corrupt the file."""
        assert make_pdf_fixture.pdf_text("Teil 1 (Beispiel)") == r"Teil 1 \(Beispiel\)"
        assert make_pdf_fixture.pdf_text("a\\b") == "a\\\\b"

    def test_umlauts_are_transliterated_not_dropped(self):
        assert make_pdf_fixture.pdf_text("Übungsprüfung — groß") == "Uebungspruefung - gross"

    def test_stays_ascii_so_the_stream_encodes(self):
        gefaltet = make_pdf_fixture.pdf_text("Ελληνικά · 中文")
        gefaltet.encode("ascii")  # raises if the fold leaked a non-ASCII byte


# --------------------------------------------------------------------------
# The examination formats
# --------------------------------------------------------------------------
# These are the tests that keep the two levels honest. B1 and B2 share a
# pipeline and disagree on nearly every number in it — including which
# listening parts are heard twice, which is the mistake you make once.


def fuellen(wert):
    """Pad every placeholder so a scaffold clears the schema's minLength rules.

    The scaffolder deliberately writes prose too short to pass: a half-written
    paper must never validate. To test the *structure* it produced, the prose
    has to be lengthened without touching anything meaningful — keys, letters,
    gap markers and role names are all real values already, and none of them
    starts with TODO.
    """
    if isinstance(wert, dict):
        return {k: fuellen(v) for k, v in wert.items()}
    if isinstance(wert, list):
        return [fuellen(v) for v in wert]
    if isinstance(wert, str) and wert.startswith("TODO"):
        fehlend = max(0, 200 - len(wert))
        return wert + " Fülltext für den Test." * (fehlend // 24 + 1)
    return wert


def geruest_pruefen(exam_id: str, stufe: str) -> validate.Report:
    exam = fuellen(new_exam.geruest(exam_id, stufe, "erwachsene", "mittel"))
    return validate.validate_one(exam, exam_id)


def strukturfehler(rep: validate.Report) -> list[str]:
    """Errors about the shape of the paper, not about its (placeholder) prose."""
    return [
        str(f) for f in rep.errors
        if f.where.startswith(("schema:", "lesen", "hoeren", "schreiben", "sprechen"))
    ]


class TestGeruestPasstZurSpezifikation:
    """What new_exam.py builds is what validate.py demands, at every level."""

    @pytest.mark.parametrize(
        "exam_id,stufe",
        [
            ("a1-pruefung-99", "A1"),
            ("a2-pruefung-99", "A2"),
            ("pruefung-99", "B1"),
            ("b2-pruefung-99", "B2"),
        ],
    )
    def test_scaffold_is_structurally_valid(self, exam_id, stufe):
        rep = geruest_pruefen(exam_id, stufe)
        assert strukturfehler(rep) == [], "\n".join(strukturfehler(rep))

    @pytest.mark.parametrize("stufe", ["A1", "A2", "B1", "B2"])
    def test_every_module_is_worth_what_the_level_says(self, stufe):
        spec = validate.FORMATE[stufe]
        assert sum(spec.schreiben_punkte) == spec.schreiben_maximum
        assert sum(spec.sprechen_punkte) + spec.sprechen_aussprache == spec.modul_punkte

    def test_a2_writing_is_marked_raw_and_speaking_is_not(self):
        """The one asymmetry in A2's marking, and it is easy to miss.

        Lesen, Hören and Schreiben are each marked out of 20 raw Messpunkte and
        multiplied by 1.25 to reach 25. Sprechen is scored out of 25 directly,
        criterion by criterion, with no conversion at all. Treating Schreiben
        like Sprechen would inflate it by a quarter.
        """
        a2 = validate.FORMATE["A2"]
        assert a2.schreiben_maximum == 20
        assert a2.schreiben_maximum * 1.25 == a2.modul_punkte
        assert sum(a2.sprechen_punkte) + a2.sprechen_aussprache == 25
        for stufe in ("B1", "B2"):
            spec = validate.FORMATE[stufe]
            assert spec.schreiben_maximum == spec.modul_punkte

    @pytest.mark.parametrize("stufe", ["A1", "A2", "B1", "B2"])
    def test_both_receptive_modules_have_the_same_item_count(self, stufe):
        spec = validate.FORMATE[stufe]
        assert sum(spec.lesen_items) == spec.gesamt_items
        assert sum(spec.hoeren_items) == spec.gesamt_items

    def test_a2_is_scored_as_one_examination(self):
        """A2 is not modular, and nothing downstream may assume it is.

        100 points across four parts of 25, rather than 100 per part. Reading
        this off the B1 table would quadruple every A2 candidate's score.
        """
        assert validate.FORMATE["A2"].modul_punkte == 25
        assert validate.FORMATE["A2"].gesamt_items == 20
        assert validate.FORMATE["A1"].modul_punkte == 15
        assert validate.FORMATE["A1"].gesamt_items == 15
        assert validate.FORMATE["B1"].modul_punkte == 100
        assert validate.FORMATE["B2"].modul_punkte == 100

    def test_the_levels_disagree_about_which_parts_repeat(self):
        """The single easiest thing to get wrong when adapting a paper.

        Three different patterns across four levels, and A1's is a different
        length again because it has three listening parts rather than four.
        """
        assert validate.FORMATE["A1"].hoeren_wiederholungen == (2, 1, 2)
        assert validate.FORMATE["A2"].hoeren_wiederholungen == (2, 1, 1, 2)
        assert validate.FORMATE["B1"].hoeren_wiederholungen == (2, 1, 1, 2)
        assert validate.FORMATE["B2"].hoeren_wiederholungen == (1, 2, 1, 2)

    def test_the_level_comes_from_the_folder_name(self):
        assert validate.stufe_von("pruefung-01") == "B1"
        assert validate.stufe_von("b2-pruefung-01") == "B2"


class TestB2Regeln:
    """The B2-only rules, each tested by breaking exactly one thing."""

    def bauen(self) -> dict:
        return fuellen(new_exam.geruest("b2-pruefung-99", "B2", "erwachsene", "mittel"))

    def pruefen(self, exam: dict) -> validate.Report:
        return validate.validate_one(exam, "b2-pruefung-99")

    def test_a_reused_letter_is_an_error(self):
        exam = self.bauen()
        teil = exam["lesen"]["teile"][1]
        teil["items"][1]["loesung"] = teil["items"][0]["loesung"]
        assert any("may answer at most one item" in f.message
                   for f in self.pruefen(exam).errors)

    def test_spending_the_worked_example_letter_again_is_an_error(self):
        exam = self.bauen()
        teil = exam["lesen"]["teile"][3]
        teil["items"][0]["loesung"] = teil["beispiel"]["loesung"]
        assert any("may answer at most one item" in f.message
                   for f in self.pruefen(exam).errors)

    def test_a_list_with_no_decoy_is_an_error(self):
        """Drop the one sentence nothing points at, and the task gives itself away."""
        exam = self.bauen()
        teil = exam["lesen"]["teile"][1]
        benutzt = {i["loesung"] for i in teil["items"]} | {teil["beispiel"]["loesung"]}
        teil["optionenliste"] = [o for o in teil["optionenliste"]
                                 if o["buchstabe"] in benutzt]
        assert any("at least one decoy" in f.message for f in self.pruefen(exam).errors)

    def test_a_missing_gap_marker_is_an_error(self):
        exam = self.bauen()
        teil = exam["lesen"]["teile"][1]
        teil["texte"][0]["inhalt"] = teil["texte"][0]["inhalt"].replace("[12]", "…")
        assert any("no gap marker for item(s) [12]" in f.message
                   for f in self.pruefen(exam).errors)

    def test_a_gap_nobody_asks_about_is_an_error(self):
        exam = self.bauen()
        teil = exam["lesen"]["teile"][1]
        teil["texte"][0]["inhalt"] += " Und hier noch eine Lücke [29]."
        assert any("marks gap(s) [29]" in f.message for f in self.pruefen(exam).errors)

    def test_the_four_writers_must_be_named_the_same_everywhere(self):
        exam = self.bauen()
        exam["lesen"]["teile"][0]["items"][0]["optionen"]["c"] = "Jemand ganz anderes"
        assert any("must name the same writer" in f.message
                   for f in self.pruefen(exam).errors)

    def test_b1_repeat_pattern_on_a_b2_paper_is_an_error(self):
        exam = self.bauen()
        exam["hoeren"]["teile"][0]["wiederholungen"] = 2
        assert any("heard 2x, B2 requires 1x" in f.message
                   for f in self.pruefen(exam).errors)

    def test_a_fundstelle_that_does_not_exist_at_this_level_is_an_error(self):
        """B2 Sprechen has two parts, so 'Sprechen Teil 3' is nowhere."""
        exam = self.bauen()
        exam["glossar"][0]["fundstelle"] = "Sprechen Teil 3"
        assert any("does not exist at B2" in f.message for f in self.pruefen(exam).errors)

    def test_a_debate_without_a_partner_script_is_an_error(self):
        exam = self.bauen()
        del exam["sprechen"]["teile"][1]["partnerSkript"]
        assert any("solo candidates need the other side" in f.message
                   for f in self.pruefen(exam).errors)


class TestGeruestIdUndStufe:
    def test_a_b2_id_without_the_prefix_is_rejected(self):
        assert new_exam.main(["pruefung-98", "--stufe", "B2"]) == 1

    def test_a_b1_id_with_the_b2_prefix_is_rejected(self):
        assert new_exam.main(["b2-pruefung-98", "--stufe", "B1"]) == 1


# --------------------------------------------------------------------------
# Console encoding
# --------------------------------------------------------------------------


class TestKonsolenKodierung:
    """Every CLI tool must survive a cp1252 console.

    All of them print German text, and most print an arrow in their status
    lines. On Windows the default console encoding kills the process on the
    first such line — before any output is written, which makes it look like
    the tool did nothing rather than like it crashed. generate_audio.py
    shipped without the guard and failed exactly that way.
    """

    WERKZEUGE = [
        "validate.py",
        "build_pdf.py",
        "export_web.py",
        "generate_audio.py",
        "new_exam.py",
    ]

    @pytest.mark.parametrize("name", WERKZEUGE)
    def test_reconfigures_stdout(self, name):
        quelle = (pathlib.Path(__file__).parent / name).read_text(encoding="utf-8")
        assert 'reconfigure(encoding="utf-8"' in quelle, (
            f"{name} prints German text but never reconfigures stdout; "
            f"it will die on a cp1252 console"
        )


class TestSchluesselverteilung:
    """A part whose answers are all the same answer measures nothing.

    Found by auditing the shipped papers: one had five multiple-choice items in
    a row keyed 'b', another six true/false items of which five were 'falsch'.
    Both were tickable without reading. The rule is deliberately loose — real
    papers are lopsided — so these tests pin both ends of it.
    """

    def teil(self, keys, typ="multiple_choice"):
        return {"nummer": 1, "items": [{"nr": n, "typ": typ, "loesung": k}
                                       for n, k in enumerate(keys, start=1)]}

    def fehler(self, keys, typ="multiple_choice"):
        rep = validate.Report("test")
        validate.check_schluesselverteilung(self.teil(keys, typ), "w", rep)
        return rep.errors

    def test_a_single_answer_part_is_rejected(self):
        assert self.fehler(["b"] * 5)

    def test_five_of_six_is_rejected(self):
        assert self.fehler(["falsch"] * 5 + ["richtig"], "richtig_falsch")

    def test_an_ordinary_lopsided_part_is_accepted(self):
        # Four to two is normal in a real paper and must not fail the build.
        assert not self.fehler(["falsch"] * 4 + ["richtig"] * 2, "richtig_falsch")

    def test_a_short_part_is_not_judged(self):
        # Three items are too few for the share to mean anything.
        assert not self.fehler(["a", "a", "a"])

    def test_matching_tasks_are_exempt(self):
        # Their letters are already forced to be distinct by another rule.
        assert not self.fehler(["a"] * 6, "zuordnung_buchstabe")

    def test_every_shipped_paper_passes(self):
        for pfad in sorted((pathlib.Path(__file__).parent.parent / "content" / "exams")
                           .glob("*/exam.json")):
            exam = json.loads(pfad.read_text(encoding="utf-8"))
            for modul in ("lesen", "hoeren"):
                for teil in exam[modul]["teile"]:
                    rep = validate.Report(exam["meta"]["id"])
                    validate.check_schluesselverteilung(teil, f"{modul}/{teil['nummer']}", rep)
                    assert rep.errors == [], "\n".join(str(f) for f in rep.errors)


# --------------------------------------------------------------------------
# The speaking trainer, per level
# --------------------------------------------------------------------------


def _thema(titel: str = "Sollte man das wirklich tun?", woerter: int = 110) -> dict:
    """One Vortrag topic whose model talk lands inside the four-minute window."""
    return {
        "titel": titel,
        "kultur": {"de": "Deutscher Hintergrund. " * 20, "en": "German background. " * 20},
        "wortschatz": [{"de": f"das Wort {i}", "en": f"the word {i}"} for i in range(8)],
        "musterloesung": [" ".join(["Wort"] * woerter) for _ in range(4)],
    }


def _b2_trainer(aufgaben: int = 1) -> dict:
    """A minimal speaking trainer that the B2 rules accept."""
    return {
        "titel": "Sprechtraining B2",
        "untertitel": "Aufgaben",
        "stufe": "B2",
        "hinweis": "Erst sprechen, dann nachlesen.",
        "vorbereitungMinuten": 15,
        "teile": [{"nummer": 1}, {"nummer": 2}],
        "gliederung": ["Einleitung", "Hauptteil", "Hauptteil", "Schluss"],
        "aufgaben": [
            {
                "nummer": n + 1,
                "kurz": f"Thema {n + 1}",
                "teil1": {
                    "themen": [_thema(f"Sollte A{n} gelten?"), _thema(f"Sollte B{n} gelten?")],
                    "fragen": ["Und Sie?", "Warum?", "Und sonst?"],
                    "antwortenAufFragen": ["Ja, weil das so ist.", "Darum.", "Sonst nichts."],
                },
                "teil2": {
                    "frage": f"Sollte man D{n} verbieten?",
                    "punkte": ["a", "b", "c", "d"],
                    "kultur": {"de": "Deutscher Hintergrund. " * 20,
                               "en": "German background. " * 20},
                    "musterdialog": [{"wer": "A" if i % 2 == 0 else "B",
                                      "text": " ".join(["Wort"] * 40)} for i in range(12)],
                },
            }
            for n in range(aufgaben)
        ],
    }


class TestSprechtrainingB2:
    """B2 Sprechen is a different examination, so it gets its own rules.

    Each test breaks exactly one thing in a trainer that otherwise passes.
    """

    def pruefen(self, daten: dict, tmp_path, monkeypatch, stufe: str = "B2") -> list:
        (tmp_path / f"{stufe.lower()}.json").write_text(
            json.dumps(daten, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(validate, "SPRECHEN", tmp_path)
        rep = validate.Report(f"sprechen-{stufe}")
        validate.check_sprechtraining(rep, stufe)
        return rep.errors

    def test_a_sound_trainer_passes(self, tmp_path, monkeypatch):
        assert self.pruefen(_b2_trainer(), tmp_path, monkeypatch) == []

    def test_one_topic_instead_of_a_choice_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil1"]["themen"].pop()
        assert any("two topics" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_the_same_topic_offered_twice_is_an_error(self, tmp_path, monkeypatch):
        """A choice between a thing and itself is not a choice."""
        daten = _b2_trainer()
        themen = daten["aufgaben"][0]["teil1"]["themen"]
        themen[1]["titel"] = themen[0]["titel"]
        assert any("identical" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_topic_reused_across_tasks_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer(aufgaben=2)
        daten["aufgaben"][1]["teil1"]["themen"][0]["titel"] = (
            daten["aufgaben"][0]["teil1"]["themen"][0]["titel"])
        assert any("Vortrag topic used 2 times" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_debate_question_reused_across_tasks_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer(aufgaben=2)
        daten["aufgaben"][1]["teil2"]["frage"] = daten["aufgaben"][0]["teil2"]["frage"]
        assert any("debate question used 2 times" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_topic_that_is_not_a_question_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil1"]["themen"][0]["titel"] = "Homeoffice"
        assert any("arguable question" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_five_blocks_is_an_error_because_b2_has_a_four_point_outline(
            self, tmp_path, monkeypatch):
        """Five blocks is the B1 presentation; at B2 the outline has four points."""
        daten = _b2_trainer()
        thema = daten["aufgaben"][0]["teil1"]["themen"][0]
        thema["musterloesung"] = [" ".join(["Wort"] * 88) for _ in range(5)]
        assert any("one block per outline point" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_talk_too_short_for_four_minutes_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil1"]["themen"][0] = _thema(woerter=60)
        assert any("outside the 400-500" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_talk_too_long_for_four_minutes_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil1"]["themen"][0] = _thema(woerter=140)
        assert any("outside the 400-500" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_printed_word_count_that_lies_is_an_error(self, tmp_path, monkeypatch):
        """The count is printed by the talk, so a stale one teaches a false pace."""
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil1"]["themen"][0]["umfang"] = {"woerter": 999}
        assert any("does not match" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_stub_culture_note_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil1"]["themen"][1]["kultur"]["de"] = "Kurz."
        assert any("too short" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_missing_english_gloss_is_an_error(self, tmp_path, monkeypatch):
        """The English note is what the learner without German context reads."""
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil2"]["kultur"]["en"] = ""
        assert any("too short" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_too_little_topic_vocabulary_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil1"]["themen"][0]["wortschatz"] = [
            {"de": "das Wort", "en": "the word"}]
        assert any("too little topic vocabulary" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_vocabulary_entry_too_wide_for_the_printed_table_is_an_error(
            self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil1"]["themen"][0]["wortschatz"][0]["de"] = "d" * 40
        assert any("too long for the printed table" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_debate_that_does_not_alternate_is_an_error(self, tmp_path, monkeypatch):
        """Two turns by the same speaker is a monologue, not a debate."""
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil2"]["musterdialog"][1]["wer"] = "A"
        assert any("does not alternate" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_too_few_debate_turns_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil2"]["musterdialog"] = (
            daten["aufgaben"][0]["teil2"]["musterdialog"][:8])
        assert any("outside 10-14" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_debate_too_long_for_five_minutes_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        for zug in daten["aufgaben"][0]["teil2"]["musterdialog"]:
            zug["text"] = " ".join(["Wort"] * 60)
        assert any("outside the 380-560" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_three_discussion_points_is_an_error(self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        daten["aufgaben"][0]["teil2"]["punkte"].pop()
        assert any("four discussion points" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_five_point_outline_is_an_error_at_b2(self, tmp_path, monkeypatch):
        daten = _b2_trainer()
        daten["gliederung"] = ["Einleitung", "Hauptteil", "Hauptteil", "Schluss", "Extra"]
        assert any("gliederung" in f.where
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_the_b1_field_is_not_accepted_at_b2(self, tmp_path, monkeypatch):
        """B1 carries `folien`, B2 `gliederung`; swapping them must not pass."""
        daten = _b2_trainer()
        daten["folien"] = daten.pop("gliederung")
        assert any("gliederung" in f.message
                   for f in self.pruefen(daten, tmp_path, monkeypatch))

    def test_a_missing_level_file_is_not_an_error(self, tmp_path, monkeypatch):
        """A level with no trainer yet must not fail the whole content build."""
        monkeypatch.setattr(validate, "SPRECHEN", tmp_path)
        rep = validate.Report("sprechen-A1")
        validate.check_sprechtraining(rep, "A1")
        assert rep.errors == []

    def test_every_shipped_trainer_passes(self):
        """The rules are worth nothing if the shipped books do not meet them."""
        for stufe in ("B1", "B2"):
            if not (validate.SPRECHEN / f"{stufe.lower()}.json").exists():
                continue
            rep = validate.Report(f"sprechen-{stufe}")
            validate.check_sprechtraining(rep, stufe)
            assert rep.errors == [], "\n".join(str(f) for f in rep.errors)
