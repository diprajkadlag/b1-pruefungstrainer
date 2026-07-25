"""Tests for the content pipeline.

Run with `pytest tools/`. These cover the parts where a silent mistake would
be expensive: the glossary matcher (a false negative blocks a valid exam, a
false positive lets a bogus entry through), the LaTeX escaper (a missed
character breaks the build), and the audio DSP (a wrong sample rate makes
every voice sound comical).
"""

from __future__ import annotations

import numpy as np
import pytest

import audio_dsp as dsp
from build_pdf import folientext, tex, texpar, zeilen
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
        assert normalise("  Der   GARTEN\nist groß ") == "der garten ist groß"

    def test_unifies_the_dashes_and_quotes_editors_produce(self):
        assert normalise("„Test“ – ok") == normalise('"Test" - ok')

    def test_keeps_umlauts_because_they_change_meaning(self):
        assert normalise("schön") != normalise("schon")


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


class TestNormalise:
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
