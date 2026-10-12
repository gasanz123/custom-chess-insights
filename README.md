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
node tests/evaluation-display.cjs
node tests/engine-startup.cjs
node tests/arrow-turn.cjs
```

The move checks cover legal and illegal destinations, selection changes, move
history, branching, castling, promotion, and en passant. Browser rendering is covered by the mobile regression test below.

## Mobile browser regression

The layout stacks the board, PGN controls, and insights on narrow screens, retains
three columns on desktop, and resizes the board when its container or orientation
changes. Main controls have at least 44px touch targets.

Install Playwright (`npm install --no-save playwright` and `npx playwright install chromium`),
then run `node tests/mobile-responsive.cjs`. The test starts a temporary Python 3
HTTP server on port 18080; Python 3 and an available port are required. To test a
live deployment instead, pass its URL as the final argument.

For an existing Playwright install/browser, use:

```sh
PLAYWRIGHT_MODULE=/opt/homebrew/lib/node_modules/playwright \
BROWSER_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
node tests/mobile-responsive.cjs https://chess-insights.sahist.site/
```

The isolated headless test verifies 320/375/390/768/1440px widths, horizontal
overflow, 64 squares and loaded images, touch targets, PGN load/navigation,
board flipping, portrait/landscape resizing, engine readiness, and page errors.
It is Chromium coverage, not a physical-device Safari test.

## Evaluation startup

The score is visible above the board as well as in Insights. While Stockfish
loads, an explicitly labeled estimated score is displayed. Worker load errors
fall back immediately; an unresponsive engine has an eight-second startup limit.
Browser storage failures do not stop evaluation or board controls.

## Arrow position safety

Position changes invalidate pending analysis immediately, including the interval
before the next automatic search starts. Results and cached arrow redraws must
match the current FEN, and arrow moves must be legal for its side to move.
Stockfish searches run sequentially so concurrent callers cannot replace each
other's response handler. A timed-out worker is terminated to prevent delayed
messages contaminating a later search. The engine is reinitialized on the next
analysis request; estimated evaluation remains available.
