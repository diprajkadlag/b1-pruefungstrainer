# Changelog

Notable changes to this project. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

Exam content is versioned separately, per paper, in each `exam.json`
(`meta.contentVersion`).

## [1.12.0] — 2026-09-07

### Added

- **Sprechtraining B2: fifty complete speaking tasks in the B2 format.** B2
  Sprechen is a different examination from B1's, so this is not the B1 trainer
  with the numbers changed. Each task is a four-minute *Vortrag* with a choice
  of two topics and the four-part outline the exam prescribes (Einleitung, two
  Hauptteile, Schluss), followed by a five-minute debate on a contested
  question with four discussion points — each part worth 50 points. That is a
  hundred different talk topics and fifty different debates, no two alike
  across the collection.
- **Three culture notes per task**, one for each offered topic and one for the
  debate, each in German with an English gloss — a candidate who picks the
  second topic needs its background just as much as one who picks the first.
  The notes name the actual institutions and rules: Tarifautonomie under
  Art. 9 Abs. 3 GG and the *Allgemeinverbindlicherklärung*, the Betriebsrat's
  rights under the BetrVG, the 2024 Bürgergeld sanctions, which questions the
  Länder decide and which the Bund. Every task was reviewed by three
  independent adversarial passes — language and register, facts about Germany
  as of 2026, exam format — and then revised against the review sheets.
- **Model answers at B2 pace.** Both talks are written to the outline and
  checked to land between 400 and 500 words — at 110 words a minute, 3:38 to
  4:33 against the four-minute slot — with the count and the estimated time
  printed next to each, and the two talks built as two different ways of
  arguing rather than one template twice. The examiner's three follow-up
  questions are phrased to work after either talk, with model answers; the
  debate is a full model dialogue of 10 to 14 alternating turns in which the
  partner argues back to the end, timed for two speakers. Eight topic words
  with English glosses per topic.
- In the app under B2 → Sprechtraining, and as `sprechtraining-b2.pdf` on the
  release for offline work.

### Changed

- The speaking trainer is now one document per level. The B1 template became
  `sprechtraining_b1.tex.j2` and B2 has its own; the release attaches
  `sprechtraining-b1.pdf` and `sprechtraining-b2.pdf`, derived from what was
  built rather than named one by one — naming things one by one is what left
  A1 and A2 out of earlier releases. The `Sprechtraining` type is a union of
  the B1 and B2 shapes, and the validator checks each level's own format
  (five slides at B1, a four-point outline and a debate at B2) instead of B1's
  numbers nudged.

## [1.11.0] — 2026-08-24

### Added

- **Sprechtraining B1: fifty complete speaking tasks**, in the app and as a
  116-page PDF to work through offline. Each one is a whole examination's worth
  of Sprechen — a planning situation with five points, a presentation topic,
  and the feedback round — with fifty different topics and fifty different
  planning situations.
- **A culture note on every topic, which is the point of the collection.** A
  candidate who did not grow up in Germany cannot invent what is normal here,
  and no amount of grammar fixes that. Asked whether one should be reachable for
  work on holiday, you need to know that the legal minimum is 20 days' leave,
  that most employers give 28 to 30, that you name a *Vertretung* before you go,
  and that there is no legal right to be unreachable — which is exactly why
  the question is contested. Every note is written in simple German and repeated
  as an English gloss, and covers things like the Sunday closing law, the
  *duale Ausbildung*, Pfand and the four bins, *Sie* and *du*, Elternzeit and
  the Partnermonate, Bildungsurlaub, the Rundfunkbeitrag and the
  Haftpflichtversicherung.
- **Model answers that actually fit the time.** Each presentation answer is
  written to the five slides and checked to land between 240 and 390 words —
  at 90 words a minute, the pace of a learner reading a prepared presentation,
  that is 2:40 to 4:20 against a three-minute slot. The word count and the
  estimated speaking time are printed next to every answer, so a learner can see
  whether what *they* wrote fits. There is also a full model dialogue for Teil 1
  and the three turns of Teil 3, plus eight topic words with English glosses.

### Changed

- The trainer opens on the **task**, not on the answers. They are not secret —
  the second half of the book is solutions — but a model answer read before
  you have spoken is a text you agree with rather than something you produced,
  so the culture note and the answers sit one tab away.
- `validate.py --strict` now gates the trainer with the same checks the builder
  runs: five planning points, five slide answers, the word window, matching
  printed word counts, culture notes long enough to be worth reading, no
  repeated topic and no repeated planning situation.

### Fixed

