# Custom Chess Insights

Imported from the supplied archive of https://customchessinsights.netlify.app/.

## Use

Click a piece belonging to the side to move, then click a highlighted destination.
Click the selected piece again or press Escape to cancel. Selecting another friendly
piece changes the selection. Promotions automatically become queens, as in the
original application. Moves update the move list and can be reviewed with the
navigation buttons; playing from an earlier position replaces the continuation.

PGN loading, opening information, knowledge storage, analysis, and coach features
are retained from the supplied code. Knowledge is stored in the browser.

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. No build is required. The root directory can also be
published as a static site on Netlify or GitHub Pages.

## Archive limitations

The downloaded archive omitted the original piece PNGs. Embedded SVG chess symbols
replace them so the board does not depend on missing image files.

A local Stockfish 10.0.2 worker is now bundled in `js/stockfish-worker.js`.
The engine is single-threaded asm.js and requires no CDN, WebAssembly, or special
cross-origin headers. Its URL resolves relative to the wrapper script, so it works
under the GitHub Pages repository path. Source links and GPL-3.0 attribution are
in `js/vendor/STOCKFISH-SOURCE.md`.

## Verification

```sh
node tests/click-to-move.cjs
node --check js/app.js
node tests/stockfish-worker.cjs
```

The move checks cover legal and illegal destinations, selection changes, move
history, branching, castling, promotion, and en passant. Browser rendering has
not been verified in this environment.
