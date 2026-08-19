# The examination format, as data

`tools/validate.py` refuses any paper that does not match the format of the
level it claims to test. Every number it enforces is written down here, with
where it comes from. Change a number in the validator and change it here in the
same commit, or the next person cannot tell a rule from a typo.

Two levels are supported. They share a pipeline and almost nothing else:
**B1** has three writing tasks and five speaking slides, **B2** has two writing
tasks, a debate, and three matching task types B1 never uses.

> **On what is being copied.** A format is a published set of facts: how many
> parts, how long, how many items, heard once or twice. Following it is what
> makes a practice paper useful. The *content* — texts, items, scripts — is
> written from scratch for this project and is never taken from a model set, a
> past paper or a preparation book. See [AUTHORING.md](AUTHORING.md).

---

## B1

Adults and young people sit the same structure; `variante` changes only the
subject matter.

| Modul | Zeit | Teile | Items / Punkte |
|---|---|---|---|
| Lesen | 65 min | 5 | 6 + 6 + 7 + 7 + 4 = **30 items** |
| Hören | 40 min | 4 | 10 + 5 + 7 + 8 = **30 items** |
| Schreiben | 60 min | 3 | 40 + 40 + 20 = **100 points** |
| Sprechen | 15 min prep | 3 | 28 + 40 + 16 + 16 Aussprache = **100 points** |

### Lesen

| Teil | Aufgabe | Items | Richtzeit | Item-Typ |
|---|---|---|---|---|
| 1 | Blog or personal report | 6 | 10 min | `richtig_falsch` |
| 2 | Two newspaper articles, three items each | 6 | 20 min | `multiple_choice` |
| 3 | Ten classified ads `a`–`j`, seven situations | 7 | 10 min | `zuordnung_anzeigen` |
| 4 | Seven opinions on one proposition | 7 | 15 min | `ja_nein` |
| 5 | Rules of use / house rules | 4 | 10 min | `multiple_choice` |

Teil 3 carries exactly one situation keyed `0` (no suitable ad) and no ad
answers two situations. Teil 2 is the only part with no worked example.

### Hören

| Teil | Aufgabe | Items | Gehört | Item-Typ |
|---|---|---|---|---|
| 1 | Five short texts | 10 | **2×** | one `richtig_falsch` + one `multiple_choice` per text |
| 2 | Talk or guided tour | 5 | 1× | `multiple_choice` |
| 3 | Everyday conversation | 7 | 1× | `richtig_falsch` |
| 4 | Radio discussion, moderator + 2 guests | 8 | **2×** | `zuordnung_person` (a/b/c) |

### Schreiben

| Aufgabe | Typ | Wörter | Zeit | Punkte |
|---|---|---|---|---|
| 1 | `email_informell` | 80 | 20 min | 40 |
| 2 | `forumsbeitrag` | 80 | 25 min | 40 |
| 3 | `email_halbformell` | 40 | 15 min | 20 |

### Sprechen

| Teil | Typ | Dauer | Punkte |
|---|---|---|---|
| 1 | `gemeinsam_planen` | 3 min | 28 |
| 2 | `praesentation`, five slides, two topics offered | 3 min | 40 |
| 3 | `rueckmeldung` on the partner's presentation | 2 min | 16 |

Pronunciation is worth a further 16 points across the module, which is why the
three parts sum to 84 rather than 100.

---

## B2

The 2019 revision. Not a harder B1: the tasks themselves are different, and
three of them have no B1 equivalent at all.

| Modul | Zeit | Teile | Items / Punkte |
|---|---|---|---|
| Lesen | 65 min | 5 | 9 + 6 + 6 + 6 + 3 = **30 items** |
| Hören | 40 min | 4 | 10 + 6 + 6 + 8 = **30 items** |
| Schreiben | 75 min | 2 | 60 + 40 = **100 points** |
| Sprechen | 15 min prep | 2 | 50 + 50 = **100 points** |

### Lesen

| Teil | Aufgabe | Items | Richtzeit | Item-Typ |
|---|---|---|---|---|
| 1 | Four forum posts, statements matched to their author | 9 (1–9) | 18 min | `zuordnung_person` (a–**d**) |
| 2 | Magazine article with six gaps; eight sentences offered | 6 (10–15) | 12 min | `zuordnung_buchstabe` |
| 3 | Newspaper article | 6 (16–21) | 12 min | `multiple_choice` |
| 4 | Eight opinions matched to six headings | 6 (22–27) | 12 min | `zuordnung_buchstabe` |
| 5 | Regulations: three paragraphs matched to a table of contents | 3 (28–30) | 6 min | `zuordnung_buchstabe` |

Three things here are new to the codebase:

- **Four options, not three.** Teil 1 keys are `a`–`d`, and one person may
  answer several statements — reuse is expected, not a bug.
