# GuitarHelper

Browser guitar practice app. Main focus: scale and shape diagrams with quizzes and progress
(`src/sections/diagrams/`). Also: backing tracks and play-along over recordings (with
auto-sync), mic drills, tuner, metronome. Public repo, deployed as static files (GitHub
Pages). Scope, milestones and status: `docs/PLAN.md`.

## Rules

- Public repo: synthetic or public data only. No personal or employer information.
- No framework, no bundler, no runtime dependencies. Native ES modules only.
- Music theory, pitch detection and beat tracking (`src/audio/beats.js`) are pure functions with `node:test` tests. Change them
  test-first; run `npm test` before saying anything works.
- Audio and UI code can't be tested in Node: say so, and say what was checked by hand in a browser.
- UI: use the shared pieces (`seg`, `panel`, `field`, `.toolbar`, `.board-card`, `.surface`)
  so every section looks the same. Keep the fretboard near the top; secondary options go in
  panels. Check 390 px wide (no horizontal page scroll).
- Detector changes report cents error per note before and after, as a table.
- Built-in progressions are generic forms (ii–V–I, blues...). No song titles, melodies or
  lyrics in the repo; Oliver types his own song changes, stored in his browser only.
- Never push to `main` without Oliver's go-ahead; GitHub Pages serves it live.
- End of session: update **Status** and **Session log** in `docs/PLAN.md`.

## Run locally

ES modules don't load from `file://`. Serve the folder: `npx serve .` or
`python -m http.server`, then open the printed URL. Mic access needs `localhost` or HTTPS.
