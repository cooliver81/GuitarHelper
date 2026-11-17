# 🎸 GuitarHelper

A guitar practice app that runs in the browser. I built it to supplement my guitar lessons:
between lessons I wanted one place to learn scale shapes across the neck, quiz myself on them,
and play along with a backing band or a recording while the fretboard shows the chord tones.
I couldn't find a tool that did that the way I practise, so I made one.

**Live:** https://cooliver81.github.io/GuitarHelper/

## Built with AI

Vibecoded with [Claude Code](https://claude.com/claude-code). AI let me build the practice tool
I was missing, shaped around my lessons and how I learn, instead of settling for an app that
almost fit. I designed it and made the decisions; the AI wrote nearly all of the code. It was
also how I learned to build software with an AI assistant. The guard-rails are public: [`CLAUDE.md`](CLAUDE.md) holds the
rules the assistant follows, [`docs/PLAN.md`](docs/PLAN.md) the milestones and session log,
and [`tests/`](tests/) the unit tests.

## What it does

- **Scales & shapes:** 18 scales in their five CAGED shapes, arpeggios, chord voicings, scale
  comparison, quizzes and a progress grid.
- **Note names:** learn the notes of the neck and of scales without a guitar. Name a dot, find a
  note on every string, name a fret across the strings, spell any scale, or name the notes of a
  shape you already play. Spaced repetition brings back what you miss or answer slowly.
- **Progressions:** ear practice away from the guitar. Pick a common progression or build
  your own (up to four chords, triads or 7ths, any key) and hear it as chords or arpeggios,
  with optional smooth voice leading and a "guess the numerals" quiz.
- **Play along:** a synthesised backing band over chord progressions, or your own audio/video
  file (bars synced automatically) or a YouTube video.
- **Mic drills:** find notes and play triads; the mic scores you.
- **Tools:** tuner, metronome, mic setup.

## Tech

Plain HTML, CSS and JavaScript (ES modules). No framework, no build step, no dependencies.
Hosted as static files on GitHub Pages. Everything runs in the browser: no server, no account,
no tracking; mic audio and your files never leave your device.

- **Pitch detection:** the YIN algorithm (de Cheveigné & Kawahara, 2002) running in an
  `AudioWorklet`.
- **Auto-sync:** finds the beats in a recording (onset strength, tempo by autocorrelation,
  beat tracking by dynamic programming after Ellis, 2007), then finds bar 1 by matching the
  chart's chords against the audio's pitch content. Runs in a Web Worker.
- **Sound:** all synthesised with the Web Audio API (Karplus-Strong guitar, oscillator bass,
  noise drums), scheduled ahead on the audio clock (after Chris Wilson's "A Tale of Two
  Clocks").
- **Music theory:** pure modules in `src/theory/` (scales, chords, fretboard positions,
  voicings, voice leading), tested with `node:test`.

```
src/theory/   music theory (pure, tested)
src/audio/    pitch detection, beat tracking, synth, media players
src/ui/       fretboard SVG and DOM helpers
src/sections/ one module per page
tests/        unit tests
```

## Run locally

```
npx serve .     # or: python -m http.server
npm test        # Node 18+
```

The mic needs `localhost` or HTTPS.

## Licence

Code: [MIT](LICENSE). The 🎸 header and home-screen icon is from
[Twemoji](https://github.com/jdecked/twemoji) (© Twitter, Inc and other contributors),
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).
