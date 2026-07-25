"""Acoustic staging for listening tracks — pure NumPy, no ffmpeg, no SciPy.

A B1 listening paper is not a single person reading in a booth. It is a voicemail,
a station announcement, a radio discussion and a guided tour, and each of those
sounds different in real life. Candidates who only ever practise with clean
studio audio are surprised on exam day by a tinny telephone message.

Every function here takes and returns mono float32 in roughly [-1, 1]. Filtering
is done in the frequency domain because an FFT is exact, dependency-free and
fast enough at these durations — a few seconds of speech is a trivial transform.

    from audio_dsp import apply_akustik
    staged = apply_akustik(samples, sample_rate, "mailbox")
"""

from __future__ import annotations

import numpy as np

# Perceptual target for every finished track. -20 dBFS RMS is a conventional
# speech level: loud enough on laptop speakers, with headroom for peaks.
TARGET_RMS_DBFS = -20.0
PEAK_CEILING = 0.94

AKUSTIK_MODES = ("studio", "telefon", "mailbox", "durchsage", "radio", "raum")


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------


def _rfft_filter(x: np.ndarray, sr: int, gain_at: callable) -> np.ndarray:
    """Apply an arbitrary magnitude response, described as gain(freq_hz)."""
    if x.size == 0:
        return x
    spectrum = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(x.size, d=1.0 / sr)
    return np.fft.irfft(spectrum * gain_at(freqs), n=x.size).astype(np.float32)


def bandpass(x: np.ndarray, sr: int, low: float, high: float,
             rolloff_octaves: float = 0.5) -> np.ndarray:
    """Band-pass with smooth skirts.

    Brick-wall filtering rings audibly, so the edges fall off over a fraction of
    an octave, which is much closer to how a real telephone or PA behaves.
    """
    def gain(f: np.ndarray) -> np.ndarray:
        g = np.ones_like(f)
        with np.errstate(divide="ignore", invalid="ignore"):
            below = f < low
            g[below] = np.clip(
                1.0 + np.log2(np.maximum(f[below], 1e-6) / low) / rolloff_octaves, 0.0, 1.0
            )
            above = f > high
            g[above] = np.clip(
                1.0 - np.log2(f[above] / high) / rolloff_octaves, 0.0, 1.0
            )
        g[0] = 0.0  # always remove DC
        return g

    return _rfft_filter(x, sr, gain)


def shelf(x: np.ndarray, sr: int, freq: float, gain_db: float,
          kind: str = "high") -> np.ndarray:
    """Gentle shelving EQ, used to add presence or remove mud."""
    amount = 10.0 ** (gain_db / 20.0)

    def gain(f: np.ndarray) -> np.ndarray:
        # A smooth transition centred on `freq`, one octave wide.
        with np.errstate(divide="ignore", invalid="ignore"):
            t = 1.0 / (1.0 + (np.maximum(f, 1e-6) / freq) ** -2)
        if kind == "low":
            t = 1.0 - t
        return 1.0 + (amount - 1.0) * t

    return _rfft_filter(x, sr, gain)


def compress(x: np.ndarray, sr: int, threshold_db: float = -24.0,
             ratio: float = 4.0, attack_ms: float = 5.0,
             release_ms: float = 120.0, makeup_db: float | None = None) -> np.ndarray:
    """Soft-knee compressor with a one-pole envelope follower.

    Broadcast and PA audio is always compressed: it is what makes an
    announcement cut through background noise without ever getting loud.
    """
    if x.size == 0:
        return x

    threshold = 10.0 ** (threshold_db / 20.0)
    attack = float(np.exp(-1.0 / (sr * attack_ms / 1000.0)))
    release = float(np.exp(-1.0 / (sr * release_ms / 1000.0)))

    # Envelope follower: fast to rise, slow to fall.
    rectified = np.abs(x)
    env = np.empty_like(rectified)
    running = 0.0
    for i, sample in enumerate(rectified):
        coeff = attack if sample > running else release
        running = coeff * running + (1.0 - coeff) * sample
        env[i] = running

    with np.errstate(divide="ignore", invalid="ignore"):
        over = np.maximum(env / threshold, 1e-9)
    gain = np.where(over > 1.0, over ** (1.0 / ratio - 1.0), 1.0)

    if makeup_db is None:
        # Restore roughly what the ratio took away at a typical speech level.
        makeup_db = -threshold_db * (1.0 - 1.0 / ratio) * 0.5
    return (x * gain * 10.0 ** (makeup_db / 20.0)).astype(np.float32)