- `release.yml` packaged `pdfs.zip` with a literal `\n` in the middle of the
  file list, so the shell was passed `\n` as a path. The command still
  succeeded, which is why it went unnoticed — zip skipped the bad argument
  and the archive was built from the remaining paths.

## [1.10.0] — 2026-08-21

### Added

- **The game makes a sound when you answer.** A rising fifth for right, a
  falling third pitched well below it for wrong — rising means yes and
  falling means no in every interface anyone has used, and the two differ by
  contour as well as pitch, so they stay apart for anyone who does not hear the
  interval clearly. Both are short and quiet: this is feedback, not a fanfare,
  and a game that startles someone on a train gets muted for good within two
  rounds.
- **A sound switch in the bar**, next to the lives and the score. On unless
  switched off, remembered between sessions, and switching it back on plays the
  sound — which is the only confirmation a sound switch can meaningfully
  give.

### Changed

- **Nothing was added to the repository to do it.** The notes are six numbers
  in `@pruefung/core` and are synthesised through Web Audio, for the same
  reasons the scenes are inline SVG: nothing to fetch, nothing to cache,
  nothing to license, and no binary in a repository whose premise is that the
  content is text. It also means the sounds work on a first visit offline,
  which a file pulled from the network would not.
- The audio context is created on first use rather than at load, because
  browsers refuse to start one outside a user gesture and an eagerly created
  context is born suspended and silent. It is also resumed if the tab suspended
  it, so coming back to a tab does not leave the rest of the session mute.
- Every part of this fails silently. No Web Audio, no output device, a policy
  that blocks the context — none of that is a reason to interrupt a round,
  and none of it is worth an error message about a beep.

## [1.9.0] — 2026-08-21

### Added

- **The history now outlives the round.** 1.8.0 let you go back to a card inside
  the round you were playing; this keeps them. **Frühere Karten** on the
  Sprachschatz screen lists every card you have answered at that level, newest
  first, each one expandable to its answer and its reason — including from
  rounds you played days ago.
- **Nur die falschen zeigen**, which is the useful view: the cards you actually
  keep getting wrong, in one list, with the explanation attached. Plus a running
  count — how many answered, how many wrong, what share right.
- **Verlauf löschen** clears that level's history on its own, without
  touching scores, the card schedule or anything the exam side stores.

### Changed

- **Only the record is stored, never the card.** An entry is the question's id,
  what you answered, whether it was right, and when — a few dozen bytes. The
  question, its solution and its explanation are generated again from the same
  cheat sheet that produced them in the first place. That keeps 300 answers per
  level well inside `localStorage`, and it means a correction to the content
  reaches the history too instead of leaving the old wording sitting in the
  browser for good. An entry whose card has since been edited out of the content
  drops out of the list quietly rather than rendering an empty row.
- History is kept per level and capped at the last 300 answers. The same card
  answered twice stays as two entries: getting it wrong in March and right in
  April is exactly the improvement worth being able to see.
- `docs/PRIVACY.md` now lists what the game stores, where, and how to clear it.

### Fixed

- The list of answered cards was styled through its container rather than
  through itself, so the copy of it on the Sprachschatz screen lost its layout:
  the tick sat jammed against the question instead of at the right-hand edge,
  and the browser's own disclosure triangles reappeared.

## [1.8.0] — 2026-08-21

### Added

- **You can go back to a card you have already answered.** The explanation is
  the part of the game that teaches, and until now it existed for one pause and
  was then gone for good — there was no way to look at it again, however
  much you wanted to. Every answered card is kept for the round, and **the
  stations on the path are the way back to them**: click one to reopen that
  card with what you picked, what was right, and the reason. Vorige and
  Nächste page through the ones you have done, and Zurück zur Runde
  puts you back where you were.
- **The result screen now lists the whole round**, every card with its
  question, your answer and the reason, each one expandable. The end of a round
  is exactly when you want to see what went wrong and why, and until now that
  screen showed four numbers and nothing to learn from.
- A missed station is marked **red** on the path and the one you are reading is
  **gold**, so a glance says which cards are worth going back to.

### Changed

- Reviewing is reading, never re-answering: the score, the streak and the lives
  cannot move while you look, and the answer buttons are not on screen at all.
  A reopened card is a different thing from a playing card, so it does not
  pretend to be one with its buttons greyed out.

### Fixed

- **Opening a past card cancels the pending auto-advance.** Without it the
  round moves on underneath someone who stepped back to read — they lose
  their place in the very act of trying to keep it. Coming back leaves the
  current card answered and waiting on its Weiter button rather than restarting
  a clock nobody was watching.
