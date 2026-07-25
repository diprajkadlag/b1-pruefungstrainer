# Writing a new exam

Adding a paper needs no code change. Scaffold it, write it, and let the
validator tell you what is still wrong:

```bash
python tools/new_exam.py pruefung-06
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

A good B1 distractor is not random. It is usually one of:

| Kind | Example |
|---|---|
| A real word from the text, in the wrong role | The text says the city gives *rooms*; option a says the city gives *money* |
| A number from the neighbouring rule | DVDs are two weeks, so "two weeks" is offered for books |
| What somebody **fears** rather than what **is** | Shopkeepers fear losing customers; the study shows the opposite |
| The opening position of an opinion text | "Ich war skeptisch …" before the writer changes their mind |
| A plausible statement the text never makes | Nothing about city size, though it sounds sensible |

Avoid distractors that are wrong because they are absurd. They test nothing.

---

## The specification, as the validator enforces it

| Modul | Zeit | Teile | Items |
|---|---|---|---|
| Lesen | 65 min | 5 | 6 + 6 + 7 + 7 + 4 = 30 |
| Hören | 40 min | 4 | 10 + 5 + 7 + 8 = 30 |
| Schreiben | 60 min | 3 | 40 + 40 + 20 = 100 points |
| Sprechen | 15 min | 3 | 28 + 40 + 16 + 16 (Aussprache) = 100 |

Also enforced:

- Items numbered 1–30 exactly once per module
- **Lesen Teil 3**: exactly ten ads `a`–`j`, exactly one situation keyed `0`, no
  ad used twice
- **Hören Teil 1**: exactly five short texts, each with one `richtig_falsch` and
  one `multiple_choice` item
- **Hören Teile 1 and 4** are heard twice, **2 and 3** once
- **Hören Teil 4**: a moderator and exactly two guests; try to key at least one
  item to each
- Every `glossar` lemma occurs somewhere in the paper, every `grammatik`
  `belegSatz` is a real sentence from it
- Speaking presentation topics never repeat across papers

---

## Writing the listening scripts

Aim for **roughly 30 minutes of audio** across the module. The generator warns
if you miss it. As a guide, at exam pace (~130 wpm):

| Teil | Words | Notes |
|---|---|---|
| 1 | ~80 per short text, five of them | Each is heard twice |
| 2 | 450–550 | One speaker, heard once |
| 3 | 450–550 | Two speakers, heard once |
| 4 | 600–750 | Three speakers, heard **twice** — this is the long one |

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

`niveau` is `mittel-leicht` or `mittel`, and `sprechtempoProzent` slows the
audio (`-8` on the gentlest paper, `0` at full exam speed).

A *mittel-leicht* paper differs by being **more transparent, not shorter**:
distractors are further from the key, the answer-bearing sentence is closer to
the surface, and fewer items depend on tracking a pronoun across sentences.
Never make it easier by using sub-B1 vocabulary — that trains the wrong level.

Keep to the B1 vocabulary range. A handful of `B1+` glossary items per paper is
realistic; a text full of them is not.

---

## Topics

Pick a set that no existing paper uses — the validator warns on overlap and
fails on a repeated speaking topic.

**Erwachsene**: work, applications, housing and moving, insurance, further
training, consumer rights, mobility, health, volunteering, neighbourhood.

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