def _impulse_response(sr: int, seconds: float, decay: float,
                      predelay_ms: float, seed: int) -> np.ndarray:
    """Synthetic exponentially-decaying noise burst — a serviceable reverb tail.

    Deterministic via `seed` so a rebuild produces byte-identical audio.
    """
    rng = np.random.default_rng(seed)
    n = max(int(sr * seconds), 1)
    t = np.arange(n) / sr
    ir = rng.standard_normal(n) * np.exp(-decay * t)
    # Damp the tail's high frequencies, as real rooms do.
    ir = bandpass(ir.astype(np.float32), sr, 120.0, 6000.0)
    pre = np.zeros(int(sr * predelay_ms / 1000.0), dtype=np.float32)
    ir = np.concatenate([pre, ir])
    return (ir / (np.linalg.norm(ir) + 1e-9)).astype(np.float32)


def reverb(x: np.ndarray, sr: int, seconds: float, decay: float,
           mix: float, predelay_ms: float = 12.0, seed: int = 7) -> np.ndarray:
    """Convolution reverb via FFT. `mix` is the wet proportion, 0..1."""
    if x.size == 0 or mix <= 0.0:
        return x
    ir = _impulse_response(sr, seconds, decay, predelay_ms, seed)
    n = x.size + ir.size - 1
    fft_len = 1 << (n - 1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, fft_len) * np.fft.rfft(ir, fft_len), fft_len)[:x.size]
    wet = wet.astype(np.float32)
    # Match wet level to dry before mixing, so `mix` behaves predictably.
    wet *= (rms(x) / (rms(wet) + 1e-9))
    return ((1.0 - mix) * x + mix * wet).astype(np.float32)


def chime(sr: int, freqs: tuple[float, ...] = (880.0, 1174.7),
          seconds: float = 0.55, level: float = 0.22) -> np.ndarray:
    """Two-tone station chime, the classic PA attention signal."""
    t = np.arange(int(sr * seconds)) / sr
    out = np.zeros_like(t)
    per_tone = seconds / len(freqs)
    for i, f in enumerate(freqs):
        start, end = int(i * per_tone * sr), int((i + 1.6) * per_tone * sr)
        end = min(end, t.size)
        if end <= start:
            continue
        local = np.arange(end - start) / sr
        envelope = np.exp(-6.0 * local)
        out[start:end] += np.sin(2 * np.pi * f * local) * envelope
    return (out * level).astype(np.float32)


def beep(sr: int, freq: float = 1000.0, seconds: float = 0.28,
         level: float = 0.18) -> np.ndarray:
    """Answering-machine tone."""
    t = np.arange(int(sr * seconds)) / sr
    # Short fades stop the tone clicking at its edges.
    fade = np.minimum(np.minimum(t, seconds - t) / 0.01, 1.0)
    return (np.sin(2 * np.pi * freq * t) * fade * level).astype(np.float32)


def silence(sr: int, seconds: float) -> np.ndarray:
    return np.zeros(max(int(sr * seconds), 0), dtype=np.float32)


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)))) if x.size else 0.0


def normalise(x: np.ndarray, target_dbfs: float = TARGET_RMS_DBFS,
              ceiling: float = PEAK_CEILING) -> np.ndarray:
    """Level to a common RMS, then guarantee no clipping.

    Applied to every finished track so the candidate never has to reach for the
    volume control between parts — which they cannot do in a real exam either.
    """
    current = rms(x)
    if current < 1e-9:
        return x
    x = x * (10.0 ** (target_dbfs / 20.0) / current)
    peak = float(np.max(np.abs(x)))
    if peak > ceiling:
        x = x * (ceiling / peak)
    return x.astype(np.float32)


