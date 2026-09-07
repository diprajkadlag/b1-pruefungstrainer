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

**No microphone, no name.** The app never asks for either. The speaking module
sets the task and plays the simulated partner; you speak aloud in the room and
compare yourself against the model answers afterwards. Nothing is recorded,
because nothing here could mark a recording anyway, and an attempt is tied to a
paper rather than to a person.

**Nothing is submitted.** There is no upload, no examiner view and no server to
receive work. Your writing stays in the browser store on this device, and the
result screen computes your Lesen and Hören score locally from the answer key.

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

## Children

The app collects no personal data and requires no account, so it is usable by
minors. It never asks for a name, and there is no field anywhere that identifies
the person using it.
