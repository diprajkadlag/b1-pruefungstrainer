# How the project is put together

One idea runs through everything: **the content is data and the code is
generic.** A paper is one JSON file. Adding a paper — at either level — is a
pull request that touches no code, and CI refuses to merge it unless it is
structurally sound.

```
content/exams/<id>/exam.json      the single source of truth for one paper
          │
   ┌──────┼─────────────┬──────────────┬───────────────┐
   ▼      ▼             ▼              ▼               ▼
validate  build_pdf  generate_audio  export_web   check_no_leak
   │         │            │              │              │
 CI gate  4 PDFs      MP3 + cues    public + keyed   CI gate
                                        halves
                                          │
                              apps/web (PWA)  ←→  apps/server (optional)
                                          └── @pruefung/core: shared scoring
```

---

## The one rule that shapes the design

**Nothing that reveals an answer may reach the browser before submission.**

That is why `export_web.py` does not simply copy `exam.json`. It splits every
paper in two:

- `exam.public.json` — texts, items, options. No key, no evidence, no
  rationale, not even the `kompetenz` tag.
- `exam.keys.json` — answers, evidence, rationales, transcripts, model answers,
  glossary, grammar. Fetched **only** once an attempt is closed.

The printable solution booklet gets the same treatment: copied to a URL, but
linked only from the result screen.

Three independent things enforce this, because convention is not enforcement:

1. `export_web.py` fails the build if a forbidden key survived the split.
2. `check_no_leak.py` re-checks the files that were actually written, in CI.
3. An end-to-end test watches the network while a module is open and fails if
   `exam.keys.json` is requested or the word `begruendung` appears in the DOM.

---

## The level is data too

`meta.stufe` selects the entire rule set. B1 and B2 share a pipeline and
disagree on nearly every number in it — item counts, which listening parts
repeat, how many writing tasks there are, what the answer sheet looks like — so
none of those numbers may be hard-coded.

They live in exactly three places, and the three must move together:

| Where | Drives |
|---|---|
| [`EXAM-FORMAT.md`](EXAM-FORMAT.md) | the written source, with a citation for every number |
| `FORMATE` in `tools/validate.py` | content validation, the CI gate |
| `STUFEN` in `packages/core/src/stufen.ts` | the app, before a paper is loaded |

Once a paper *is* loaded, the app reads its times and counts from the file
itself — the table only covers the gap before that.

---

## The pieces

### `packages/core`

Scoring, grade bands, the level table and the shared types. Imported by both
the web app and the server, so a result cannot be computed two different ways
depending on where it was calculated. The types mirror
`packages/schema/exam.schema.json`, which is the authority.

Raw items convert to the 100-point scale with a deliberate rounding rule: 30
items do not divide 100 evenly, so 18/30 must become exactly 60 and pass while
17/30 becomes 57 and does not. Getting that wrong moves the pass boundary.

### `packages/schema`

JSON Schema for a paper. It enforces *shape* — required fields, enums, string
lengths, and the per-level module and task counts. It deliberately does not
enforce the pairing between an item's type and its legal answers, or item
counts per part; those are semantic and live in the validator, where the error
messages can explain themselves.

### `tools/`

Five commands, all standard-library-or-close and all runnable on their own:

| Tool | Does |
|---|---|
| `validate.py` | the examination specification as executable rules |
| `new_exam.py` | scaffolds a paper with the right shape for its level |
| `generate_audio.py` | synthesises the listening tracks — see [AUDIO.md](AUDIO.md) |
| `build_pdf.py` | renders four PDFs per paper, plus a cheat sheet per level |
| `export_web.py` | splits each paper and writes the registry the app reads |

`check_no_leak.py`, `make_audio_fixture.py` and `make_pdf_fixture.py` exist for
CI. The two fixtures stand in for the real audio and PDFs so end-to-end tests
can exercise the player and the download links without installing Piper's voice
models or TeX Live.

### `apps/web`

React and TypeScript, an installable PWA. Notable behaviour:

- The countdown derives from a **wall-clock deadline**, so reloading the page
  does not hand back minutes, and running out hard-submits the module.
- The listening player has one start button and nothing else — no pause, no
  seek, no second listen. Parts heard twice contain the repeat inside the audio.
- Answers autosave to IndexedDB on a debounce, so a crash costs a second of
  typing rather than a module.
- Speaking is recorded in the browser. Nothing is uploaded; the writing and the
  recordings package into a ZIP the candidate hands to a teacher.

### `apps/server`

Optional. When the app is served by it, submissions are pushed there too, so a
teacher finds the work on disk instead of waiting for an emailed ZIP. It also
serves an examiner view at `/pruefer` that shows the writing beside the marking
criteria **for that paper's level** and the recordings with inline players.

Detection is a probe rather than a build flag, so the same bundle works on
GitHub Pages and behind the server without being rebuilt.

Never put it on the public internet — it has no authentication.

---

## What CI actually checks

- Every paper against the specification for its level, `--strict`
- That no answer data reached the public export
- TypeScript, ESLint, Prettier over the whole tree including `content/**.json`
- Unit tests with a coverage floor on `packages/core`
- The Python tools
- End-to-end in Chromium, against a real build with fixture audio and PDFs

A green run means a paper is safe to put in front of a learner. That is the
whole point of the gate.
