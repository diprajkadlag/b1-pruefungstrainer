# Changelog

Notable changes to this project. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

Exam content is versioned separately, per paper, in each `exam.json`
(`meta.contentVersion`).

## [1.5.0] — 2026-08-19

### Added

- **A2 as a third examination level**, with **five complete papers**
  (`a2-pruefung-01` to `-05`) — fifteen in all, five at each level. Every A2
  paper has four reading and four listening parts of five items each, an SMS
  and a half-formal email, three speaking parts, a glossary built from its own
  sentences and around seventeen minutes of generated listening audio. Their
  subjects are living and shopping; food, sport and travelling; clothes,
  offices and work; animals, health and books; and the post, courses and a
  community garden.
- **An A2 Spickzettel**, so all three levels have one: strategy and a timing
  plan for the four modules, 83 Redemittel weighted towards Sprechen and
  Schreiben, ten grammar tables covering what the level really tests — Perfekt
  with haben and sein, word order, separable verbs, the two cases, Konjunktiv
  for politeness — plus 103 verbs with all principal parts and 100 nouns with
  article and plural. In the app and as a 12-page PDF.
- End-to-end coverage for A2 (`apps/web/e2e/a2.spec.ts`), including the two
  things no other test would notice: that a full reading module scores **25**
  rather than 100, and that 17 of 20 right is **21.25** points and not 21.

### Changed

- **Scoring is level-aware, because A2 is not modular.** B1 and B2 award 100
  points per module and certify each on its own; A2 is one examination of 100
  points in which each part contributes at most 25, and passing it requires
  all three published conditions at once — 60 of 100 overall, 45 of 75 across
  Lesen, Hören and Schreiben together, and 15 of 25 in Sprechen. Miss any one
  and *"gilt die gesamte Prüfung als nicht bestanden"*.

  Everything that depends on this now reads it from one table (`BEWERTUNG` in
  `packages/core/src/scoring.ts`) instead of from constants: `bewerteModul`
  takes the level, `gesamtergebnis` reports the three conditions separately
  rather than collapsing them, and the examiner server derives the level from
  the paper id instead of assuming B1. A module at A2 carries **no verdict of
  its own** — `bestanden` and `note` are `null`, because neither is a fact
  about one answer sheet — and the result screen says why instead of leaving
  a blank card.
- Lesen, Hören and Schreiben at A2 are marked out of 20 raw Messpunkte and
  multiplied by **1.25**; Sprechen is scored out of 25 directly. Those quarter
  points are kept rather than rounded away, which is worth a quarter of a mark
  on every part of every paper.
- The validator, the scaffolder and the PDF builder all learned A2: its own
  `FORMATE` entry and part checks, a skeleton from `new_exam.py a2-pruefung-06`
  that `validate.py --strict` accepts, part names on the printed paper,
  speaking cards with prompt cards instead of slides, and a shorter target
  window for the listening audio (14–22 minutes rather than 27–36).
- An item may now legitimately have **no answer**: A2's small-ad task keys one
  item `x`, and the validator insists on exactly one such item per paper and
  refuses an ad used twice.

### Fixed

- `check_lernhilfe` did not require `ueberblick.noten`, so a cheat sheet
  missing its grade table failed later, inside LaTeX, with an error naming a
  template line rather than the field. That is precisely what that function
  exists to prevent.

## [1.4.0] — 2026-08-19

### Added

- **Two more B2 papers**, `b2-pruefung-04` and `-05`, bringing the collection to
  **ten complete papers, five at each level**. Their subjects are health,
  self-tracking, rural medical cover and how habits are actually changed; and
  repairing rather than discarding, further training alongside a job, and
  paying with cash or by card. Both carry the full apparatus: 30 reading and 30
  listening items with the sentence that settles each one, two writing tasks
  with annotated model answers at two grades, a talk and a debate, a glossary
  built from the paper's own sentences, and around half an hour of generated
  listening audio.
- **Every paper card names its course stage** — B1.1, B1.2, B2.1 or B2.2 —
  derived from the difficulty band in `meta.niveau`, and the PDF covers print it
  too. The start screen says in as many words what the label means, because it
  is easy to read the wrong thing into it: these are the stages a language
  school splits a level into for teaching. The certificate has no such split —
  it is one exam of four modules, sat together or one at a time — so there is no
  "B2.1 exam" to pass. `docs/EXAM-FORMAT.md` records the distinction and the
  table of what the band does change: speech rate, and how transparent the wrong
  answers are. Nothing else.

