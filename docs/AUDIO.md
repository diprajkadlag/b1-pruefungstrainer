# The listening audio

Every listening track is synthesised from the paper's own script. Nothing is
recorded, nothing is licensed from a stock library, and no ffmpeg is involved.

```bash
python tools/generate_audio.py                 # every paper
python tools/generate_audio.py b2-pruefung-01  # one
python tools/generate_audio.py --list-voices
python tools/generate_audio.py --voice-preview de_DE-kerstin-low
```

Output lands in `content/exams/<id>/audio/` — one MP3 per part, one combined
track for the whole module, the simulated speaking partner's turns, and a
`manifest.json` of durations and cue points that the app reads.

Audio is **never committed**. Ten papers is around 180 MB. It is rebuilt by
`pages.yml` for the hosted app and attached to releases as `audio-<paper>.zip`.

---

## Why this is harder than "call a TTS"

Three problems had to be solved before the output was usable as an exam.

### 1. The voices disagree on sample rate

Piper's German voices render at 16 kHz, 22.05 kHz or 24 kHz depending on the
model. Concatenated untouched, a 16 kHz voice plays 38 % fast and about a fifth
high — comical rather than difficult. Everything is resampled to one project
rate (22 050 Hz) before any mixing happens.

### 2. `length_scale` is not proportional to duration

Every Piper voice is faster than an examination recording; thorsten reads at
about 185 wpm untouched, where the target is 135. The obvious fix — scale the
length by the ratio — undershoots badly, because `length_scale` stretches the
phonemes while the silence around the utterance stays put. That padding is a
large share of a five-word line of dialogue and negligible in an eighty-word
narrated text.

So each voice gets a duration model, fitted once from four measurements (a
short text and a long one, each at two speeds):

```
duration(chars, scale) = pad + (c0 + c1 · scale) · chars
```

which is then solved per utterance. Short turns and long texts come out at the
same delivered pace.

Note the unit: **characters, not words.** Words are not a stable measure of
speech time in German — a narrated sentence full of *Veranstaltung* and
*Obergeschoss* carries far more syllables per word than *Und das machst du
allein?*. Calibrating on words left the conversation part running 25 % fast
while the monologue was on target; measured over the same utterances,
characters per second stayed within a few per cent.

Words per minute remains the human-facing target because that is the unit exam
guidance is written in. `ZEICHEN_PRO_WORT` converts between the two.

### 3. espeak decomposes the ich-Laut

espeak-ng emits /ç/ as `c` + U+0327 COMBINING CEDILLA. Only the highest-quality
voice model lists that combining mark in its phoneme id map; the rest silently
dropped it, turning /ç/ into /c/ and mispronouncing *ich*, *nicht*, *möchte* and
*richtig* throughout every paper. Phonemes are normalised to NFC before lookup,
which yields the precomposed U+00E7 that every model knows.

---

## Acoustic staging

A real listening module is not six studio recordings. It is a voicemail, a
station announcement, a radio discussion and a conversation in a room, and each
of those sounds different. Candidates trained on clean studio audio are
surprised on exam day by a tinny telephone message, so each line carries an
`akustik` value and is staged accordingly — all of it NumPy, in
`tools/audio_dsp.py`.

| Value | What it does |
|---|---|
| `studio` | Nothing but level matching. The narrator reading the rubric. |
| `telefon` | Band-pass to roughly 300–3400 Hz, compressed. |
| `mailbox` | The telephone band plus the answering-machine tone in front. |
| `durchsage` | Two-tone chime, then concourse reverb — a station or airport PA. |
| `radio` | Broadcast compression and a presence lift. |
| `raum` | A real room with a real microphone: short reverb, no colouration. |

The reverb is convolution against a synthetic exponentially-decaying noise
burst, which is entirely adequate for a station concourse and costs one FFT.

---

## Pacing and repeats

Pauses are not decoration; they are what makes a track sittable.

- The rubric line's own `pauseDanachSek` is the reading time before a part
  starts. It depends on how many items the candidate has to read first, so it
  lives in the content rather than in the code.
- Where a part is heard twice **and** its script is divided into `abschnitt`
  sections — B1's five short texts — each text is repeated in place, with a
  gap before the repeat and answering time after it.
- Where a part is heard twice as a whole, the narrator re-announces it
  ("Sie hören den Text jetzt noch einmal") and the body plays again. The
  leading rubric is not repeated.
- Where a part is heard **once**, nothing is inserted at all. At B2 that covers
  Teil 1, so the answering time has to come from the `pauseDanachSek` of the
  last line of each short text. Forget it and the candidate has ten items and
  no time to mark them.

A finished module should run 27–36 minutes. The generator says so if it does
not, and reports the delivered pace per part so a part that drifted is visible.

---

## Casting

Roles are bound to voices automatically, under two rules:

- **Within one part, no two characters share a voice.** Otherwise the candidate
  cannot tell who is speaking — which is exactly what the speaker-matching part
  asks them to do.
- **Across parts, a role name keeps its voice**, so a rebuild is reproducible.

Give every role a `geschlecht`. If a part needs more same-sex characters than
there are voices, the generator stops and says so rather than reusing one; add
an explicit `stimme` or reduce the cast.

`sprechtempoProzent` in `meta` shifts the target pace for the whole paper —
`-8` on the gentlest, `0` at full examination speed. It never goes up.

---

## Licensing

Only voices whose licences permit redistribution are available, because the
generated MP3s ship with the project. The registry in `generate_audio.py`
carries the licence next to each voice, and `NOTICE` reproduces them.

`de_DE-pavoque-low` is **refused in code**, with the reason next to the name:
its CC BY-NC-SA 4.0 NonCommercial term is incompatible with this project's
CC BY 4.0 content licence, which permits commercial reuse by teachers and
tutoring centres.

There is a second provider, `--provider edge`, which sounds better and is
**not** redistributable. It refuses to run under CI, prints a warning, and
writes a `DO-NOT-REDISTRIBUTE.txt` next to its output. Local use only.
