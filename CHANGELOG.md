# Changelog

Notable changes to this project. Format based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/).

Exam content is versioned separately, per paper, in each `exam.json`
(`meta.contentVersion`).

## [Unreleased]

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
