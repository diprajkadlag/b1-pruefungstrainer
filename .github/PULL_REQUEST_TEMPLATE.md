## What does this change?

<!-- One or two sentences. Link an issue if there is one. -->

## Type

- [ ] New exam or exam content
- [ ] Bug fix
- [ ] Feature
- [ ] Documentation
- [ ] Tooling / CI

---

## If this pull request touches `content/`

**Originality is the one rule this project cannot bend on.** Please confirm:

- [ ] Every text, item, distractor, listening script, writing task, speaking
      card and glossary entry I am adding is **original work**, written by me
      for this project.
- [ ] Nothing is copied, transcribed, translated or paraphrased from an
      official model set or past paper, from a commercial preparation book
      (Cornelsen, Klett, Hueber and the like), or from any other copyrighted
      source.
- [ ] Any publication, company or person names in my texts are **invented**,
      and no real individual is identifiable.
- [ ] `python tools/validate.py --strict` passes.

> Why this matters: examination formats are facts and free to follow, but the
> *content* of published papers is protected. See
> [docs/DISCLAIMER.md](../docs/DISCLAIMER.md) and
> [docs/AUTHORING.md](../docs/AUTHORING.md).

## If this pull request touches code

- [ ] `npm run typecheck && npm run lint && npx vitest run` passes
- [ ] `npx playwright test` passes, or I have explained why it cannot run
- [ ] New behaviour is covered by a test

## Anything reviewers should know?

<!-- Trade-offs, things you were unsure about, follow-ups you left out. -->
