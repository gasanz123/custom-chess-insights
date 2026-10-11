const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Chess } = require('../js/chess.min.js');
const context = vm.createContext({
    Chess,
    document: {
        addEventListener() {},
        querySelectorAll() { return []; },
        querySelector() { return null; }
    },
    window: { addEventListener() {} },
    requestAnimationFrame() {}
});
vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), context);
vm.runInContext(`
    board = { position() {} };
    for (const name of ['hideGameSummary', 'clearBestMoveArrow', 'updateMoveCounter',
        'renderMoveList', 'updateOpeningName', 'updateLongTermPlanPanel',
        'scheduleAutoAnalyze', 'focusBoardWithoutScrolling']) {
        globalThis[name] = () => {};
    }
`, context);
const run = (code) => vm.runInContext(code, context);
run("onSquareClick('e7')");
assert.equal(run('selectedSquare'), null, 'wrong side cannot be selected');
run("onSquareClick('e2'); onSquareClick('e5')");
assert.equal(run('selectedSquare'), 'e2', 'illegal destination retains selection');
assert.equal(run('game.history().length'), 0);
run("onSquareClick('e4')");
assert.equal(run("game.get('e4').type"), 'p');
assert.equal(run('selectedSquare'), null);
assert.equal(run('currentMoveIndex'), 0);
assert.equal(run('moveHistory[0].san'), 'e4');
run("onSquareClick('e7'); onSquareClick('e5'); onSquareClick('g1'); onSquareClick('g1')");
assert.equal(run('selectedSquare'), null, 'second click cancels');
run("onSquareClick('g1'); onSquareClick('b1')");
assert.equal(run('selectedSquare'), 'b1', 'another friendly piece changes selection');
run("goToMove(-1); onSquareClick('d2'); onSquareClick('d4')");
assert.equal(run('moveHistory.length'), 1, 'new continuation replaces future moves');
assert.equal(run('moveHistory[0].san'), 'd4');
run("game.load('4k3/8/8/8/8/8/8/4K2R w K - 0 1'); onSquareClick('e1'); onSquareClick('g1')");
assert.equal(run("game.get('f1').type"), 'r', 'castling moves the rook');
run("game.load('4k3/P7/8/8/8/8/8/4K3 w - - 0 1'); onSquareClick('a7'); onSquareClick('a8')");
assert.equal(run("game.get('a8').type"), 'q', 'promotion retains original queen default');
run("game.load('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'); onSquareClick('e5'); onSquareClick('d6')");
assert.equal(run("game.get('d5')"), null, 'en passant removes captured pawn');
console.log('Click-to-move checks passed: legal/illegal moves, selection, history, castling, promotion, en passant.');