- **Letter lists on the Teil.** Teile 2, 4 and 5 offer a list of eight lettered
  alternatives (`optionenliste`, `a`–`h`) — always more than there are items,
  because the surplus letters are the distractors. No letter answers two items,
  and the letter shown in the worked example is spent, so with six items in
  Teil 2 one letter is a pure decoy and in Teil 5 four are. The validator
  enforces no reuse and at least one unused letter; the exact surplus is the
  author's to choose.
- **Gap markers in the text.** Teile 2 and 5 mark each gap in the running text
  as `[10]`, `[11]` … The validator checks that every item number in the part
  appears exactly once as a marker and that no marker is orphaned.

### Hören

| Teil | Aufgabe | Items | Gehört | Item-Typ |
|---|---|---|---|---|
| 1 | Five short conversations and announcements | 10 | **1×** | one `richtig_falsch` + one `multiple_choice` per text |
| 2 | Radio interview | 6 | **2×** | `multiple_choice` |
| 3 | Radio conversation, several people | 6 | 1× | `zuordnung_person` (a/b/c) |
| 4 | Short lecture | 8 | **2×** | `multiple_choice` |

Note the repeat pattern is **1, 2, 1, 2** — the mirror image of B1, where the
first part is the one heard twice. This is the single most common thing to get
wrong when adapting a B1 paper.

### Schreiben

| Aufgabe | Typ | Wörter | Zeit | Punkte |
|---|---|---|---|---|
| 1 | `forumsbeitrag` — argued contribution to a discussion | min. 150 | 50 min | 60 |
| 2 | `nachricht_formell` — message to a superior or an institution | min. 100 | 25 min | 40 |

The official marking scheme gives Aufgabe 1 a maximum of 15 raw points and
Aufgabe 2 a maximum of 10, over four criteria each. This project scales that to
the 100-point module scale the app reports everywhere, so 60 / 40.

### Sprechen

| Teil | Typ | Dauer | Punkte |
|---|---|---|---|
| 1 | `vortrag` — short structured talk, two topics offered, then questions | ~4 min | 50 |
| 2 | `diskussion` — debate on one given question | ~5 min | 50 |

Teil 1 replaces B1's five slides with a four-point outline: introduction, main
part with examples, advantages and disadvantages, conclusion with an opinion.
Pronunciation is assessed inside the two parts rather than separately, so they
sum to 100 with no residue.

Both parts assume a partner. `partnerSkript` supplies TTS turns so a candidate
sitting alone can still take the module — for Teil 2 that means a partner who
actually argues the other side.

---

## What both levels enforce

- Items numbered 1–30 exactly once per module, in part order.
- Every scored item carries `beleg`: the one sentence that settles it.
- Every `glossar` lemma really occurs in the paper; every `grammatik.belegSatz`
  is a real sentence from it.
- Speaking topics never repeat across papers of the same level.
- `meta.stufe` matches the folder name: `pruefung-NN` is B1, `b2-pruefung-NN`
  is B2.

## Difficulty bands, and what B2.1 does *not* mean

`meta.niveau` is one of two values and is the only thing that varies between
papers of the same level:

| `niveau` | `sprechtempoProzent` | Distractors | Shown as |
|---|---|---|---|
| `mittel-leicht` | `-8` | more transparent, one clearly off-topic | B1.1 / B2.1 |
| `mittel` | `0` | all three plausible on a careless reading | B1.2 / B2.2 |

The format does not change: item counts, times, repeat pattern and marking
maxima are identical either way, and validate.py enforces the same table for
both.

**B2.1 and B2.2 are course stages, not exam parts.** Language schools teach a
level in two blocks and name them that way, so learners ask for papers in those
terms — which is why the app prints the label. The examination has no such
split. A Goethe-Zertifikat B2 is one certificate made of four modules (Lesen,
Hören, Schreiben, Sprechen) which, since the 2019 revision, may be sat in one
sitting or one module at a time; there is no separate "B2.1 examination" to
enter or pass. Anything downstream that treats a `.1` paper as a different
format is wrong.

## Audio

Both levels target ~135 wpm delivered pace and roughly half an hour of audio
for the module; `sprechtempoProzent` shifts that down for a gentler paper
(`-8`), never up. The pace model is per character rather than per word — see
`tools/generate_audio.py` for why.

## Sources

The structure above comes from the Goethe-Institut's own published material for
each level: the online model sets ([B2](https://bfu.goethe.de/b2_mod_2MX6/),
which lists every part with its item numbers and repeat count), the downloadable
model sets, and the Durchführungsbestimmungen for the marking maxima — which
are also where the modular structure of the certificate comes from, and with it
the fact that the level has no examination-side subdivision. Only the format was
taken from these — never a text, an item or a script.
