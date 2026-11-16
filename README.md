# Clean Crate

A personal tool for building a DJ and sampling library from files you can keep.

- **Find a track:** paste an Apple Music, SoundCloud, Bandcamp or Beatport link, or type a title, and get direct searches on stores that sell lossless files (Bandcamp, Beatport, Traxsource, Juno Download, Qobuz), plus free downloads, used CDs and vinyl, and title-only lookup on MusicBrainz.
- **Check your files:** drop in WAV, AIFF, FLAC, MP3 or M4A. The page plots the frequency content, flags lossy audio saved in a lossless container, and estimates tempo and key (standard key name, key signature on a staff, and Camelot code). Everything runs in the browser; nothing is uploaded.
- **Crate:** a checklist of tracks to get, synced across devices when opened from the Claude artifact.

It does not download from streaming services.

## Files

| File | What it is |
|---|---|
| `core.js` | Pure functions: link parsing, WAV/AIFF readers, FFT, cutoff detection, tempo, key |
| `app.js` | Page behavior: finder, checker, crate |
| `index.src.html` | Markup and styles; `build.js` inlines the two scripts |
| `index.html` | The built single-file page. Do not edit by hand; run the build |
| `test-*.js` | Tests on synthetic audio and sample links |
| `icon.svg`, `*.png`, `manifest.webmanifest` | App icon (Crate A, Line) for the home screen and browser tab |

## Commands

```
npm test        # run all tests
npm run build   # rebuild index.html
```

## Hosting

- Standalone: GitHub Pages serves `index.html` from the root of `main` at https://tadeuszvs.github.io/clean-crate/. The crate list saves on each device separately there.
- Inside Claude: the same page is published as a private Claude artifact, where the crate syncs across devices.
