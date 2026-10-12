const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Chess } = require('../js/chess.min.js');
const elements = new Map();
function element(id) {
    if (!elements.has(id)) {
        const classes = new Set();
        elements.set(id, { textContent: '', style: {}, value: '3', classList: { add(x) { classes.add(x); }, remove(x) { classes.delete(x); }, contains(x) { return classes.has(x); } }, setAttribute() {}, getBoundingClientRect() { return {left: 0, top: 0, width: 400, height: 400}; } });
    }
    return elements.get(id);
}
let resolveSearch;
let renders = 0;
const context = vm.createContext({ Chess, console, setTimeout() { return 1; }, clearTimeout() {},
    requestAnimationFrame() {}, addEventListener() {},
    document: { addEventListener() {}, getElementById: element, querySelector: element, querySelectorAll() { return []; } },
    stockfishEngine: { isReady: true, analyze() { return new Promise(resolve => { resolveSearch = resolve; }); } }
});
context.window = context;
vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);
context.countRender = () => { renders++; };
vm.runInContext(`
    for (const name of ['updateEngineDebugPanel', 'updateEvalBar', 'updateEvaluationScore', 'updateLongTermPlanPanel', 'updateKnowledgeDisplay']) globalThis[name] = () => {};
    chessAnalyzer = { analyze: () => [{category: 'test'}] };
    knowledgeBase = { recordPosition() {} };
    displayAnalysis = countRender;
`, context);
(async () => {
    const pending = vm.runInContext('analyzePosition()', context);
    vm.runInContext("game.move('e4'); scheduleAutoAnalyze()", context);
    resolveSearch({ evaluation: 30, bestMoves: [{move: 'e2e4'}], principalVariation: [] });
    await pending;
    assert.equal(renders, 0, 'old result must be ignored during the 150ms interval before the next search');
    vm.runInContext("drawBestMoveArrow('e2e4', new Chess().fen())", context);
    assert.equal(element('best-move-arrow').classList.contains('visible'), false, 'White arrow hidden on Black turn');
    vm.runInContext("drawBestMoveArrow('e7e5', game.fen())", context);
    assert.equal(element('best-move-arrow').classList.contains('visible'), true, 'legal Black arrow shown');
    vm.runInContext("game.move('e5'); drawBestMoveArrow('e7e5')", context);
    assert.equal(element('best-move-arrow').classList.contains('visible'), false, 'cached arrow cannot survive a position change');
    vm.runInContext("drawBestMoveArrow('e2e8', game.fen())", context);
    assert.equal(element('best-move-arrow').classList.contains('visible'), false, 'illegal arrows hidden');
    console.log('Arrow turn checks passed: delayed old result rejected, correct side shown, cached/illegal arrows hidden.');
})().catch(error => { console.error(error); process.exitCode = 1; });
