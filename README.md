# GymBro

A dead-simple fullscreen PWA to track your gym routine.

- **Weekly weigh-in** (Mondays) in kg, with history and week-over-week deltas
- **Daily exercises** — just the exercise name and weight used
- **Daily shake toggle** — one shake a day, with a streak counter
- **Workout log** — every day at a glance

All data is stored locally on your device (`localStorage`). Works offline. No account, no server.

## Install as an app

Serve the folder over HTTPS or `localhost`, open `index.html` on your phone, then **Add to Home Screen**. Launch from the icon to run fullscreen.

## Files

- `index.html` — the whole app (HTML/CSS/JS in one file)
- `manifest.webmanifest` — PWA manifest (fullscreen display)
- `sw.js` — service worker for offline caching
- `icons/` — app icons (clean-minimal dumbbell)
- `test.mjs` — logic test harness (see below)

## Tests

Run `node test.mjs` from the repo root. The harness parses the real
date/streak/momentum functions out of `index.html` and runs them in an
isolated scope, so the tests always check the shipped source (no drifting
copy). No dependencies, no build step. It covers date helpers (`todayKey`,
`mondayOf`), volume/1RM math, weekly aggregates, workout & shake streaks,
and the Momentum score.
