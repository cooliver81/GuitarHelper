# GuitarHelper plan

## Goal

Two goals, equally weighted:

1. **Engineering:** turn a single-page script into a codebase that can grow: modules, tests,
   a shared fretboard component, and a pitch detector whose accuracy is measured instead of guessed.
2. **Guitar:** every new feature should be something Oliver practises with. Scales are learnt
   as shapes *and* intervals; improvising is learnt by aiming at chord tones over a progression.

## Original audit (before the rewrite, 2026-10-23)

Kept for the record: the files and line numbers below are from the old code, since replaced.

Vanilla JS, no build step, no tests. Four sections on one page: tuner, metronome + drone,
single-note fretboard trainer, triad trainer. All mic sections share `AudioEngine`
(autocorrelation pitch detection on a `ScriptProcessorNode`).

### Detector check (synthetic notes, 48 kHz, current `detectPitchFromChunk` logic)

| Note | Pure sine | 6 harmonics |
|---|---|---|
| E2 82.4 Hz | **reads 1000 Hz** (4321 cents off) | 82.5 Hz, +1 c |
| A2 110 Hz | +13 c | +1 c |
| E4 329.6 Hz | −5 c | −5 c |
| E5 659.3 Hz | −5 c | −5 c |

Note naming works on bright, harmonic-rich tones. Two real problems:
- **Low notes with a strong fundamental fail.** Autocorrelation is highest at the smallest lag
  in range, so a soft pluck or neck pickup on the low E can return nonsense.
- **Cents are quantized.** The period is an integer number of samples, so readings are off by
  up to ~12 cents at the 12th fret. The tuner's "in tune = ±5 cents" can't be trusted.

### Problems found, ranked

| # | Problem | Where | Effect |
|---|---|---|---|
| 1 | Browser voice processing left on (`{ audio: true }`) | `audioEngine.js:83` | noise suppression and auto-gain fight sustained notes |
| 2 | Tuner only updates once per pluck (gate locks after a note fires) | `audioEngine.js:180` | can't watch the needle while turning a peg |
| 3 | Low-note failure and cent quantization (table above) | `audioEngine.js:244-272` | wrong notes, unreliable tuner |
| 4 | Desktop always reads input channel 2 | `audioEngine.js:127` | a mic or guitar on input 1 is silent; tuned to one audio interface |
| 5 | No `<meta name="viewport">` | `index.html:3` | phones render at desktop width |
| 6 | Metronome uses `setInterval` | `app.js:471` | timing drifts and jitters; first click comes one beat late |
| 7 | Moving the BPM slider restarts the drone every step | `app.js:447`, `app.js:456` | drone cuts in and out while dragging |
| 8 | Fretboard trainer accepts the note in any octave | `app.js:244` | "string 6, G" passes if you play G on string 1 |
| 9 | Starting one mic section leaves the others saying "Listening…" | `handleStart` etc. | stale status text |
| 10 | Triad prompt "on string 3" means "strings 3–2–1" | `triads.js` `nextQuestion` | ambiguous |
| 11 | Same helpers copied 3–4 times (`NOTE_NAMES`, `freqToMidi`, `log`, `setStatus`) | all files | every fix has to be made in several places |
| 12 | `beforeunload` cleanup | `app.js:780` | doesn't fire reliably on iOS; use `pagehide` |
| 13 | Housekeeping: README is UTF-16, `__pycache__/` committed, no `.gitignore`, title says "Fretboard Trainer" | repo | GitHub renders the README badly |

`ScriptProcessorNode` is deprecated but still works everywhere. Migrating to `AudioWorklet`
comes *after* the detector has tests, so the migration can be checked against them.

## Proposed architecture

No framework and no bundler: native ES modules, which GitHub Pages serves as they are.
`package.json` exists only for `npm test` (`node --test`, zero dependencies).

```
index.html            tab bar + one <section> per tool
src/
  theory/             pure functions, no DOM, no audio  -> fully unit-tested
    notes.js          note names, MIDI <-> frequency, cents, transposition
    scales.js         scale formulas, modes, intervals
    chords.js         chord formulas, roman numerals -> chords in a key
    fretboard.js      tuning, note at (string, fret), positions/shapes for a scale
    progressions.js   built-in progressions, parsing "Am F C G"
  audio/
    pitch.js          pure detector (Float32Array -> Hz), tested on synthetic + recorded clips
    mic.js            getUserMedia + node graph, event mode and continuous mode
    clock.js          look-ahead scheduler on AudioContext time (metronome + backing)
    synth.js          click, drone, chord and bass voices
  ui/
    fretboardSvg.js   one SVG fretboard component used by every section
    log.js            the shared log/status helpers
  sections/           tuner, metronome, noteTrainer, triadTrainer, scales, progressions
tests/                node:test files mirroring src/theory and src/audio/pitch.js
```

