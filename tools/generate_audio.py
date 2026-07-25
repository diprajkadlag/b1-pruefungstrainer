#!/usr/bin/env python3
"""Synthesise the listening tracks and speaking-partner audio for an exam.

    python tools/generate_audio.py                    # every exam
    python tools/generate_audio.py pruefung-01        # one exam
    python tools/generate_audio.py pruefung-01 --teil 3
    python tools/generate_audio.py --list-voices
    python tools/generate_audio.py --voice-preview de_DE-kerstin-low

Default provider is **Piper**: offline, ONNX, and restricted to voices whose
licences permit redistribution, so the generated MP3s can ship with the project.
See NOTICE for the per-voice licences and docs/AUDIO.md for the design.

Output per exam, into content/exams/<id>/audio/:

    hoeren_teil1.mp3 … hoeren_teil4.mp3   one file per part
    hoeren_komplett.mp3                   the whole module, as sat in the hall
    sprechen_t1_partner_01.mp3 …          simulated partner turns for solo mode
    manifest.json                         durations and cue points for the app
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import audio_dsp as dsp  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content" / "exams"
VOICE_DIR = Path(__file__).resolve().parent / ".voices"

NARRATOR = "Sprecher"

# One sample rate for the whole project. Piper's German voices render at
# 16 kHz, 22.05 kHz or 24 kHz depending on the model; everything is resampled
# to this before mixing, or the slower-rate voices play fast and pitched up.
PROJEKT_SR = 22050

# Pause lengths, in seconds, matching how a real listening module is paced.
# Reading time before each part comes from the rubric line's own pauseDanachSek,
# because it depends on how many items the candidate has to read first.
PAUSE_VOR_WIEDERHOLUNG = 3.0    # between a short text and its repeat
PAUSE_NACH_WIEDERHOLUNG = 10.0  # to mark the two answers for that text
PAUSE_TEILENDE = 10.0           # after the last item of a part
PAUSE_ZWISCHEN_TEILEN = 5.0     # between parts on the combined track

# The real module is 40 minutes including transferring answers to the answer
# sheet. The audio itself runs a little over half an hour.
ZIELDAUER_MIN, ZIELDAUER_MAX = 27.0, 36.0

# Delivery pace, in words per minute, for a paper at sprechtempoProzent 0.
# Examination recordings sit around 130-140 wpm — clearly slower than casual
# speech, never artificially slow. Piper voices left at their own defaults run
# closer to 200 wpm, which would make every paper unrealistically hard, so each
# voice is calibrated against this target instead of nudged relative to itself.
ZIEL_WPM = 135.0

# Duration is modelled per *character*, not per word.
#
# Words are not a stable unit of speech time in German: a narrated sentence
# ("Veranstaltung", "Obergeschoss") carries far more syllables per word than a
# line of dialogue ("Und das machst du allein?"). Calibrating on words made the
# conversation part run 25 % fast while the monologue was on target. Measured
# over the same utterances, characters per second stayed within a few per cent
# where words per minute ranged from 129 to 187.
#
# Words per minute remains the human-facing target because it is what exam
# guidance is written in; this constant converts it, and is the mean word
# length over the papers in content/exams including the following space.
ZEICHEN_PRO_WORT = 6.4

# Acceptable deviation from the target pace, per part.
PACE_TOLERANZ = 0.15

# Two calibration texts of very different lengths, measured at two speeds each.
# One text cannot separate the fixed padding around an utterance from the part
# that actually scales with length, and getting that split wrong makes either
# the short dialogue turns or the long narrated texts land at the wrong pace.
KALIBRIER_KURZ = "Und wo schläfst du?"
KALIBRIER_LANG = (
    "Sehr geehrte Damen und Herren, wir begrüßen Sie herzlich zu dieser "
    "Veranstaltung und wünschen Ihnen einen angenehmen Aufenthalt in unserem Haus. "
    "Bitte beachten Sie, dass der Vortrag im großen Saal im ersten Obergeschoss "
    "stattfindet und pünktlich um neunzehn Uhr dreißig beginnt."
)
KALIBRIER_WOERTER = len(KALIBRIER_LANG.split())
KALIBRIER_ZEICHEN = len(KALIBRIER_LANG)


# ---------------------------------------------------------------------------
# Voice registry
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class VoiceSpec:
    key: str
    gender: str          # "m" | "f"
    quality: str
    licence: str
    redistributable: bool
    note: str = ""

    @property
    def model_name(self) -> str:
        """Piper voice id, without any '#speaker' suffix we may append."""
        return self.key.split("#", 1)[0]

    @property
    def speaker_id(self) -> int | None:
        return int(self.key.split("#", 1)[1]) if "#" in self.key else None


# Ordered best-quality-first within each gender. Only CC0 and permissive
# licences appear here; see EXCLUDED_VOICES for what is deliberately absent.
VOICES: dict[str, VoiceSpec] = {
    v.key: v
    for v in [
        VoiceSpec("de_DE-thorsten-high", "m", "high", "CC0-1.0", True,
                  "Thorsten-Voice. The only German Piper voice at 'high'."),
        VoiceSpec("de_DE-thorsten_emotional-medium", "m", "medium", "CC0-1.0", True,
                  "Same speaker as thorsten — avoid pairing the two in one part."),
        VoiceSpec("de_DE-mls-medium", "m", "medium", "CC-BY-4.0", True,
                  "Multi-speaker (Multilingual LibriSpeech). Attribution required."),
        VoiceSpec("de_DE-karlsson-low", "m", "low", "M-AILABS", True,
                  "M-AILABS dataset; retain the copyright notice."),
        VoiceSpec("de_DE-kerstin-low", "f", "low", "CC0-1.0", True, ""),
        VoiceSpec("de_DE-ramona-low", "f", "low", "M-AILABS", True,
                  "M-AILABS dataset; retain the copyright notice."),
        VoiceSpec("de_DE-eva_k-x_low", "f", "x_low", "M-AILABS", True,
                  "Lowest quality available; used only when other voices are taken."),
    ]
}

# Refusing these is a licensing decision, not a quality one. Keep the reason
# next to the name so nobody "helpfully" adds them back later.
EXCLUDED_VOICES: dict[str, str] = {
    "de_DE-pavoque-low":
        "CC BY-NC-SA 4.0. The NonCommercial term is incompatible with this "
        "project's CC BY 4.0 content licence, which permits commercial reuse.",
}

# The narrator reads the rubric ("Teil eins. Sie hören …"). Best quality wins:
# it is the voice a candidate hears most often across the whole module.
DEFAULT_NARRATOR = "de_DE-thorsten-high"

# Character voices, tried in order. The narrator's voice is skipped for
# characters wherever an alternative is still free.
# mls-medium sits late deliberately. It reads far slower than the others and
# needs a length_scale near the floor to reach examination pace, so any part it
# appears in drifts slow. It stays available — it is the only way to cast a
# third male character — but it is chosen last.
POOL: dict[str, list[str]] = {
    "m": ["de_DE-karlsson-low", "de_DE-thorsten_emotional-medium",
          "de_DE-mls-medium", "de_DE-thorsten-high"],
    "f": ["de_DE-kerstin-low", "de_DE-ramona-low", "de_DE-eva_k-x_low"],
}


def list_voices() -> None:
    print(f"{'voice':38} {'sex':4} {'quality':8} {'licence':12} note")
    print("-" * 100)
    for v in VOICES.values():
        print(f"{v.key:38} {v.gender:4} {v.quality:8} {v.licence:12} {v.note}")
    print()
    for key, why in EXCLUDED_VOICES.items():
        print(f"EXCLUDED  {key}\n          {why}")


# ---------------------------------------------------------------------------
# Synthesis providers
# ---------------------------------------------------------------------------


class PiperProvider:
    """Offline neural TTS. Downloads each voice once into tools/.voices/."""

    name = "piper"
    redistributable = True

    def __init__(self, voice_dir: Path = VOICE_DIR) -> None:
        self.voice_dir = voice_dir
        self.voice_dir.mkdir(parents=True, exist_ok=True)
        self._loaded: dict[str, Any] = {}
        self._warned: set[tuple[str, frozenset[str]]] = set()
        self._calibration: dict[str, tuple[float, float]] = {}

    def _voice(self, model_name: str):
        if model_name in self._loaded:
            return self._loaded[model_name]

        from piper import PiperVoice
        from piper.download_voices import download_voice

        model_path = self.voice_dir / f"{model_name}.onnx"
        if not model_path.exists():
            print(f"    downloading voice {model_name} …", flush=True)
            download_voice(model_name, self.voice_dir)

        voice = PiperVoice.load(model_path)
        self._loaded[model_name] = voice
        return voice

    def sample_rate(self, voice_key: str) -> int:
        return PROJEKT_SR

    @staticmethod
    def _normalise_phonemes(phonemes: list[str]) -> list[str]:
        """Recombine decomposed IPA so every voice's id map can find it.

        espeak-ng emits the German ich-Laut as U+0063 LATIN SMALL LETTER C
        followed by U+0327 COMBINING CEDILLA. Only the highest-quality voice
        models list the bare combining mark in their phoneme id map; the rest
        silently drop it, turning /ç/ into /c/ and mispronouncing *ich*, *nicht*,
        *möchte* and *richtig* throughout. Normalising to NFC yields the
        precomposed U+00E7, which every model knows.
        """
        return list(unicodedata.normalize("NFC", "".join(phonemes)))

    def _modell(self, voice_key: str) -> tuple[float, float, float]:
        """Fit this voice's duration model, returning (pad, c0, c1).

        Every Piper voice has its own natural tempo, and all of them are faster
        than an examination recording — thorsten runs at 185 wpm untouched.
        Correcting that needs a model of how duration actually behaves, because
        two separate effects break the obvious single-factor approach.

        First, `length_scale` is not proportional to duration: it stretches
        phoneme durations while the silence around the utterance stays put.
        Second, that fixed silence is a large share of a five-word line of
        dialogue and a negligible share of an eighty-word narrated text.

        So the model is

            duration(words, scale) = pad + (c0 + c1 · scale) · words

        fitted from four measurements: a short and a long text, each at scale
        1.0 and 1.5. Solving it per utterance keeps short turns and long texts
        at the same delivered pace. Four syntheses per voice, once.
        """
        if voice_key in self._calibration:
            return self._calibration[voice_key]

        from piper import SynthesisConfig

        spec = VOICES[voice_key]
        voice = self._voice(spec.model_name)
        src_sr = int(voice.config.sample_rate)

        def dauer(text: str, scale: float) -> float:
            cfg = SynthesisConfig(length_scale=scale, normalize_audio=True,
                                  speaker_id=spec.speaker_id)
            return len(self._render(voice, text, cfg, spec.model_name)) / src_sr

        n_kurz = len(KALIBRIER_KURZ)
        n_lang = len(KALIBRIER_LANG)
        spanne = n_lang - n_kurz

        # Per-character seconds and padding at each of the two speeds.
        pro_wort: dict[float, float] = {}
        pads: list[float] = []
        for scale in (1.0, 1.5):
            d_kurz, d_lang = dauer(KALIBRIER_KURZ, scale), dauer(KALIBRIER_LANG, scale)
            k = (d_lang - d_kurz) / spanne
            pro_wort[scale] = k
            pads.append(d_kurz - k * n_kurz)

        pad = max(0.0, sum(pads) / len(pads))
        c1 = (pro_wort[1.5] - pro_wort[1.0]) / 0.5
        c0 = pro_wort[1.0] - c1

        modell = (pad, c0, c1)
        self._calibration[voice_key] = modell
        return modell

    def calibration(self, voice_key: str, zeichen: int = KALIBRIER_ZEICHEN) -> float:
        """length_scale that reads `zeichen` characters at the target pace."""
        pad, c0, c1 = self._modell(voice_key)
        if zeichen <= 0 or abs(c1) < 1e-9:
            return 1.0
        ziel_zps = ZIEL_WPM * ZEICHEN_PRO_WORT / 60.0
        ziel_sek = zeichen / ziel_zps
        # The floor matters: de_DE-mls-medium reads markedly slower than the
        # other voices and needs a scale well below 1 to reach exam pace. A
        # floor of 0.6 clipped it, leaving every part it appeared in noticeably
        # slow. Below about 0.45 Piper's output starts to slur, so that is the
        # real limit.
        return float(np.clip(((ziel_sek - pad) / zeichen - c0) / c1, 0.45, 3.0))

    def _render(self, voice, text: str, cfg, label: str = "voice") -> np.ndarray:
        id_map = voice.config.phoneme_id_map
        pieces: list[np.ndarray] = []
        for sentence in voice.phonemize(text):
            phonemes = self._normalise_phonemes(sentence)
            unknown = {p for p in phonemes if p not in id_map}
            if unknown:
                self._warn_unknown(label, unknown)
                phonemes = [p for p in phonemes if p in id_map]
            if not phonemes:
                continue
            audio = voice.phoneme_ids_to_audio(voice.phonemes_to_ids(phonemes), cfg)
            pieces.append(np.asarray(audio, dtype=np.float32).reshape(-1))
        if not pieces:
            return np.zeros(0, dtype=np.float32)
        return np.concatenate(pieces).astype(np.float32)

    def speak(self, text: str, voice_key: str, rate_percent: int = 0,
              deliberate: bool = False) -> np.ndarray:
        from piper import SynthesisConfig

        spec = VOICES[voice_key]
        voice = self._voice(spec.model_name)

        # Calibrate for this utterance's own length, then apply the paper's
        # offset: -8 % on the gentlest paper, 0 % at full examination speed.
        # `deliberate` lends a little extra weight to the line carrying an
        # answer, as a real reader would.
        factor = self.calibration(voice_key, len(text)) / (1.0 + rate_percent / 100.0)
        if deliberate:
            factor *= 1.04

        cfg = SynthesisConfig(
            length_scale=factor,
            noise_scale=0.667,
            noise_w_scale=0.8,
            normalize_audio=True,
            speaker_id=spec.speaker_id,
        )
        audio = self._render(voice, text, cfg, spec.model_name)
        # Voices disagree on sample rate; the project mixes at one rate only.
        return dsp.resample(audio, int(voice.config.sample_rate), PROJEKT_SR)

    def _warn_unknown(self, model: str, unknown: set[str]) -> None:
        key = (model, frozenset(unknown))
        if key in self._warned:
            return
        self._warned.add(key)
        detail = ", ".join(
            f"U+{ord(c):04X} {unicodedata.name(c, '?')}" for c in sorted(unknown)
        )
        print(f"    ! {model}: dropping phonemes not in its id map ({detail}). "
              f"Pronunciation may suffer.")


class EdgeProvider:
    """Microsoft Edge 'Read Aloud'. Higher quality, but NOT redistributable.

    Microsoft's position is that this endpoint may not be used beyond personal
    use without an Azure subscription. Audio produced here must never be
    committed, published, or attached to a release. The guard below makes the
    accidental case impossible; the deliberate case is on you.
    """

    name = "edge"
    redistributable = False

    VOICE_MAP = {
        "m": ["de-DE-ConradNeural", "de-DE-KillianNeural", "de-DE-BerndNeural"],
        "f": ["de-DE-KatjaNeural", "de-DE-AmalaNeural", "de-DE-ElkeNeural"],
    }

    def __init__(self) -> None:
        if os.environ.get("CI", "").lower() in ("1", "true", "yes"):
            raise SystemExit(
                "Refusing to run the 'edge' provider under CI.\n"
                "Its output cannot be redistributed — see NOTICE. Use --provider piper."
            )
        print("\n  !! provider 'edge': output is NOT redistributable. Local use only.\n")

    def sample_rate(self, voice_key: str) -> int:
        return PROJEKT_SR

    def speak(self, text: str, voice_key: str, rate_percent: int = 0,
              deliberate: bool = False) -> np.ndarray:
        import asyncio
        import io

        import edge_tts

        rate = f"{rate_percent:+d}%" if rate_percent else "+0%"

        async def run() -> bytes:
            buf = io.BytesIO()
            comm = edge_tts.Communicate(text, voice_key, rate=rate)
            async for chunk in comm.stream():
                if chunk["type"] == "audio":
                    buf.write(chunk["data"])
            return buf.getvalue()

        data, sr = sf.read(io.BytesIO(asyncio.run(run())), dtype="float32")
        if data.ndim > 1:
            data = data.mean(axis=1)
        return dsp.resample(data.astype(np.float32), int(sr), PROJEKT_SR)


PROVIDERS = {"piper": PiperProvider, "edge": EdgeProvider}


# ---------------------------------------------------------------------------
# Role → voice assignment
# ---------------------------------------------------------------------------


def assign_voices(exam: dict[str, Any], narrator: str) -> dict[str, str]:
    """Bind every speaking role in the paper to one fixed voice.

    Two rules matter for a usable listening test. Within a single part, no two
    characters may share a voice, or the candidate cannot tell who is speaking —
    which is precisely what Teil 4 asks them to do. Across parts, a role name
    keeps its voice, so a rebuild is reproducible.
    """
    assigned: dict[str, str] = {NARRATOR: narrator}

    for teil in exam["hoeren"]["teile"]:
        used_here: set[str] = {narrator}
        roles = teil.get("sprecher", [])

        # Honour explicit overrides first, so a curated pairing always wins.
        for role in roles:
            if role.get("stimme"):
                key = role["stimme"]
                if key in EXCLUDED_VOICES:
                    raise SystemExit(
                        f"Role '{role['rolle']}' requests excluded voice {key}:\n"
                        f"  {EXCLUDED_VOICES[key]}"
                    )
                if key not in VOICES:
                    raise SystemExit(f"Role '{role['rolle']}' requests unknown voice {key}")
                assigned[role["rolle"]] = key
                used_here.add(key)

        for role in roles:
            name = role["rolle"]
            if name in assigned and role.get("stimme"):
                continue
            if name in assigned:
                used_here.add(assigned[name])
                continue

            pool = POOL[role["geschlecht"]]
            choice = next((v for v in pool if v not in used_here), None)
            if choice is None:
                # More same-sex characters in one part than we have voices.
                # Reuse is worse than nothing here, so say so loudly.
                raise SystemExit(
                    f"Hören Teil {teil['nummer']}: not enough distinct "
                    f"{role['geschlecht']} voices for role '{name}'. "
                    f"Add a 'stimme' override in exam.json, or reduce the cast."
                )
            assigned[name] = choice
            used_here.add(choice)

    return assigned


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------


@dataclass
class Cue:
    """A navigable point in a finished track, exposed to the web app."""
    label: str
    start: float
    end: float
    kind: str  # "ansage" | "text" | "wiederholung" | "pause"


@dataclass
class RenderedTeil:
    nummer: int
    audio: np.ndarray
    sample_rate: int
    cues: list[Cue] = field(default_factory=list)
    woerter: int = 0
    zeichen: int = 0
    sprechsekunden: float = 0.0

    @property
    def duration(self) -> float:
        return len(self.audio) / self.sample_rate

    @property
    def zps(self) -> float:
        """Characters per second — the unit the pace check actually uses."""
        return self.zeichen / self.sprechsekunden if self.sprechsekunden else 0.0

    @property
    def wpm(self) -> float:
        """Delivered pace, excluding pauses — the number to sanity-check.

        A real examination recording sits near 130 wpm. If this drifts far
        above, the paper is harder than the level it claims to test.
        """
        return self.woerter / (self.sprechsekunden / 60.0) if self.sprechsekunden else 0.0


def render_line(provider, line: dict[str, Any], voices: dict[str, str],
                rate: int, sr: int, tally: dict[str, float] | None = None
                ) -> np.ndarray:
    voice_key = voices[line["rolle"]]
    raw = provider.speak(line["text"], voice_key, rate_percent=rate,
                         deliberate=bool(line.get("betont")))
    if raw.size == 0:
        return raw
    staged = dsp.apply_akustik(raw, sr, line.get("akustik", "studio"))
    if tally is not None:
        # Measure the raw voice, not the staged audio: the mailbox beep and the
        # station chime are not speech, and counting them made a part look
        # slower than it is actually delivered.
        tally["woerter"] += len(line["text"].split())
        tally["zeichen"] += len(line["text"])
        tally["sekunden"] += len(raw) / sr
    pause = dsp.silence(sr, float(line.get("pauseDanachSek", 0.4)))
    return dsp.concat([staged, pause])


@dataclass
class Segment:
    key: str | None      # 'abschnitt' name, or None
    kind: str            # "ansage" (rubric, never repeated) | "text" (repeatable)
    lines: list[dict[str, Any]]


def segment_skript(skript: list[dict[str, Any]]) -> list[Segment]:
    """Split a script into runs of rubric and runs of repeatable content.

    A line is rubric only if the narrator speaks it *and* it sits outside any
    'abschnitt'. That second condition matters: in Teil 1 the narrator also says
    "Text eins", but that belongs to the short text and is replayed with it.

    Getting this wrong is not cosmetic. If every line counts as rubric, the
    repeatable body is empty and a part advertised as "Sie hören zweimal" is
    only ever heard once.
    """
    out: list[Segment] = []
    for line in skript:
        key = line.get("abschnitt")
        kind = "ansage" if (line["rolle"] == NARRATOR and key is None) else "text"
        if out and out[-1].key == key and out[-1].kind == kind:
            out[-1].lines.append(line)
        else:
            out.append(Segment(key, kind, [line]))
    return out


def render_teil(provider, teil: dict[str, Any], voices: dict[str, str],
                rate: int, sr: int) -> RenderedTeil:
    repeats = int(teil["wiederholungen"])
    segments = segment_skript(teil["skript"])
    has_abschnitte = any(s.key is not None for s in segments)

    parts: list[np.ndarray] = []
    cues: list[Cue] = []
    body: list[np.ndarray] = []
    clock = 0.0
    tally = {"woerter": 0.0, "zeichen": 0.0, "sekunden": 0.0}

    def emit(audio: np.ndarray, label: str, kind: str) -> None:
        nonlocal clock
        if audio.size == 0:
            return
        parts.append(audio)
        length = len(audio) / sr
        cues.append(Cue(label, round(clock, 2), round(clock + length, 2), kind))
        clock += length

    for seg in segments:
        block = dsp.concat(
            [render_line(provider, ln, voices, rate, sr, tally) for ln in seg.lines])

        if seg.kind == "ansage":
            emit(block, "Ansage", "ansage")
            continue

        body.append(block)
        emit(block, seg.key or "Text", "text")

        if seg.key is None:
            continue

        # Teil 1 repeats each short text in place; Teil 4 repeats the whole
        # discussion once at the end. Both are handled here because Teil 1 is
        # the only part whose script carries 'abschnitt' markers.
        if repeats > 1 and has_abschnitte:
            emit(dsp.silence(sr, PAUSE_VOR_WIEDERHOLUNG), "Pause", "pause")
            emit(block, f"{seg.key} (Wiederholung)", "wiederholung")
            emit(dsp.silence(sr, PAUSE_NACH_WIEDERHOLUNG), "Antwortzeit", "pause")

    if repeats > 1 and not has_abschnitte:
        # Whole-part repeat: re-announce, then play the body again. The leading
        # narrator rubric is not repeated.
        announce = render_line(
            provider,
            {"rolle": NARRATOR,
             "text": "Sie hören den Text jetzt noch einmal.",
             "pauseDanachSek": 2.0, "akustik": "studio"},
            voices, rate, sr,
        )
        emit(dsp.silence(sr, PAUSE_VOR_WIEDERHOLUNG), "Pause", "pause")
        emit(announce, "Ansage", "ansage")
        emit(dsp.concat(body), "Wiederholung", "wiederholung")

    emit(dsp.silence(sr, PAUSE_TEILENDE), "Antwortzeit", "pause")

    audio = dsp.normalise(dsp.concat(parts))
    return RenderedTeil(teil["nummer"], audio, sr, cues,
                        woerter=int(tally["woerter"]),
                        zeichen=int(tally["zeichen"]),
                        sprechsekunden=tally["sekunden"])


def render_sprechen_partner(provider, exam: dict[str, Any], voices: dict[str, str],
                            rate: int, sr: int) -> list[tuple[str, np.ndarray, dict]]:
    """Simulated partner turns, so a candidate without a partner can still sit
    Teile 1 and 3 under something close to real conditions."""
    out: list[tuple[str, np.ndarray, dict]] = []

    # A voice the candidate has not already heard as a Hören character, where
    # possible — the partner should feel like a new person.
    taken = set(voices.values())
    partner = next((v for v in POOL["f"] + POOL["m"] if v not in taken), "de_DE-kerstin-low")

    for teil in exam["sprechen"]["teile"]:
        for idx, turn in enumerate(teil.get("partnerSkript") or [], start=1):
            raw = provider.speak(turn["text"], partner, rate_percent=rate)
            audio = dsp.apply_akustik(raw, sr, "raum") if raw.size else raw
            name = f"sprechen_t{teil['nummer']}_partner_{idx:02d}"
            out.append((name, audio, {
                "teil": teil["nummer"],
                "index": idx,
                "wartenSek": turn["wartenSek"],
                "hinweis": turn.get("hinweis", ""),
                "text": turn["text"],
            }))
    return out, partner


# ---------------------------------------------------------------------------
# Encoding
# ---------------------------------------------------------------------------


PREFERRED_FORMATS = [("MP3", "mp3"), ("OGG", "ogg"), ("WAV", "wav")]


def pick_format() -> tuple[str, str]:
    """First encoder libsndfile actually supports. MP3 needs libsndfile >= 1.1."""
    available = set(sf.available_formats())
    for fmt, ext in PREFERRED_FORMATS:
        if fmt in available:
            return fmt, ext
    raise SystemExit("libsndfile offers none of MP3/OGG/WAV — cannot encode audio.")


def write_audio(path_stem: Path, audio: np.ndarray, sr: int,
                fmt: str, ext: str) -> Path:
    path = path_stem.with_suffix(f".{ext}")
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, dsp.to_int16(audio), sr, format=fmt,
             subtype="PCM_16" if fmt == "WAV" else None)
    return path


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def generate_exam(exam_id: str, exam: dict[str, Any], provider, args) -> None:
    out_dir = CONTENT / exam_id / "audio"
    out_dir.mkdir(parents=True, exist_ok=True)

    rate = int(exam["meta"].get("sprechtempoProzent", 0))
    voices = assign_voices(exam, args.narrator)
    sr = provider.sample_rate(args.narrator)
    fmt, ext = pick_format()

    # sprechtempoProzent is an offset on the delivered pace: -8 means eight per
    # cent slower than examination speed, so the target wpm drops accordingly.
    ziel_wpm = ZIEL_WPM * (1.0 + rate / 100.0)
    ziel_zps = ziel_wpm * ZEICHEN_PRO_WORT / 60.0

    print(f"\n{exam_id}  ({exam['meta']['niveau']}, Sprechtempo {rate:+d}%, "
          f"Ziel {ziel_wpm:.0f} wpm, {sr} Hz, {fmt})")
    for role, key in voices.items():
        spec = VOICES.get(key)
        detail = f"{spec.quality}, {spec.licence}" if spec else "external"
        pace = ""
        if hasattr(provider, "calibration"):
            pace = f"  ×{provider.calibration(key):.2f}"  # at reference length
        print(f"    {role:24} → {key}  ({detail}){pace}")

    manifest: dict[str, Any] = {
        "examId": exam_id,
        "provider": provider.name,
        "redistributable": provider.redistributable,
        "format": ext,
        "sampleRate": sr,
        "sprechtempoProzent": rate,
        "voices": dict(voices),
        "voiceLicences": {k: VOICES[k].licence for k in set(voices.values()) if k in VOICES},
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "hoeren": [],
        "sprechen": [],
    }

    full: list[np.ndarray] = []
    for teil in exam["hoeren"]["teile"]:
        if args.teil and teil["nummer"] != args.teil:
            continue
        started = time.time()
        rendered = render_teil(provider, teil, voices, rate, sr)
        path = write_audio(out_dir / f"hoeren_teil{teil['nummer']}", rendered.audio,
                           sr, fmt, ext)
        full.append(rendered.audio)
        print(f"    Teil {teil['nummer']}: {rendered.duration / 60:5.2f} min  "
              f"{rendered.woerter:4d} Wörter  {rendered.wpm:5.0f} wpm  "
              f"{rendered.zps:4.1f} Z/s  "
              f"→ {path.name}  ({time.time() - started:.0f}s)")
        # Some spread between parts is realistic and wanted: a station
        # announcement is not delivered like a conversation between friends.
        # This gate is for a part that is plainly wrong, not for texture.
        if rendered.zps and abs(rendered.zps - ziel_zps) / ziel_zps > PACE_TOLERANZ:
            print(f"      ! Teil {teil['nummer']} reads at {rendered.zps:.1f} "
                  f"Zeichen/s, target {ziel_zps:.1f}")
        manifest["hoeren"].append({
            "teil": teil["nummer"],
            "datei": path.name,
            "dauerSek": round(rendered.duration, 2),
            "wiederholungen": teil["wiederholungen"],
            "woerter": rendered.woerter,
            "wpm": round(rendered.wpm, 1),
            "zeichenProSek": round(rendered.zps, 2),
            "zielZeichenProSek": round(ziel_zps, 2),
            "cues": [c.__dict__ for c in rendered.cues],
        })

    if full and not args.teil:
        gap = dsp.silence(sr, PAUSE_ZWISCHEN_TEILEN)
        schluss = provider.speak(
            "Das ist das Ende des Moduls Hören.", args.narrator, rate_percent=rate)
        joined = dsp.concat(
            [seg for part in full for seg in (part, gap)]
            + [dsp.apply_akustik(schluss, sr, "studio")]
        )
        path = write_audio(out_dir / "hoeren_komplett", joined, sr, fmt, ext)
        total = len(joined) / sr / 60
        print(f"    komplett: {total:5.2f} min  → {path.name}")
        manifest["komplett"] = {"datei": path.name, "dauerSek": round(len(joined) / sr, 2)}
        if not ZIELDAUER_MIN <= total <= ZIELDAUER_MAX:
            print(f"    ! module audio runs {total:.1f} min; expected "
                  f"{ZIELDAUER_MIN:.0f}-{ZIELDAUER_MAX:.0f} min. Scripts are likely "
                  f"too short or too long for a realistic paper.")

    if not args.teil:
        turns, partner_voice = render_sprechen_partner(provider, exam, voices, rate, sr)
        manifest["sprechenPartnerStimme"] = partner_voice
        for name, audio, meta in turns:
            path = write_audio(out_dir / name, audio, sr, fmt, ext)
            manifest["sprechen"].append({**meta, "datei": path.name,
                                         "dauerSek": round(len(audio) / sr, 2)})
        if turns:
            print(f"    Sprechen: {len(turns)} Partner-Beiträge → {partner_voice}")

    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if not provider.redistributable:
        (out_dir / "DO-NOT-REDISTRIBUTE.txt").write_text(
            "Generated with the 'edge' provider (Microsoft Edge Read Aloud).\n"
            "This audio must not be committed, published or attached to a release.\n"
            "Regenerate with --provider piper before distributing. See NOTICE.\n",
            encoding="utf-8")
        print("    ! wrote DO-NOT-REDISTRIBUTE.txt — this audio is local-use only")


def main(argv: Iterable[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("exam", nargs="?", help="exam id, e.g. pruefung-01")
    ap.add_argument("--provider", choices=sorted(PROVIDERS), default="piper")
    ap.add_argument("--narrator", default=DEFAULT_NARRATOR, help="voice for the rubric")
    ap.add_argument("--teil", type=int, choices=[1, 2, 3, 4],
                    help="render a single listening part (skips the combined track)")
    ap.add_argument("--list-voices", action="store_true")
    ap.add_argument("--voice-preview", metavar="VOICE",
                    help="synthesise a sample sentence with one voice and exit")
    args = ap.parse_args(list(argv) if argv is not None else None)

    if args.list_voices:
        list_voices()
        return 0

    provider = PROVIDERS[args.provider]()

    if args.voice_preview:
        key = args.voice_preview
        if key in EXCLUDED_VOICES:
            print(f"{key} is excluded: {EXCLUDED_VOICES[key]}")
            return 1
        if key not in VOICES:
            print(f"Unknown voice {key}. Try --list-voices.")
            return 1
        sr = provider.sample_rate(key)
        text = ("Guten Tag. Dies ist eine Hörprobe für die Prüfung. "
                "Sie hören diesen Text zweimal.")
        audio = dsp.normalise(provider.speak(text, key))
        fmt, ext = pick_format()
        out = write_audio(Path.cwd() / f"voice-preview-{key}", audio, sr, fmt, ext)
        print(f"wrote {out}")
        return 0

    if not CONTENT.exists():
        print("No content/exams directory.")
        return 1

    folders = [f for f in sorted(CONTENT.iterdir())
               if f.is_dir() and (not args.exam or f.name == args.exam)]
    if not folders:
        print(f"No exam matching {args.exam!r}.")
        return 1

    for folder in folders:
        exam = json.loads((folder / "exam.json").read_text(encoding="utf-8"))
        generate_exam(folder.name, exam, provider, args)

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