- A revisited station on the path lost its colour to the hover state and grew
  to the height of its (deliberately larger) touch target, because the hover
  rule out-specified the state classes and the `background` shorthand resets
  `background-clip`. Hover and focus are drawn as an outline now, so the colour
  on that path always means what it says.

## [1.7.2] — 2026-08-21

### Added

- **A Weiter button on every answered card.** However long the pause is, it is
  wrong for somebody — too slow for a reader who has finished, too fast for
  one who has not. The card still turns over on its own, so the round keeps
  flowing for anyone who leaves it alone, but nobody has to wait for it.

### Changed

- **The pause now scales with how much there is to read**, because a single
  number could never have worked. The explanations differ by more than
  elevenfold: an article card says its piece in six or seven words, while a
  grammar-table card carries the row *and* the rule behind it — thirty-five
  words at the median and past fifty at the top. 1.7.1 raised the pause by two
  seconds for everything, which left the short cards slightly slow and the long
  ones still unreadable. The pause is now the time to register right-or-wrong
  plus 380 ms a word, capped at 16 s.
  Measured on screen: a six-word plural card holds for **4.4 s**, a
  thirty-five-word grammar card for **15.2 s**. Both were 3.4 s.

### Fixed

- Clicking Weiter now cancels the pending auto-advance. Without that the timer
  would have fired behind the button a moment later and skipped the following
  card, which the learner would never have seen.

## [1.7.1] — 2026-08-20

### Fixed

- **The explanation was gone before it could be read.** A correct answer held
  the card for 900 ms — long enough to see the tick, nowhere near long enough
  to read the reason underneath it, which is the part that does the teaching.
  Both pauses are two seconds longer: **2.9 s** after a right answer and
  **4.6 s** after a wrong one, measured on screen at 3.4 s and 5.0 s.
- The end-to-end tests waited a hand-tuned number of milliseconds between
  cards, so they had to be retuned for the new pauses and would have needed it
  again on the next change. They now wait for the round to advance instead, and
  the two tests that play all twelve cards say out loud that a whole round
  takes longer than the default per-test budget.

## [1.7.0] — 2026-08-20

### Added

- **Sprachschatz — a learning game over the material that was already
  there.** Pick a level, pick **Wortschatz**, **Grammatik**, **Redemittel** or
  all three mixed, and get twelve cards and three lives. Nothing new had to be
  written: every question is generated from the same `lernhilfe.json` and
  `wortschatz.json` the cheat sheets are printed from, which is between 74 and
  976 distinct cards depending on the level and category.
- **Eleven question generators.** Article and plural of a noun, its meaning
  either way round, the opposite of an adjective, the Perfekt of an irregular
  verb, and a gap in the verb's own example sentence. A gap in a grammar table,
  and the rule behind a worked example. What a set phrase is *for*, which word
  is missing from it, and a word-order task that hands the words back shuffled.
- **A round can be replayed.** `?saat=12345` pins the seed, so a round deals
  the same twelve cards in the same order — useful when someone reports that
  a question was wrong, and what lets the end-to-end test play a whole round
  without the answers being written into the page for it to read.

### Changed

- **The design follows what is known about remembering, not what was easy to
  build.** Every distractor is drawn from the same group as the answer —
  another form of the same verb, another row of the same table, another noun
  from the same topic — because a wrong answer sampled at random is ruled
  out on sight without the memory ever being touched. Every answer carries its
  reason, right or wrong. Question kinds are interleaved rather than blocked. A
  miss drops a card to the bottom of a Leitner schedule and it returns almost
  immediately; a card you know goes quiet for longer. Progress is kept per
  level and per category, on the device, in `localStorage` — deliberately
  not in the IndexedDB database that holds every saved exam attempt.
- **Articles carry a colour**: der blue, die red, das green, on every screen and
  always the same. A noun's gender follows no rule worth learning, so it has to
  be stored as a property of the word itself, and a second, non-verbal channel
  is the cheapest way to make that stick. The verdict on an answered article
  card is drawn as a ring *around* the option rather than painted over it —
  repainting it green at the moment the answer lands would undo the association
  the game exists to build.
- Ten scenes are drawn as inline SVG in `currentColor`, so a card has a picture
  without a network request, a dark-mode variant of each file, or a licence
  question. Everything that moves is switched off under
  `prefers-reduced-motion`, and the game still reads and plays with all of it
  off.

### Fixed