### Changed

- **The repository is now `german-exam-trainer`.** The old name outlived its
  accuracy the moment B2 shipped. The hosted app therefore moves to
  <https://diprajkadlag.github.io/german-exam-trainer/>; GitHub redirects the
  old repository URL, and the Pages workflow derives its base path from the
  repository name, so nothing had to be configured by hand. Badges, the app
  footer, the launcher, the schema `$id`, the release links, the CC BY
  attribution line and the `autor` field of every paper follow the new name.
- **The browser database keeps its old name on purpose.** It belongs to the
  browser, not to the project: renaming it would leave every saved attempt in an
  orphaned database that nothing ever opens again. The reason is now written
  where the constant is.
- The launcher fetches listening audio for all ten papers, and the two places
  that quoted a total download size quoted it wrong — it is around 180 MB, not
  "well over 300".

### Fixed

- The B2 cheat sheet printed **"Niveau B1"** in its running header on all 17
  pages: the template took its title from the level it was rendered for but had
  the level itself hard-coded from the days when there was only one.
- `npm run format:check` failed on a fresh Windows checkout while CI stayed
  green: `.gitattributes` pins `eol=lf` for TypeScript, Python and JSON but had
  never listed `.html` or `.css`, so those two were checked out with CRLF and
  Prettier — which expects LF — rejected them. Both extensions are pinned now.
- `b2-pruefung-05`'s listening module ran under the 27-minute floor, and two
  scripts explained why: the radio host asked for "ein Schlusssatz von jedem"
  and then thanked both guests without ever coming back to the second, and the
  lecture simply stopped mid-thought. Both now end as they promised to.
- The script that regenerates the README screenshots photographed the start
  screen without waiting for the paper list to arrive — a race that got harder
  to win with every paper added, and that loses silently into a committed
  image. It waits for the list now.

## [1.3.0] — 2026-08-19

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

- **A one-click launcher for people who clone the repo.** `Start-Trainer.bat`
  checks for Node and Python, installs what is missing, fetches the printable
  papers and — on request — the listening audio from the latest release, then
  builds the app and opens it. No terminal required.

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

- **Three parts could be answered without reading them.** An audit of the answer
  keys found a listening part whose five multiple-choice items were all keyed
  `b`, another whose five true/false items were all `falsch`, and — in the
  shipped `pruefung-05` — a reading part that was five *falsch* to one *richtig*.
  A candidate could tick one answer down the column and score them. All three
  are fixed, `validate.py` now refuses any part where one answer exceeds 80 % of
  the items, and `new_exam.py` rotates its placeholder keys so a scaffold cannot
  start out that way. `pruefung-05` goes to contentVersion 1.1.0; the other two
  were unreleased.
- `generate_audio.py` died on the first status line on any Windows console,
  before writing a single track: it prints an arrow and German role names but
  never reconfigured stdout to UTF-8, unlike the other tools. A test now asserts
  every command-line tool has that guard.
- GitHub did not detect the MIT licence because `LICENSE` carried an
  explanatory preamble, and the examiner server squatted port 3000 even when
  something else already held it.

## [1.2.0] — 2026-07-26

### Added

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

## [1.1.0] — 2026-07-26

### Added

- **Spickzettel — a cheat sheet**, built from `content/lernhilfe/` and shipped
  three ways: a tab in the app, an 18-page `spickzettel.pdf`, and a standalone
  release asset. It carries strategy and a timing plan for all four modules,
  ~185 Redemittel weighted towards Sprechen and Schreiben (including a block
  per presentation slide), 18 grammar topics as tables, the ten written errors
  that cost the most marks, and the core vocabulary — 123 verbs with all
  principal parts, 101 nouns with article and plural, 30 adjective pairs and
  the connectors. Searchable in the app.
- `tools/validate.py` now checks the cheat sheet too: all four modules present,
  no ragged grammar tables, no verb missing a principal part, no noun with a
  bogus article, and a warning if the Redemittel drift away from Sprechen and
  Schreiben.

### Fixed

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