# ---------------------------------------------------------------------------
# Named staging presets
# ---------------------------------------------------------------------------


def apply_akustik(x: np.ndarray, sr: int, mode: str) -> np.ndarray:
    """Stage one utterance as the named acoustic environment.

    The presets are deliberately understated. The goal is that a candidate
    immediately recognises "this is a phone message" without the speech becoming
    any harder to understand than it is in a real examination recording.
    """
    if mode not in AKUSTIK_MODES:
        raise ValueError(f"unknown akustik mode {mode!r}; expected one of {AKUSTIK_MODES}")

    if mode == "studio":
        return normalise(x)

    if mode in ("telefon", "mailbox"):
        # Narrowband G.712-ish telephone channel plus the heavy compression a
        # phone line applies. Mailbox additionally gets the answering tone,
        # which the caller in the recording would have heard too.
        y = bandpass(x, sr, 300.0, 3400.0, rolloff_octaves=0.35)
        y = compress(y, sr, threshold_db=-26.0, ratio=5.0)
        y = normalise(y, TARGET_RMS_DBFS - 1.0)
        if mode == "mailbox":
            y = np.concatenate([beep(sr), silence(sr, 0.35), y])
        return y.astype(np.float32)

    if mode == "durchsage":
        # Public address: restricted band, hard compression, and the long
        # reflective tail of a concourse.
        y = bandpass(x, sr, 220.0, 5000.0, rolloff_octaves=0.6)
        y = compress(y, sr, threshold_db=-28.0, ratio=6.0)
        y = reverb(y, sr, seconds=1.4, decay=3.2, mix=0.26, predelay_ms=28.0, seed=11)
        y = normalise(y, TARGET_RMS_DBFS - 0.5)
        return np.concatenate([chime(sr), silence(sr, 0.25), y]).astype(np.float32)

    if mode == "radio":
        # Broadcast chain: presence lift, tight compression, no room at all.
        y = shelf(x, sr, 3200.0, 2.5, kind="high")
        y = shelf(y, sr, 120.0, -2.0, kind="low")
        y = compress(y, sr, threshold_db=-22.0, ratio=3.5, release_ms=90.0)
        return normalise(y)

    # "raum": a real room with a real microphone — the tour guide, the canteen.
    y = reverb(x, sr, seconds=0.55, decay=7.0, mix=0.16, predelay_ms=9.0, seed=23)
    y = compress(y, sr, threshold_db=-26.0, ratio=2.5)
    return normalise(y)


def resample(x: np.ndarray, sr_in: int, sr_out: int) -> np.ndarray:
    """Band-limited resampling by rebuilding the spectrum at the new length.

    Piper's German voices do not agree on a sample rate — thorsten renders at
    22.05 kHz, kerstin at 16 kHz. Concatenating them without conversion plays
    the 16 kHz voices 38 % too fast and a fifth too high, which is both comical
    and unusable as exam material. Everything is converted to one project rate
    before it is mixed.

    FFT resampling rather than linear interpolation: upsampling speech with
    linear interpolation folds audible aliasing into the top octave, and voice
    clarity is the entire point of a listening test.
    """
    if sr_in == sr_out or x.size == 0:
        return x.astype(np.float32)

    n_out = int(round(x.size * sr_out / sr_in))
    if n_out <= 0:
        return np.zeros(0, dtype=np.float32)

    spectrum = np.fft.rfft(x)
    out_bins = n_out // 2 + 1
    resized = np.zeros(out_bins, dtype=complex)
    keep = min(spectrum.size, out_bins)
    resized[:keep] = spectrum[:keep]
    # irfft normalises by the output length, so rescale to preserve amplitude.
    return (np.fft.irfft(resized, n_out) * (n_out / x.size)).astype(np.float32)


def concat(parts: list[np.ndarray]) -> np.ndarray:
    """Join segments, tolerating empty ones."""
    kept = [p for p in parts if p is not None and p.size]
    if not kept:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(kept).astype(np.float32)


def to_int16(x: np.ndarray) -> np.ndarray:
    return np.clip(x, -1.0, 1.0).__mul__(32767.0).astype(np.int16)
