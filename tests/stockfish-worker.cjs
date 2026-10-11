const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Worker: NodeWorker } = require('node:worker_threads');
const { Chess } = require('../js/chess.min.js');
const root = path.resolve(__dirname, '..');
const workerCode = `
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = { console, setTimeout, clearTimeout, performance,
    onmessage: null, location: { hash: '', href: 'https://example.test/custom-chess-insights/js/stockfish-worker.js' },
    postMessage: (line) => parentPort.postMessage(line) };
scope.self = scope;
const context = vm.createContext(scope);
scope.importScripts = (file) => vm.runInContext(fs.readFileSync(path.join(workerData.root, 'js', file), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(workerData.root, 'js/stockfish-worker.js'), 'utf8'), context);
parentPort.on('message', (data) => context.onmessage({ data }));
`;
let actualWorker;
class BrowserWorker {
    constructor(url) {
        assert.equal(url, 'https://example.test/custom-chess-insights/js/stockfish-worker.js');
        actualWorker = this.worker = new NodeWorker(workerCode, { eval: true, workerData: { root } });
        this.worker.on('message', (data) => this.onmessage?.({ data }));
        this.worker.on('error', (error) => this.onerror?.({ error }));
    }
    postMessage(command) { this.worker.postMessage(command); }
    terminate() { return this.worker.terminate(); }
}
const context = vm.createContext({ Worker: BrowserWorker, URL, console,
    document: { currentScript: { src: 'https://example.test/custom-chess-insights/js/stockfish.js' } },
    setTimeout, clearTimeout, setInterval, clearInterval, Chess });
context.window = context;
vm.runInContext(fs.readFileSync(path.join(root, 'js/stockfish.js'), 'utf8'), context);
(async () => {
    try {
        await vm.runInContext('stockfishEngine.init()', context);
        assert.equal(vm.runInContext('stockfishEngine.isReady', context), true);
        const result = await vm.runInContext(`stockfishEngine.analyze('${new Chess().fen()}', 3, 8)`, context);
        assert.ok(result.bestMoves.length >= 1, 'engine returns candidate moves');
        for (const candidate of result.bestMoves) {
            const game = new Chess();
            assert.ok(game.move({ from: candidate.move.slice(0, 2), to: candidate.move.slice(2, 4), promotion: candidate.move[4] || 'q' }), 'candidate is legal');
        }
        console.log('Local worker passed UCI handshake and returned legal moves through the application wrapper.');
        console.log(JSON.stringify({ evaluation: result.evaluation, candidates: result.bestMoves.length }));
    } finally { if (actualWorker) await actualWorker.terminate(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
