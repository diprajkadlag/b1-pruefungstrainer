# Security

## Reporting

Please report vulnerabilities privately through GitHub's
[security advisories](../../security/advisories/new) rather than a public
issue. I will acknowledge within a few days.

This is a small volunteer project, not a funded one — please set expectations
accordingly, but genuine issues will be taken seriously.

## Threat model

The hosted app has **no backend, no accounts and no analytics**. Everything a
candidate does stays in their browser. The realistic risks are therefore:

| Risk | Status |
|---|---|
| Supply-chain compromise of an npm or PyPI dependency | Dependabot, minimal runtime deps (the app ships React and nothing else) |
| XSS via exam content | Content is rendered as text by React, never `dangerouslySetInnerHTML` |
| Answer key exposure before submission | Split at build time by `tools/export_web.py`, asserted by `tools/check_no_leak.py` and an e2e test in CI |

## The optional server is not hardened

`apps/server` has **no authentication by design**. It is meant for one
household or one classroom on a trusted machine, binds to `localhost` unless
`--lan` is passed, and stores voice recordings and written work on disk.

> **Do not expose it to the internet.** Anyone who reached it could read every
> submission.

If you run it for other people's children or students, you are the data
controller for what it stores, and local data-protection law applies to you.
See [docs/PRIVACY.md](docs/PRIVACY.md).

## Supported versions

The latest release on `main`. This project is too small to backport fixes.