- **The grammar generator asked nonsense on two thirds of the tables.** It took
  the last column of a table as the rule and the one before it as the example,
  which is true of `Satztyp · Beispiel · Regel` and false of most of
  the rest: it asked which "rule" applied to `den/dem/des Kunden` and offered
  four English glosses as the options, and on another table it showed the case
  column as the example and whole sentences as the rules. The columns are now
  identified from the header, and a table that does not clearly have both
  produces no questions at all — a missing question is better for a learner
  than a confusing one.
- **Wrong plurals had to be spellable to be worth offering.** The first version
  built distractors by concatenation and produced "die Nameer" and "die Fraü",
  which are ruled out without knowing anything. Endings now depend on the stem,
  `au` umlauts as a unit to `äu`, and the capital that starts every German
  noun is umlauted too, so Apfel → Äpfel is available as the near miss
  it really is.
- **A word could be marked wrong for being right.** "alt" is listed twice at A1,
  against "neu" for things and "jung" for people. Both are correct, and the
  first version offered each as a distractor for the other. Alternatives
  belonging to the same headword are now kept out of the distractor pool, the
  sense is named in the hint, and the two entries no longer collide in the
  Leitner schedule.
- Separable verbs mark both halves of the example — "Dagegen **wendet** er
  **ein**" — and only the first was being replaced by the gap, so the
  content's `**` markup reached the card as literal asterisks.

## [1.6.0] — 2026-08-20

### Added

- **A1 as a fourth examination level**, with **five complete papers**
  (`a1-pruefung-01` to `-05`) — twenty in all, five at each level. An A1
  paper is the shortest in the collection: three parts per receptive module,
  fifteen items each, a form and a thirty-word message, three speaking parts,
  a glossary built from its own sentences and about fourteen minutes of
  generated listening audio.
- **An A1 Spickzettel**, so all four levels have one: strategy for the four
  parts, 58 Redemittel, ten grammar tables covering exactly what the level
  tests — present-tense endings, the three articles, word order, the two
  cases, negation — plus 100 verbs with all principal parts and 100 nouns
  with article and plural. In the app and as an 11-page PDF.
- End-to-end coverage for A1 (`apps/web/e2e/a1.spec.ts`), including the three
  things no other test would catch: that a part scores **15 raw points** rather
  than a converted figure, that reading Teil 2 renders **two** answer boxes and
  not three, and that the form keeps its five entries across a reload.

### Changed

- **Scoring knows a third way of marking a paper.** B1 and B2 are modular. A2
  is one examination of 100 points with three pass conditions. **A1 is one
  examination with one condition**: 15 raw points per part, all sixty
  multiplied by **1.66** to reach 100, and 60 needed to pass. It sets no floor
  for the written parts and none for Sprechen — the regulations name a
  single condition, and the remark that a candidate under 35 written points
  cannot reach 60 is advice about whether to sit the oral, not a further way to
  fail. `GesamtRegel` therefore carries the factor, the rounding rule and two
  *optional* floors rather than assuming A2's shape.
- **Two task shapes the collection did not have.** A1 reading Teil 2 asks where
  a piece of information is to be found and offers exactly **two** places, so
  `zwei_optionen` exists as its own item type and prints two boxes on paper and
  on the answer sheet. A1 writing Teil 1 is a **form**: five labelled blanks,
  one point each, no word count and no model answer. Its labels reach the
  browser and its answers do not — `export_web.py` splits it field by field,
  and the entries travel to the teacher as readable `Feld: Eintrag` lines.
- The validator, the scaffolder and the PDF builder learned A1: its own
  `FORMATE` entry and part checks, a skeleton from `new_exam.py a1-pruefung-06`
  that `--strict` accepts, part names on the printed paper, speaking cards in
  all three parts, and an 8–16 minute window for the listening audio.

### Fixed

- **Every printed paper claimed the same totals.** The candidate sheet, the
  answer sheet and the speaking cards had “30 Aufgaben · 100 Punkte”
  hard-coded in the shared template, so every A2 paper released in 1.5.0 told
  its reader that a 20-item module was worth 100 points. All four documents now
  derive the counts and the maxima from the paper in hand.
- **The solution booklet explained B1's marking to every level.** Three
  paragraphs of B1 prose — the ×10/3 conversion, the 60-point module
  pass mark, the B1 criteria grid — were fixed in `loesungen.tex.j2`. They
  now come from a per-level table, so an A1 booklet describes A1's factor of
  1.66 and its single pass condition.
- The speaking section of every solution booklet printed the literal word
  “ightarrow” where an arrow belonged, from a `\rightarrow` that had
  lost its backslash.
- `check_lernhilfe` accepted a cheat sheet whose grade table was missing, which
  then failed inside LaTeX with an error naming a template line rather than the
  field.

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
