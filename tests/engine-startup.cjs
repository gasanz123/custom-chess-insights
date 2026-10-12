const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Chess } = require('../js/chess.min.js');
async function testStartup(storageValue) {
    const elements = new Map();
    const element = (id) => {
        if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '',
            value: id === 'top-n-moves' ? '3' : '', style: {},
            classList: { add() {}, remove() {} }, addEventListener() {} });
        return elements.get(id);
    };
    let startupScore;
    class FailingWorker {
        constructor() {
            startupScore = element('board-eval-score').textContent;
            setTimeout(() => this.onerror?.({ error: new Error('Worker failed to load') }), 0);
        }
        postMessage() {}
        terminate() {}
    }
    const context = vm.createContext({ Chess, URL, Worker: FailingWorker,
        setTimeout, clearTimeout, setInterval, clearInterval,
        console: { log() {}, warn() {}, error() {} },
        addEventListener() {}, requestAnimationFrame() {},
        localStorage: {
            getItem() { if (storageValue === 'denied') throw new Error('Storage access denied'); return storageValue; },
            setItem() { throw new Error('Storage writes denied'); }
        },
        document: { currentScript: { src: 'https://example.test/custom-chess-insights/js/stockfish.js' },
            getElementById: element, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } }
    });
    context.window = context;
    for (const file of ['openings.js', 'stockfish.js', 'knowledge.js', 'analyzer.js', 'app.js']) {
        vm.runInContext(fs.readFileSync('js/' + file, 'utf8'), context);
    }
    const start = Date.now();
    await vm.runInContext('analyzePosition({auto: true})', context);
    assert.ok(Date.now() - start < 5000, 'worker load error falls back without waiting for handshake timeout');
    assert.match(startupScore, /[+-]\d+\.\d{2}.*estimated/, 'numeric score visible before worker starts');
    assert.match(element('eval-score').textContent, /[+-]\d+\.\d{2}.*estimated/);
    assert.equal(element('board-eval-score').textContent, element('eval-score').textContent);
    assert.match(element('engine-status').textContent, /unavailable/);
    // Even an insights failure must leave the evaluation visible.
    vm.runInContext("chessAnalyzer.analyze = () => { throw new Error('Insights failure'); }", context);
    await vm.runInContext('analyzePosition({auto: true})', context);
    assert.match(element('eval-score').textContent, /[+-]\d+\.\d{2}/);
}
(async () => {
    await testStartup('denied');
    await testStartup('{broken json');
    await testStartup(null);
    console.log('Startup checks passed: immediate estimated score, failed worker, blocked/corrupt storage, and score retained after insight errors.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
