# Stockfish engine attribution and corresponding source

`stockfish-10.asm.js` is the unmodified single-threaded asm.js engine from
Stockfish.js v10.0.2, distributed under GPL-3.0. It is Stockfish 10, not Stockfish 16.
The license is included in `STOCKFISH-COPYING.txt`.

- Upstream: https://github.com/nmrugg/stockfish.js
- Exact source tag: https://github.com/nmrugg/stockfish.js/tree/v10.0.2
- Corresponding source archive: https://github.com/nmrugg/stockfish.js/archive/refs/tags/v10.0.2.zip
- Upstream build instructions: https://github.com/nmrugg/stockfish.js/blob/v10.0.2/README.md
- Original compiled file: https://github.com/nmrugg/stockfish.js/blob/v10.0.2/src/stockfish.asm.js
- Compiled file Git blob SHA: 3619c9108c6ee2e157a172f7b1d32f00e0a8528c

This older build is used for broad browser compatibility on static hosting. It
does not require WebAssembly, SharedArrayBuffer, or external neural-network files.
