# Changelog

Notable changes to this project. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

Exam content is versioned separately, per paper, in each `exam.json`
(`meta.contentVersion`).

## [Unreleased]

### Added

- **B2 as a second examination level.** The level is a first-class dimension
  now: `meta.stufe` selects the whole rule set, and the item counts, task types,
  module times, repeat pattern and marking maxima are read from one table per
  level rather than hard-coded. `tools/validate.py`, `tools/new_exam.py`,
  `tools/build_pdf.py` and the app all follow it. B1 papers are unchanged and
  keep their ids; B2 papers are `b2-pruefung-NN`.
- **Three complete B2 papers**, `b2-pruefung-01` to `-03`, each with 30 reading
  and 30 listening items, two writing tasks with annotated model answers at two
  grades, a talk and a debate, a glossary built from the paper's own sentences
  and roughly half an hour of generated listening audio. Their subjects are the
  four-day week and urban noise; food, clubs and how groups decide; language,
  news and housing.
- **Three reading task types B1 never had**, end to end — inserting a sentence
  into a gap, matching an opinion to a heading, matching a regulation paragraph
  to a table of contents. They share one item type (`zuordnung_buchstabe`) and
  answer with a letter taken from a list on the Teil, which the app, the
  printed paper and the answer sheet all render from the data.
- **Level tabs on the start screen**, remembered between visits, with the module
  durations and the cheat sheet following the chosen level.
- **`docs/EXAM-FORMAT.md`** — the specification both levels are validated
  against, with the source of every number. `validate.py` had cited this file
  since the beginning; it had never been written.
- End-to-end coverage for B2 (`apps/web/e2e/b2.spec.ts`) and tests asserting
  that what `new_exam.py` scaffolds is exactly what `validate.py` demands, at
  both levels.
- **A B2 Spickzettel**, so both levels have one. Strategy and a timing plan for
  all four modules built around the B2 tasks, 105 Redemittel for the talk, the
  debate and the two written tasks, 16 grammar tables aimed at what B2 actually
  tests — concessive connectors, extended participial attributes, Konjunktiv I,
  the passive substitutes — a ten-entry list of the written mistakes that cost
  most marks, and 112 verbs with all principal parts plus 106 nouns of the
  abstract vocabulary B2 texts are built from. In the app, and as a 17-page PDF.
- The examiner view marks against the right criteria: B2's two writing tasks are
  weighted 60/40 and its speaking parts 50/50, with pronunciation folded into
  both rather than scored separately. The level is read from the paper id.

- **Spickzettel — a cheat sheet**, built from `content/lernhilfe/` and shipped
  three ways: a tab in the app, an 18-page `spickzettel.pdf`, and a standalone
  release asset. It carries strategy and a timing plan for all four modules,
  ~185 Redemittel weighted towards Sprechen and Schreiben (including a block
  per presentation slide), 18 grammar topics as tables, the ten written errors
  that cost the most marks, and the core vocabulary — 123 verbs with all
  principal parts, 101 nouns with article and plural, 30 adjective pairs and
  the connectors. Searchable in the app.
- **The printable papers are wired into the app.** `export_web.py` copies each
  paper's PDFs alongside its JSON, and the start screen offers the
  Kandidatenblätter, the Antwortbogen and the Sprechen-Karten for printing — so
  a paper can be sat on paper. The Lösungsheft is treated exactly like the JSON
  answer key: copied, but linked only from the result screen once an attempt is
  closed, which an end-to-end test asserts. Opened PDFs are cached for offline
  use, and the Pages deploy now builds them so the hosted demo carries them too.
  Where no LaTeX was available at build time the app says so and points at the
  release download instead of showing dead links.
- `tools/make_pdf_fixture.py`, the printable counterpart to the existing audio
  fixture: hand-rolled one-page PDFs so CI can exercise the download links —
  and the rule that hides the solution booklet — without installing TeX Live.
- `tools/validate.py` now checks the cheat sheet too: all four modules present,
  no ragged grammar tables, no verb missing a principal part, no noun with a
  bogus article, and a warning if the Redemittel drift away from Sprechen and
  Schreiben.

### Changed

- **The app is called GermanExamTrainer.** The header, the browser tab, the
  installable app, the examiner view and the launcher all use that name; the
  packages are `@pruefung/core` and `@pruefung/web` and the LaTeX package is
  `pruefung.sty`. The repository URL is unchanged, so existing links keep
  working.
- **The answer sheet is generated from the paper** instead of from hard-coded
  item ranges, so it follows whatever tasks a paper actually contains.
- `index.json` now carries each paper's `stufe`, and reports which levels ship a
  cheat sheet as `lernhilfeStufen` in place of the old `hatLernhilfe` flag.
- Topic-overlap and speaking-topic checks compare papers **within a level**; a
  B1 and a B2 paper may share a subject, since the tasks built on it are
  nothing alike.
- The cheat sheet is per level throughout: `content/lernhilfe/b2/` beside the
  B1 one, a `spickzettel.pdf` for each, both in the release, and the app's
  button following the level tab.
- Level-neutral naming reached the last user-visible strings: the browser
  tab, the installable app's name, the examiner view's title and the default
  Anki deck.

- Deploys cache the Piper voice models between runs (~250 MB), so building
  the hosted app no longer re-downloads them every time.

### Fixed

- `generate_audio.py` died on the first status line on any Windows console,
  before writing a single track: it prints an arrow and German role names but
  never reconfigured stdout to UTF-8, unlike the other tools. A test now asserts
  every command-line tool has that guard.

- The selected tab became unreadable on hover — `.knopf:hover` outranks
  `.knopf--aktiv`, so the white label was painted onto a pale background.
  Affected the results screen as well.
- `build_pdf.py` and `export_web.py` crashed instead of reporting when their
  output contained a character the console encoding could not represent, which
  is precisely what happens when LaTeX quotes a failing line back at them.

## [1.0.0] — 2026-07-26

### Added

- **Prüfung 01** — a complete practice paper: 30 reading items across five
  parts, 30 listening items across four, three writing tasks, a full speaking
  module, a 38-entry glossary and five grammar points with exercises.
- **Content pipeline.** One `exam.json` per paper drives the PDFs, the
  listening audio, the web app and the glossary. `tools/validate.py` encodes
  the examination specification as executable rules and gates every change.
- **Listening audio**, generated offline with Piper and staged acoustically —
  telephone band-pass for voicemail, chime and concourse reverb for station
  announcements, broadcast compression for radio. No ffmpeg required.
- **PDF output**: candidate sheets, answer sheet, speaking cards and a
  solution booklet with transcripts, model answers, glossary and grammar.
- **Web app** (React + TypeScript, installable PWA): exam-accurate timers with
  hard auto-submit, a listening player that refuses to pause or rewind,
  browser recording for the speaking module, instant marking of reading and
  listening, and a post-exam review with Anki export.
- **Optional local server** with an examiner view for marking writing and
  speaking, and self-signed TLS so a phone on the LAN can record.

### Security

- Answer keys are split out of the content the browser downloads and fetched
  only after an attempt closes. Enforced by `tools/check_no_leak.py` in CI and
  by an end-to-end test.
