# Writing a new exam

Adding a paper needs no code change. Scaffold it, write it, and let the
validator tell you what is still wrong:

```bash
python tools/new_exam.py pruefung-06        # B1
python tools/new_exam.py b2-pruefung-02    # B2 — the level comes from the id
python tools/validate.py pruefung-06 --strict
```

---

## Rule 1: everything is original

**Nothing may be copied, transcribed, translated or paraphrased** from an
official model set or past paper, from a commercial preparation book, or from
any other copyrighted source.

Following the examination *format* — five reading parts, 30 items, 65 minutes —
is fine, because a format is a published set of facts. Reusing the *content* of
somebody's paper is not. This is the difference that lets the project exist.

Practical consequences:

- Invent every publication, company, street and person name. `Lindenauer
  Anzeiger`, `Autowerkstatt Kowalski`, `Freilichtmuseum Hohenrode` are all made
  up, and yours should be too.
- Do not write about a real, identifiable private individual.
- Do not paste a real newspaper article and "simplify" it. Write your own on
  the same topic.
- Do not reuse a real exam's situations, ads or forum posts even reworded.

Every pull request touching `content/` affirms this on the checklist.

---

## Rule 2: an item is only as good as its evidence

Every scored item must carry `beleg` — the exact sentence from the text or
script that proves the key. If you cannot quote one sentence that settles it,
the item is ambiguous and does not belong in a test.

```json
{
  "nr": 11,
  "typ": "multiple_choice",
  "frage": "Woran scheitern die Reparaturen am häufigsten?",
  "optionen": { "a": "Es fehlen Ersatzteile.", "b": "…", "c": "…" },
  "loesung": "a",
  "beleg": "Am häufigsten scheitern die Reparaturen nicht an den Helfern, sondern an fehlenden Ersatzteilen.",
  "kompetenz": "detailverstehen",
  "begruendung": {
    "de": "Der Satz nennt den Grund direkt und schließt die Helfer ausdrücklich aus.",
    "en": "The „nicht … sondern …“ construction rules out b and states a."
  }
}
```

`begruendung.de` says why the key is right. **`begruendung.en` explains why the
distractors are wrong** — that is the part learners actually need, and it is
what the app shows after the exam.

---

## Rule 3: distractors must be wrong for a reason

A good distractor is not random. It is usually one of:

| Kind | Example |
|---|---|
| A real word from the text, in the wrong role | The text says the city gives *rooms*; option a says the city gives *money* |
| A number from the neighbouring rule | DVDs are two weeks, so "two weeks" is offered for books |
| What somebody **fears** rather than what **is** | Shopkeepers fear losing customers; the study shows the opposite |
| The opening position of an opinion text | "Ich war skeptisch …" before the writer changes their mind |
| A plausible statement the text never makes | Nothing about city size, though it sounds sensible |

Avoid distractors that are wrong because they are absurd. They test nothing.

And check your keys at the end. If a whole part came out keyed `b`, do not
re-key an item to fix the arithmetic — that breaks the evidence. Reorder the
three options instead, or find a different sentence in the same text to ask
about. The validator will tell you; it is checking the same thing a candidate
would notice.

---

## The specification, as the validator enforces it

The full table for both levels, with the source of every number, is in
[EXAM-FORMAT.md](EXAM-FORMAT.md). In short:

| Modul | B1 | B2 |
|---|---|---|
| Lesen | 65 min · 6+6+7+7+4 = 30 | 65 min · 9+6+6+6+3 = 30 |
| Hören | 40 min · 10+5+7+8 = 30 | 40 min · 10+6+6+8 = 30 |
| Schreiben | 60 min · 40+40+20 = 100 | 75 min · 60+40 = 100 |
| Sprechen | 15 min prep · 28+40+16 + 16 Aussprache | 15 min prep · 50+50 |

Also enforced, at whichever level applies:

- Items numbered 1–30 exactly once per module
- **No part may be answerable without reading it**: within one part, no single
  answer may account for more than 80 % of the items of the same type. Real
  papers are lopsided and that is fine — four *falsch* to two *richtig* passes.
  What fails is a part where every multiple-choice item is keyed `b`.
- **B1 Lesen Teil 3**: exactly ten ads `a`–`j`, exactly one situation keyed `0`,
  no ad used twice
- **B2 Lesen Teile 2, 4, 5**: eight lettered alternatives, no letter answering
  two items, the worked example's letter spent, and at least one left unused
- **B2 Lesen Teile 2 and 5**: every item number appears exactly once in the text
  as a gap marker `[10]`, and no marker is orphaned