Why this shape: `theory/` and `audio/pitch.js` are where the bugs are and where the new
features need correctness, and they are the only parts plain Node can test. The SVG
fretboard is the shared visual for scales, triads (show the shape after a miss) and chord
tones over a progression.

Trade-off: ES modules don't load from `file://`. Local dev becomes `npx serve` or
`python -m http.server`.

## Milestones

### M0: housekeeping (≤1 h)
- [x] README to UTF-8, `.gitignore`, delete `__pycache__/`, fix `<title>`, add viewport meta
- [x] Set `user.email` to the GitHub noreply address in this repo before the first commit
- [x] Turn on GitHub Pages and link the live demo from the README

### M1: restructure without changing behaviour (2–3 h)
- [x] Move to `src/` modules as above; delete the duplicates (#11)
- [x] `node:test` suites for `theory/` and for `pitch.js` on synthetic tones (the table above as tests)
- [x] Tab navigation so the page doesn't become one long scroll once there are six tools
- Done when: every current feature works as before and `npm test` passes

### M2: fix the existing tools (3–4 h)
- [x] #1 voice processing off; #4 pick the channel (setting, default = loudest)
- [x] #3 detector: lag search after the first dip, parabolic interpolation; then try YIN/MPM and keep whichever scores better
- [x] #2 continuous mode for the tuner, with a needle instead of text
- [x] #6/#7 look-ahead metronome clock; BPM changes without restarts; time signature option
- [x] #8 exact-pitch check in the fretboard trainer, with a "pitch class only" toggle
- [x] #9, #10, #12
- Done when: detector tests pass at ±3 cents across E2–E6 including pure sines, and the tuner needle moves smoothly

M3–M5 follow the learning path below: the app should teach the next thing Oliver needs,
not everything at once.

### M3: diagrams (5–7 h)
- [x] SVG fretboard: frets 0–15, inlays, labels as note names / intervals (R 3 5 7 9) / blank, root highlighted
- [x] One generator, `theory/shapes.js`: given notes + a fret window, list the playable dots. Scales, arpeggios and chord voicings all go through it
- [x] Scales: major + modes, pentatonics, then melodic and harmonic minor (needed for minor ii–V–i)
- [x] 7th-chord arpeggios (maj7, m7, 7, m7b5) in all 5 positions; "3 to 9" arpeggios (3-5-7-9) as an option
- [x] Voicings: shells (R-3-7 / R-7-3, bass on string 6 or 5); drop 2 on strings 4-3-2-1 and
      5-4-3-2; drop 3 on 6-x-4-3-2 and 5-x-3-2-1; all four inversions each; drop 2&4 last
- [x] Overlay mode: a chord's arpeggio on top of its scale in the same position
- [x] Any key; click a dot to hear it; mic practice mode lights each note as you hit it

### M4: progressions and improvising (6–8 h)
- [x] Backing player on the M2 clock: comping chords (synth), walking-ish bass on roots/fifths, click
- [x] Built-in practice forms (generic, any key): major ii–V–I, minor ii–V–i, ii–V–I to the relative minor,
      diatonic cycle of 4ths (vi–ii–V–I–IV–vii–III–vi), 12-bar blues, jazz blues
- [x] Custom changes typed bar by bar (`| Cm7 F7 | Bbmaj7 | ...`), saved in `localStorage`.
      Oliver enters the songs he knows himself; the repo ships no song titles, melodies or lyrics
- [x] Display: current + next chord; this chord's tones on the fretboard in the chosen position;
      guide tones (3 and 7) and the nearest note in the next chord highlighted
- [x] Mic exercises, in order (see learning path): guide tones on beat 1 → nearest chord tone
      at each change → approach a target from a half step below → enclosure into the 3rd
- [x] Scoring: the share of chord changes where the first note heard was the target

### M5: voice leading (4–6 h)
- [x] For a progression, choose drop 2 / shell inversions that move the least (minimise total
      semitone movement; a small search problem, fully unit-testable)
- [x] Show the voiced chords bar by bar on the fretboard and play them in the backing track
- [ ] Comping exercise with mic check (not built: chords are polyphonic, the detector is monophonic)

### M6: play-along with recordings (done 2026-10-23)
- [x] Load a local audio/video file (stays on the machine) or a YouTube link (IFrame API)
- [x] Attach a chart (saved songs or forms); sync by steady tempo + bar-1 offset, or by tapping every bar
- [x] Chart, current/next chord and chord tones on the board follow the recording
- [x] Slow down without pitch change (files; YouTube's own speed steps), loop a bar range with a one-beat lead-in
- [x] Metronome option: click on 2 & 4 only

### M7: Diagrams, deeper on positions and scales (done 2026-10-23)
- [x] Split into `src/sections/diagrams/` (one module per mode); new pure logic in `src/theory/shapes.js` (tested)
- [x] Views: position, connect two positions (shared notes), 2/3 per string, whole-neck map by position
- [x] Overlays: diatonic chord tones, pentatonics inside the scale, CAGED anchor triad, mode colour notes
- [x] Fingering labels (position and per-string); low-E-on-top option
- [x] Sequences (3rds, 4ths, groups of 3/4, triads, 7ths) with playback, tempo, click, current note lit
- [x] Compare two scales on one root; mode ladder
- [x] Click quizzes: fill in a position, name the degree, find every X; random keys
- [x] Progress grid (scale × CAGED shape, key-independent) + rotation; quiz weights weak shapes
- Removed: mic "practice" in Diagrams (Oliver: this tab is for shapes, no sound checks)

### M8: UI and usability pass, auto-sync (done 2026-10-23)
- [x] Navigation: 9 flat tabs → 5 groups (Scales & shapes, Play along, Mic drills, Tools, Path) with a sub-nav; opens on Diagrams
- [x] One design system in `style.css`: tokens, toolbar, collapsible panels that remember their state, board card, split, empty states
- [x] Diagrams: board near the top; short toolbar above, play/quiz actions under it, highlights and playback options in panels; positions named by shape ("E shape, fret 2"), no numbers that changed meaning between modes
- [x] Play-along: setup screen (file / YouTube / what to show) → practice screen (media + transport | now chord + chart + loop, board, panels); click a bar to jump; own seek bar (no duplicate native player); pop-out and smaller video; "just a key and scale" mode
- [x] Auto-sync for files (`src/audio/beats.js` + Worker, tested): beats by dynamic programming, bar 1 by matching the chart's chords to per-beat chroma; shift by beat/bar, half/double tempo
- [x] Changes: Progression, Key, Tempo, Play up top; band, exercise, songs and history in panels
- [x] Path: steps fold; the current one is open
- [x] Phone: board shows a window of frets around the shape; nav and mode tabs scroll instead of wrapping
- [x] Fixed from the beginner review: Compare spelled G minor's b6 as D# (now Eb, tested); quiz notes spelled in the question's key; quiz defaults no longer start on F# Mixolydian (common scales, fixed key)

### Later
From the 2026-10-23 skills review (general guitar skills the app doesn't cover yet):
- **Ear training:** interval and chord-quality quiz (hear it, name it, then find it on the board);
  "sing then play" prompts. Transcription is covered by Play-along (loop + slow-down).
- **Melodies:** learn the head of each tune by ear before improvising on it; a per-song
  "melody learned" checkbox and a loop preset for the head.
- **Practice planner:** short interleaved sessions (e.g. 3 × 10 min rotating Diagrams /
  Changes / Play-along) instead of one long block; a practice log across tabs.
- **Rhythm:** rhythm-only exercises (comp patterns, accents on off-beats); displaced
  metronome (click on the "and").
- Technique (bends, vibrato, legato, picking) stays out of scope: an app can't judge it well.
- Record WAV clips per string (open, 5th, 12th fret) as a fixture set; check the detector against real guitar
- `AudioWorklet` migration with those tests as the safety net
- Playwright smoke test + GitHub Actions running `npm test`
- Practice log (minutes per tool, streaks) in `localStorage`

## Learning path (guitar)

Starting point (2026-10-23): pentatonics, major scale, G major modes in one position each,
basic and ascending diatonic 7th arpeggios in one position. Applies them to jazz standards
that are mostly ii–V–I chains, major and minor, so the ii–V–I is the unit to practise.

Order below follows common teacher advice (sources at the end): guide tones before
"more notes", drop 2 before drop 3 before drop 2&4, and connect positions in small chunks
(two chords, one position, then widen).

| Stage | What | Practice | App support |
|---|---|---|---|
| 1 | **Shells and guide tones** | R-3-7 shells through a ii–V–I, then a tune; solo with only 3rds, then 3rds and 7ths. The 7th of one chord moves a half or whole step to the 3rd of the next | M3 shells, M4 guide-tone exercise |
| 2 | **Connect arpeggios in one position** | Continuous 8ths through a ii–V–I; at each change jump to the *nearest* note of the next chord, not the root. Two chords first | M4 nearest-note highlight + scoring |
| 3 | **Same arpeggios in all 5 positions** | One ii–V–I in one key, in each position; then move one position up per chorus | M3 arpeggios × 5 positions |
| 4 | **Drop 2** | maj7, m7, 7, m7b5 on strings 4-3-2-1, all 4 inversions; harmonise the major scale up one string set; then 5-4-3-2 | M3 voicings |
| 5 | **Voice-led comping** | ii–V–I in drop 2 with the least movement, then through a tune | M5 |
| 6 | **Minor ii–V–i** | m7b5 – 7b9 – m6/m7; harmonic minor over the V. Half of many standards | M3 scales, M4 forms |
| 7 | **Vocabulary** | Chromatic approach from below, enclosures into the 3rd, "arpeggio up, scale down", 3-to-9 arpeggios over the ii | M4 approach/enclosure exercises |
| 8 | **Drop 3, then drop 2&4** | Drop 3 for bass-on-6/5 comping; drop 2&4 for chord melody, wide stretches | M3 voicings |

Sources: [jazzguitar.be: practising drop voicings](https://www.jazzguitar.be/forum/comping-chords-chord-progressions/47788-one-way-practice-chords.html),
[Premier Guitar: drop 2](https://www.premierguitar.com/lessons/jazz/jazz-drop-2-chord-lesson),
[Jazz Guitar Lessons: connecting chords](https://learn.jazzguitarlessons.net/blog/improvisation-pillar-connecting-chords-logically),
[jazzguitar.be: connecting arpeggios](https://www.jazzguitar.be/forum/getting-started/1139-connecting-arpeggios.html),
[Easy Jazz Guitar Soloing preview](https://www.jazzguitar.be/store/files/Easy-Jazz-Guitar-Soloing-Preview.pdf),
[Mike's Master Classes: drop 2&4](https://mikesmasterclasses.com/courses/advanced-jazz-guitar-harmony-drop-2-and-4-drop-2-and-3).

You don't need to wait for the app: stages 1–2 work today with a backing track and the
diagrams in the sources.

## Decisions (confirm or change)

1. No framework, no bundler, native ES modules. *Recommended:* keeps it deployable as plain files.
2. One page with tabs, not separate pages. *Recommended:* the audio context and settings are shared.
3. Synthesised sounds only (no sample files). *Recommended for now:* small repo, no licensing questions.
4. Scale/voicing content follows the learning path above. *Confirmed 2026-10-23.*

## Status

2026-10-25: M0–M8 committed (719fe26) and live at https://cooliver81.github.io/GuitarHelper/ (the live
`index.html` matches the repo). 65 unit tests pass. Release audit (2026-10-23): no secrets, no personal data
in the tree, no song content, no XSS paths; MIT licence; Twemoji icon (CC-BY 4.0, credited).
History rewritten 2026-10-25: every commit's author is now the GitHub noreply address (one had a work email,
13 a personal one). All commit hashes changed; files, messages and dates did not.
Not checked by hand: real guitar through a real mic, iOS Safari, auto-sync on real recordings.
Next: Oliver uses Diagrams for a week and lists what's missing.

## Session log

- **2026-10-23:** Read the whole codebase. Ran the current detector on synthetic notes
  (table above). Wrote this plan and `CLAUDE.md`. Oliver approved M0–M2 and gave his level;
  researched a jazz learning path online and rewrote M3–M4 around it, adding M5 (voice leading).
- **2026-10-23 (build):** Rewrote the app as ES modules (`src/theory`, `src/audio`, `src/ui`,
  `src/sections`), 8 tabs. Detector: YIN + parabolic interpolation on an AudioWorklet; old vs
  new table in the README (E2 pure tone: wrong note → 0.0 c; A5: −14.4 → +0.1 c). New: Path tab,
  Diagrams (scales/arpeggios/voicings, diatonic walk, mic practice), Changes (backing track,
  voice-led comping, 6 scored exercises, song editor, session history). Old root scripts deleted
  (still in git history). Shells marked done in the Path (Oliver knows them).
- **2026-10-23 (play-along + review):** Oliver is happy with scales/voicings and doesn't want to
  spend time on sound checks. Added the Play-along tab (`src/theory/sync.js` with tests,
  `src/audio/media.js`, `src/sections/playalong.js`) and moved the shared chord-tone board into
  `src/ui/chordBoard.js` (Changes uses it too). Researched general guitar skills; gaps are in
  the "Later" list.
- **2026-10-23 (diagrams pass):** Oliver learns songs outside the app; ear training, transcribing
  and improvising he already does. The app's focus is now scales and shapes. Rebuilt Diagrams
  (M7 above). 59 unit tests pass; headless Edge runs of every mode and the earlier tab tests
  pass with no console errors. Fixed during testing: 3-per-string fingering (whole-whole = 1-2-4),
  whole-neck map that was almost all "shared" (now coloured by home position).
- **2026-10-23 (UI pass):** Oliver asked for a strong UI/usability pass ("pages split in a way
  that is intuitive and not too bulky"; Play-along and Diagrams were bulky) and automatic bar
  sync. A beginner-persona subagent reviewed the old build first (landing on a jazz curriculum,
  board below the fold, quiz starting in F# Mixolydian, duplicate players, phone tab bar
  clipped, the D# bug). Built M8 above, then a second review of the new build. Auto-sync:
  bar lines within 15 ms on synthetic recordings at 70/120/180 (+15% drift)/240 BPM.
  Second review: auto-sync, loop, bar-click and note names all checked out. Fixed: "just a key"
  ignored the current key and left the chart up; intro countdown off by one bar (now seconds);
  fill-in quiz shading didn't cover the shape's stretch notes; "Guide tones" vs "3rd & 7th"
  wording; loop controls moved under the transport. Left as is: Path step 1 pre-ticked (Oliver
  knows shells); Mic drills still use their own board style; mode shapes are named from the
  parent major (G dorian at frets 2–5 = F major's D shape), which is correct but can surprise.
- **2026-10-23 (release check):** Oliver asked for a final safety, copyright and presentation
  pass before pushing, and a fix for a "grey block" at the bottom of pages. Two agents audited
  the repo and history (secrets, personal info, copyright, XSS, licence) and the deployment
  (GitHub Pages sub-path, workers, meta, README). Fixed: page background now painted on
  `<html>` and the body fills the window, so short pages and overscroll never show the browser's grey canvas;
  fretboard no longer gets a scrollbar at mid widths; CSP meta tag; YouTube privacy-enhanced
  host; removed the unused `innerHTML` option; original SVG/PNG icon replaces an emoji-style
  PNG of unknown origin; MIT LICENSE; song titles removed from this plan; README rewritten
  (how it was made, privacy, browser support, licence) with new screenshots and an og:image.
- **2026-10-23 (final pass):** Oliver preferred an emoji or open-source guitar over the original
  icon, and no footer (privacy and "how it was made" live in the README). Icon is now the
  Twemoji 🎸 (CC-BY 4.0, unmodified, attributed in the README and `icon.svg`), used for the
  favicon, touch icon and header. Footer removed. Screenshots and og image retaken; 65 tests and
  the headless runs of every section pass, no CSP violations. Swept the tree for personal or
  employer strings, debug logging and PNG metadata: clean. The tab still showed the old
  favicon (browser cache), so the tab icon is now the 🎸 emoji itself as an inline SVG data URI
  (new URL, no file, drawn by the visitor's emoji font); no CSP violations.
- **2026-10-23 (README framing):** Oliver wants the AI use shown, not hidden: vibecoding as the
  tool they used to build this for themself and to learn to build projects with AI. README now has
  a "Built with AI" section (who did what, the guard-rails with links to `CLAUDE.md`, the plan
  and the tests, what was learned, limits) and a one-line note under the intro.
- **2026-10-23 (short README):** Oliver asked for a short README: purpose, a basic tech
  breakdown and how it works, no screenshots. Rewrote it; removed the five README screenshots
  (kept `docs/img/og.png`, the link-preview image `index.html` points to).
- **2026-10-25 (post-push check):** The rewrite was pushed to `main` and Pages serves it. 65 tests pass; README
  and `index.html` links resolve; no personal strings in the tree. Ticked the two finished M0 items and brought
  the Status up to date. Then rewrote the history (`git filter-branch --env-filter`) so the work-email commit and the
  personal-Gmail commits all use the noreply address; checked that the final tree hash, commit count, messages and
  dates are unchanged, and force-pushed.
