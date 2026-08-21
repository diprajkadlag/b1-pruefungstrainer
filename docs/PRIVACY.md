# Privacy

Short version: **this app has no backend, no analytics, no accounts, and sends
nothing anywhere.** Your voice recordings never leave your device unless you
personally export them and hand them to someone.

## Static mode (GitHub Pages, portable ZIP, `npx`)

This is the default and what the public demo runs.

| Data | Where it lives | Leaves your device? |
|---|---|---|
| Your name (if you enter one) | Browser IndexedDB | No |
| Answers to reading/listening | Browser IndexedDB | No |
| Writing texts | Browser IndexedDB | No |
| **Speaking recordings** | Browser IndexedDB, as `.webm` blobs | **No** |
| Results and scores | Browser IndexedDB | No |
| Sprachschatz scores, card schedule and sound setting | Browser localStorage | No |
| **Sprachschatz answer history** | Browser localStorage | **No** |
| Exam content and audio | Cache Storage (service worker) | Downloaded to you |

There is no server to send anything to. There is no telemetry, no analytics
script, no error reporting service, no cookies, no third-party requests at
runtime. The only network requests the app ever makes are to fetch exam JSON and
audio files, and after the first visit the service worker serves those from
cache so it works fully offline.

**Microphone.** The browser asks for permission before the speaking module.
Recording starts only when you press record and stops on the timer. The audio
stays in IndexedDB on your machine. Denying microphone access disables only the
speaking module; everything else works.

**Getting your work out.** The "Abgabe herunterladen" button packages your
writing and recordings into a ZIP that your browser saves locally. What you then
do with that file — email it to a teacher, put it on a USB stick — is entirely
your choice and outside this app.

**The learning game.** Sprachschatz keeps rather more than a score: which cards
you have answered, what you answered, and whether it was right, so you can look
a card up again weeks later. It is capped at the last 300 answers per level and
holds only the record — the id of the card, your answer, right or wrong, and
when. The question and its explanation are not stored at all; they are generated
again from the cheat sheet whenever the history is shown. All of it is
`localStorage` on your device, under keys beginning `sprachschatz:`, and none of
it is sent anywhere.

**Deleting everything.** "Alle Daten löschen" in settings wipes the IndexedDB
store and the service worker caches. "Verlauf löschen" in Sprachschatz clears
that level's answer history on its own, without touching anything else. Clearing
site data in your browser does the lot.

## Server mode (self-hosted, optional)

If *you* run `apps/server` on your own machine, submissions are written to disk
under `submissions/` so a teacher can mark them. That server:

- is **not** hosted by this project — it runs where you start it
- binds to `localhost` by default, so nothing is exposed to your network
- has no authentication, because it is designed for a single household or
  classroom on a trusted machine

> **Do not put the server on the public internet.** It has no auth and would
> expose recordings and written work to anyone who found it. If you need LAN
> access for a phone or tablet, use the documented self-signed-HTTPS flag and
> keep it on your own network.

Whoever runs that server is the data controller for anything it stores. If you
run it for other people's children or students, that is a responsibility you are
taking on, and local data-protection law applies to you, not to this project.

## Children

The app collects no personal data and requires no account, so it is usable by
minors. The only free-text identifier is a name you type to label your own
attempt, stored only on your device. A pseudonym works just as well.