- **B2 Lesen Teil 1**: four forum posts labelled `a`–`d`, and every item's four
  options naming those same four writers
- **Hören Teil 1** at both levels: exactly five short texts, each with one
  `richtig_falsch` and one `multiple_choice` item
- **Which parts repeat**: B1 hears Teile 1 and 4 twice, **B2 hears 2 and 4**
- **The speaker-matching part** (B1 Teil 4, B2 Teil 3): a host and exactly two
  guests; try to key at least one item to each
- Every `glossar` lemma occurs somewhere in the paper, every `grammatik`
  `belegSatz` is a real sentence from it, and every `fundstelle` names a Teil
  that exists at this level
- Speaking presentation topics never repeat across papers **of the same level**

---

## Writing the listening scripts

Aim for **roughly 30 minutes of audio** across the module. The generator warns
if you miss it. As a guide, at exam pace (~130 wpm):

**B1**

| Teil | Words | Notes |
|---|---|---|
| 1 | ~80 per short text, five of them | Each is heard twice |
| 2 | 450–550 | One speaker, heard once |
| 3 | 450–550 | Two speakers, heard once |
| 4 | 600–750 | Three speakers, heard **twice** — this is the long one |

**B2**

| Teil | Words | Notes |
|---|---|---|
| 1 | ~85 per short text, five of them | Heard **once** — leave answering time in `pauseDanachSek` |
| 2 | 500–580 | Interview, two speakers, heard **twice** |
| 3 | 520–620 | Three speakers, heard once |
| 4 | 600–700 | One speaker, heard **twice** — this is the long one |

At B1 the repeats fall on the first and last parts, at B2 on the second and
fourth. Because B2's short texts are heard only once, the answering time has to
come from the `pauseDanachSek` of the last line of each text — nothing else
inserts it.

Mark the line carrying each answer with `"betont": true`. It is read very
slightly more deliberately, as a real reader would.

Use `akustik` to place the text somewhere real:

| Value | Sounds like |
|---|---|
| `studio` | The narrator reading the rubric |
| `mailbox` | An answering machine, with the beep |
| `telefon` | A phone call — narrowband, compressed |
| `durchsage` | A station or airport announcement, with chime and reverb |
| `radio` | Broadcast — compressed, present |
| `raum` | Two people in an actual room |

Give each role a `geschlecht`; voices are assigned automatically and no two
characters in one part will ever share one. If a part needs more same-sex
characters than there are voices, the generator stops and tells you — add an
explicit `stimme` or reduce the cast.

---

## Difficulty

`stufe` picks the format. Within a level, `niveau` is `mittel-leicht` or
`mittel`, and `sprechtempoProzent` slows the audio (`-8` on the gentlest paper,
`0` at full exam speed).

A *mittel-leicht* paper differs by being **more transparent, not shorter**:
distractors are further from the key, the answer-bearing sentence is closer to
the surface, and fewer items depend on tracking a pronoun across sentences.
Never make it easier by dropping below the level's vocabulary range — that
trains the wrong level.

At B1, keep to the B1 range; a handful of `B1+` glossary items per paper is
realistic, a text full of them is not. At B2 the difficulty is less about rare
words than about how much has to be held in mind at once: opinions that turn
mid-paragraph, concessive connectors that reverse a sentence you have already
half-read, and extended participial attributes between an article and its noun.
Write those in deliberately — they are what the level actually tests.

---

## Topics

Pick a set that no existing paper uses — the validator warns on overlap and
fails on a repeated speaking topic.

**Erwachsene**: work, applications, housing and moving, insurance, further
training, consumer rights, mobility, health, volunteering, neighbourhood.

**Erwachsene, B2** can go further into the abstract, because the tasks demand a
position rather than a preference: working-time models, urban planning, consumer
habits, science in everyday life, education policy, the effects of technology on
how we learn or remember.

**Jugendliche**: school, homework, hobbies, sport, phones and social media,
pocket money, friendship, class trips, part-time jobs, family rules.

Avoid anything that could distress a candidate under time pressure: illness in
the family, bereavement, violence, politics of a live conflict, religion.

---

## Before you open the pull request

```bash
python tools/validate.py pruefung-06 --strict   # must be clean
python tools/generate_audio.py pruefung-06      # listen to it, all the way
python tools/build_pdf.py pruefung-06           # look at the PDFs
python tools/export_web.py && npm run dev       # sit it yourself
```

Sitting your own paper catches more problems than any tool. If an item feels
arguable to you, it will be arguable to a candidate.
