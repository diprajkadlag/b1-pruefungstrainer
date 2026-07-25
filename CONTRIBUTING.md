# Contributing

Thanks for looking. Two kinds of contribution are especially welcome: **new
exam papers** and **corrections to existing ones**.

## Reporting a content error

A wrong answer key teaches somebody the wrong thing, so these are the highest
priority issues in the project. Use the *Exam content problem* issue template
and quote the sentence you think supports a different answer.

## Adding a new exam

You need to touch **no code**:

```bash
python tools/new_exam.py pruefung-06
# write the content
python tools/validate.py pruefung-06 --strict
```

Read [docs/AUTHORING.md](docs/AUTHORING.md) first — it covers the rules the
validator enforces, how to build distractors that test something, how long the
listening scripts need to be, and the one rule that cannot bend:

> **Everything must be original.** Nothing copied, transcribed, translated or
> paraphrased from official model sets or commercial preparation books.

## Working on the code

```bash
npm install
npm run build --workspace=@b1/core
python tools/export_web.py --no-audio   # content for the app
npm run dev                             # http://localhost:5173
```

Before opening a pull request:

```bash
npm run typecheck
npm run lint
npm run format
npx vitest run
npx playwright test
```

### House style

- **Comments explain why, not what.** If a line is surprising, say what would
  go wrong without it. Several comments in `tools/generate_audio.py` exist
  because the bug they describe cost real time to find.
- **German for anything a user sees**, English for code and comments. Domain
  terms stay German in identifiers (`bewerteModul`, `Schluessel`) because
  translating them makes the exam specification harder to follow.
- **New behaviour needs a test.** Scoring changes need a unit test; anything
  touching the exam flow needs an e2e test.

### Commits

[Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, with `content:` for
exam material. The subject line says what changed; the body says why.

## Code of conduct

Be decent. Assume the other person is trying to help learners, because they
are. Harassment of any kind means you are no longer welcome here.

Report problems to the maintainer via a GitHub issue or directly.
