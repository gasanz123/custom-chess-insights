// App.js - Main Application Logic

let board = null;
let game = new Chess();
let currentFen = game.fen();
let moveHistory = [];
let currentMoveIndex = -1;
let lastBestMoveUci = null;
let lastBestMoveFen = null;
let analysisRunId = 0;
let autoAnalyzeTimer = null;
let moveAnnotations = [];
let positionEvals = [];
let isFullAnalysisRunning = false;
let boardOrientation = 'white';
let selectedSquare = null;

document.addEventListener('DOMContentLoaded', async () => {
    initBoard();
    initEventListeners();
    updateKnowledgeDisplay();
    updateLongTermPlanPanel(null, null);
    updateOpeningName();
    renderMoveList();
    analyzePosition({ auto: true });
});

function initBoard() {
    // The saved archive did not include the original piece PNGs.
    // Embedded SVGs keep every piece visible without remote image requests.
    const pieceSymbols = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
    const pieceTheme = (piece) => {
        const white = piece[0] === 'w';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><text x="40" y="62" text-anchor="middle" font-size="68" font-family="DejaVu Sans,Arial Unicode MS,serif" fill="${white ? '#fff' : '#222'}" stroke="${white ? '#222' : '#eee'}" stroke-width="1.2" paint-order="stroke">${pieceSymbols[piece[1]]}</text></svg>`;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };

    if (typeof Chessboard !== 'function') {
        const el = document.getElementById('board');
        if (el) el.innerHTML = '<div style="padding:16px;color:#fff">Board library failed to load</div>';
        showToast('Board library failed to load');
        return;
    }

    board = Chessboard('board', {
        draggable: false,
        position: 'start',
        orientation: boardOrientation,
        pieceTheme,
        onDragStart: onDragStart,
        onDrop: onDrop,
        onSnapEnd: onSnapEnd
    });
    if (board) board.position(game.fen(), false);
    initBoardInteraction();
}

function initBoardInteraction() {
    const el = document.getElementById('board');
    let press = null;
    el.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0) return;
        const square = event.target.closest('[data-square]');
        if (!square) return;
        press = { id: event.pointerId, square: square.dataset.square, x: event.clientX, y: event.clientY, moved: false, type: event.pointerType };
        el.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    el.addEventListener('pointermove', (event) => {
        if (press && press.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) press.moved = true;
    });
    el.addEventListener('pointerup', (event) => {
        if (!press || press.id !== event.pointerId) return;
        const start = press;
        press = null;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('#board [data-square]');
        if (!target) return;
        if (!start.moved) onSquareClick(target.dataset.square);
        else if (start.type === 'mouse' && !isFullAnalysisRunning) {
            const piece = game.get(start.square);
            if (piece && piece.color === game.turn() && !game.game_over() && onDrop(start.square, target.dataset.square) !== 'snapback') onSnapEnd();
        }
        event.preventDefault();
    });
    el.addEventListener('pointercancel', () => { press = null; });
    el.addEventListener('lostpointercapture', () => { press = null; });
    el.addEventListener('dragstart', (event) => event.preventDefault());
}

function clearSelection() {
    selectedSquare = null;
    document.querySelectorAll('#board .selected-square, #board .legal-square')
        .forEach((el) => el.classList.remove('selected-square', 'legal-square'));
}

function selectSquare(square) {
    clearSelection();
    selectedSquare = square;
    document.querySelector(`#board [data-square="${square}"]`)?.classList.add('selected-square');
    game.moves({ square, verbose: true }).forEach((move) => {
        document.querySelector(`#board [data-square="${move.to}"]`)?.classList.add('legal-square');
    });
}

function onSquareClick(square) {
    if (game.game_over() || isFullAnalysisRunning) { clearSelection(); return; }
    if (selectedSquare === square) { clearSelection(); return; }
    const piece = game.get(square);
    if (piece && piece.color === game.turn()) { selectSquare(square); return; }
    if (!selectedSquare) return;
    if (onDrop(selectedSquare, square) === 'snapback') return;
    onSnapEnd();
}

function onDragStart(source, piece) {
    if (game.game_over()) return false;
    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
        (game.turn() === 'b' && piece.search(/^w/) !== -1)) return false;
}

function onDrop(source, target) {
    const move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    clearSelection();
    // A move from an earlier position starts a new continuation.
    moveHistory = game.history({ verbose: true });
    currentMoveIndex = moveHistory.length - 1;
    moveAnnotations = new Array(moveHistory.length).fill(null);
    positionEvals = [];
    hideGameSummary();
    currentFen = game.fen();
    clearBestMoveArrow();
    updateMoveCounter();
    renderMoveList();
    updateOpeningName();
    updateLongTermPlanPanel(null, null);
    scheduleAutoAnalyze();
}

function onSnapEnd() {
    if (!board) return;
    board.position(game.fen());
    if (lastBestMoveUci) requestAnimationFrame(() => drawBestMoveArrow(lastBestMoveUci));
}

function scheduleAutoAnalyze() {
    // Invalidate now, before the debounce timer starts the next search.
    analysisRunId++;
    clearBestMoveArrow();
    if (autoAnalyzeTimer) clearTimeout(autoAnalyzeTimer);
    autoAnalyzeTimer = setTimeout(() => analyzePosition({ auto: true }), 150);
}

function getTopNMovesSetting() {
    const el = document.getElementById('top-n-moves');
    const v = el ? parseInt(el.value, 10) : 3;
    return Math.max(1, Math.min(20, Number.isFinite(v) ? v : 3));
}

async function ensureEngineReady() {
    const status = document.getElementById('engine-status');
    if (status) status.textContent = 'Stockfish is loading; showing an estimated score.';
    try {
        await stockfishEngine.init();
        if (status) status.textContent = 'Stockfish ready';
    } catch (error) {
        if (status) status.textContent = 'Stockfish could not start; showing an estimated score.';
        updateEngineDebugPanel({ evaluation: null, rawLines: [`engine startup: ${error.message || error}`] });
    }
}

// === PGN Parsing ===
function normalizePgnInput(raw) {
    return raw.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\r\n/g, '\n').trim();
}

function stripBraceComments(str) {
    let out = '', d = 0;
    for (const c of str) { if (c === '{') { d++; continue; } if (c === '}') { if (d > 0) d--; continue; } if (d === 0) out += c; }
    return out;
}

function stripParenVariations(str) {
    let out = '', d = 0;
    for (const c of str) { if (c === '(') { d++; continue; } if (c === ')') { if (d > 0) d--; continue; } if (d === 0) out += c; }
    return out;
}

function extractMovetext(pgn) {
    const flat = stripParenVariations(stripBraceComments(pgn));
    return flat.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('[')).join(' ').replace(/\s+/g, ' ').trim();
}

function tryParsePgnWithChess(pgnString) {
    const g = new Chess();
    return g.load_pgn(pgnString) ? g : null;
}

function loadGameFromPgnString(raw) {
    const normalized = normalizePgnInput(raw);
    if (!normalized) return null;
    const noBraces = stripBraceComments(normalized);
    const movetext = extractMovetext(normalized);
    const hdr = '[Event "?"]\n[Site "?"]\n[Date "?"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n';
    const candidates = new Set();
    [normalized, noBraces, hdr + movetext, hdr + extractMovetext(noBraces)].forEach(c => { if (c) candidates.add(c); });
    for (const c of candidates) { const g = tryParsePgnWithChess(c); if (g) return g; }
    if (movetext) { const g = new Chess(); if (replayMovetext(g, movetext)) return g; }
    return null;
}

function replayMovetext(game, movetext) {
    game.reset();
    const tokens = movetext.replace(/\$\d+/g, ' ').replace(/(1-0|0-1|1\/2-1\/2|\*)\s*$/i, ' ').trim().split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
        if (/^\d+\.(?:\.\.\.)?$/.test(tok)) continue;
        if (/^(1-0|0-1|1\/2-1\/2|\*)$/i.test(tok)) break;
        let m = game.move(tok);
        if (!m) m = game.move(tok, { sloppy: true });
        if (!m) return false;
    }
    return true;
}

// === Event Listeners ===
function initEventListeners() {
    const fileInput = document.getElementById('pgn-file-input');
    if (fileInput) fileInput.addEventListener('change', onPgnFileSelected);

    document.getElementById('load-pgn').addEventListener('click', loadPgn);
    document.getElementById('analyze-btn').addEventListener('click', () => analyzePosition({ auto: false }));
    document.getElementById('full-analysis-btn').addEventListener('click', analyzeFullGame);
    document.getElementById('flip-btn').addEventListener('click', flipBoard);

    const topNEl = document.getElementById('top-n-moves');
    if (topNEl) topNEl.addEventListener('change', () => { topNEl.value = String(getTopNMovesSetting()); scheduleAutoAnalyze(); });

    document.getElementById('first-btn').addEventListener('click', () => goToMove(-1));
    document.getElementById('prev-btn').addEventListener('click', () => goToMove(currentMoveIndex - 1));
    document.getElementById('next-btn').addEventListener('click', () => goToMove(currentMoveIndex + 1));
    document.getElementById('last-btn').addEventListener('click', () => goToMove(moveHistory.length - 1));
    document.getElementById('export-knowledge').addEventListener('click', exportKnowledge);

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
        if (e.key === 'Escape') clearSelection();
        if (e.key === 'ArrowLeft') goToMove(currentMoveIndex - 1);
        if (e.key === 'ArrowRight') goToMove(currentMoveIndex + 1);
        if (e.key === 'f' || e.key === 'F') flipBoard();
    });
}

function flipBoard() {
    clearSelection();
    if (!board) return;
    boardOrientation = boardOrientation === 'white' ? 'black' : 'white';
    board.orientation(boardOrientation);
    if (lastBestMoveUci) requestAnimationFrame(() => drawBestMoveArrow(lastBestMoveUci));
}

function onPgnFileSelected(e) {
    const file = e.target && e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const ta = document.getElementById('pgn-input');
        if (ta) ta.value = String(reader.result || '');
        if (e.target) e.target.value = '';
        loadPgn();
    };
    reader.onerror = () => {
        showToast('Could not read file');
        if (e.target) e.target.value = '';
    };
    reader.readAsText(file);
}

// === Game Loading ===
function loadPgn() {
    analysisRunId++;
    clearBestMoveArrow();
    clearSelection();
    const raw = document.getElementById('pgn-input').value;
    if (!normalizePgnInput(raw)) { showToast('Please paste a PGN first'); return; }

    const loaded = loadGameFromPgnString(raw);
    if (!loaded) {
        showToast('Could not read PGN');
        game = new Chess(); board.position(game.fen());
        moveHistory = []; currentMoveIndex = -1; moveAnnotations = []; positionEvals = [];
        currentFen = game.fen(); updateMoveCounter(); renderMoveList(); updateOpeningName();
        return;
    }

    game = loaded;
    moveHistory = game.history({ verbose: true });
    currentMoveIndex = moveHistory.length - 1;
    moveAnnotations = new Array(moveHistory.length).fill(null);
    positionEvals = [];

    game.reset(); board.position('start');
    moveHistory.forEach(m => { if (!game.move(m.san)) game.move(m.san, { sloppy: true }); });

    currentFen = game.fen();
    board.position(currentFen);
    clearBestMoveArrow();
    updateMoveCounter();
    updateOpeningName();
    renderMoveList();
    updateLongTermPlanPanel(null, null);
    hideGameSummary();
    showToast(`Loaded ${moveHistory.length} moves`);
    scheduleAutoAnalyze();
}

function goToMove(index) {
    clearSelection();
    if (index < -1) index = -1;
    if (index >= moveHistory.length) index = moveHistory.length - 1;
    currentMoveIndex = index;
    game.reset();
    for (let i = 0; i <= index; i++) {
        const mv = moveHistory[i].san;
        if (!game.move(mv)) game.move(mv, { sloppy: true });
    }
    currentFen = game.fen();
    board.position(currentFen);
    clearBestMoveArrow();
    updateMoveCounter();
    updateOpeningName();
    renderMoveList();
    updateLongTermPlanPanel(null, null);
    scheduleAutoAnalyze();
    focusBoardWithoutScrolling();
}

function focusBoardWithoutScrolling() {
    requestAnimationFrame(() => {
        const bw = document.getElementById('board-wrap');
        if (bw && typeof bw.focus === 'function') {
            try {
                bw.focus({ preventScroll: true });
            } catch (_) {
                bw.focus();
            }
        }
    });
}

function updateMoveCounter() {
    document.getElementById('move-counter').textContent = `Move: ${currentMoveIndex + 1} / ${moveHistory.length}`;
}

// === Opening Recognition ===
function updateOpeningName() {
    const el = document.getElementById('opening-name');
    if (!el || !window.identifyOpening) return;
    const sanMoves = [];
    const tempGame = new Chess();
    for (let i = 0; i <= currentMoveIndex && i < moveHistory.length; i++) {
        const m = tempGame.move(moveHistory[i].san) || tempGame.move(moveHistory[i].san, { sloppy: true });
        if (m) sanMoves.push(m.san);
    }
    const opening = identifyOpening(sanMoves);
    el.textContent = opening.eco ? `${opening.eco}: ${opening.name}` : opening.name;
}

// === Eval Bar ===
function evalToBarPercent(evalCp) {
    if (evalCp === null || evalCp === undefined) return 50;
    return 50 + 50 * (2 / (1 + Math.exp(-evalCp / 250)) - 1);
}

function updateEvalBar(evalWhite) {
    const fill = document.getElementById('eval-bar-fill');
    const text = document.getElementById('eval-bar-text');
    if (!fill || !text) return;
    const pct = evalToBarPercent(evalWhite);
    fill.style.height = pct + '%';
    if (evalWhite !== null && evalWhite !== undefined) {
        const pawn = evalWhite / 100;
        text.textContent = (pawn >= 0 ? '+' : '') + pawn.toFixed(1);
        text.style.color = pawn > 0.3 ? '#eee' : pawn < -0.3 ? '#aaa' : '#999';
    } else {
        text.textContent = '0.0';
        text.style.color = '#888';
    }
}

// === Move List ===
function renderMoveList() {
    const container = document.getElementById('move-list');
    if (!container) return;
    if (moveHistory.length === 0) {
        container.innerHTML = '<div style="color:#555;text-align:center;padding:12px;font-size:0.85rem">No moves loaded</div>';
        return;
    }

    let html = '<table class="move-list-table"><tbody>';
    for (let i = 0; i < moveHistory.length; i += 2) {
        const moveNum = Math.floor(i / 2) + 1;
        const wAnn = moveAnnotations[i];
        const bAnn = (i + 1 < moveHistory.length) ? moveAnnotations[i + 1] : null;
        const wClass = getAnnotationClass(wAnn);
        const bClass = getAnnotationClass(bAnn);
        const wActive = i === currentMoveIndex ? ' active' : '';
        const bActive = (i + 1) === currentMoveIndex ? ' active' : '';
        const wSymbol = getAnnotationSymbol(wAnn);
        const bSymbol = bAnn ? getAnnotationSymbol(bAnn) : '';

        html += `<tr>`;
        html += `<td class="move-num">${moveNum}.</td>`;
        html += `<td class="${wClass}${wActive}" onclick="goToMove(${i})">${moveHistory[i].san}${wSymbol}</td>`;
        if (i + 1 < moveHistory.length) {
            html += `<td class="${bClass}${bActive}" onclick="goToMove(${i + 1})">${moveHistory[i + 1].san}${bSymbol}</td>`;
        } else {
            html += `<td></td>`;
        }
        html += `</tr>`;
    }
    html += '</tbody></table>';
    container.innerHTML = html;

    scrollActiveMoveWithinMoveList(container);
}

/** Keeps the active move visible inside #move-list only — does not scroll the page. */
function scrollActiveMoveWithinMoveList(container) {
    const activeEl = container.querySelector('.active');
    if (!activeEl || !container) return;
    const pad = 8;
    const cRect = container.getBoundingClientRect();
    const eRect = activeEl.getBoundingClientRect();
    if (eRect.top < cRect.top + pad) {
        container.scrollTop += eRect.top - cRect.top - pad;
    } else if (eRect.bottom > cRect.bottom - pad) {
        container.scrollTop += eRect.bottom - cRect.bottom + pad;
    }
}

function getAnnotationClass(ann) {
    if (!ann) return 'move-good';
    const cls = ann.classification || 'good';
    return 'move-' + cls;
}

function getAnnotationSymbol(ann) {
    if (!ann) return '';
    switch (ann.classification) {
        case 'blunder': return ' ??';
        case 'mistake': return ' ?';
        case 'inaccuracy': return ' ?!';
        case 'best': return ' !';
        default: return '';
    }
}

// === Full Game Analysis ===
async function analyzeFullGame() {
    if (moveHistory.length === 0) { showToast('Load a game first'); return; }
    if (isFullAnalysisRunning) { showToast('Analysis already running'); return; }

    const btn = document.getElementById('full-analysis-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Analyzing...'; }

    isFullAnalysisRunning = true;
    const summaryEl = document.getElementById('game-summary');
    const progressEl = document.getElementById('analysis-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    if (summaryEl) summaryEl.classList.remove('hidden');
    if (progressEl) progressEl.classList.remove('hidden');

    if (!stockfishEngine.isReady) await ensureEngineReady();

    const total = moveHistory.length;
    moveAnnotations = new Array(total).fill(null);
    positionEvals = [];

    const useEngine = stockfishEngine.isReady;
    const tempGame = new Chess();
    const startResult = useEngine
        ? await stockfishEngine.analyzeFast(tempGame.fen(), 300)
        : await simpleAnalyzer.analyze(tempGame.fen(), 1);
    const startEval = toWhitePovCp(startResult.evaluation, startResult.scorePerspective || 'white', tempGame.fen());
    positionEvals.push(startEval || 0);

    for (let i = 0; i < total; i++) {
        const mv = moveHistory[i];
        const played = tempGame.move(mv.san) || tempGame.move(mv.san, { sloppy: true });
        if (!played) break;

        const fen = tempGame.fen();
        let result;
        try {
            result = useEngine
                ? await stockfishEngine.analyzeFast(fen, 300)
                : await simpleAnalyzer.analyze(fen, 1);
        } catch (_) {
            result = await simpleAnalyzer.analyze(fen, 1);
        }

        const evalW = toWhitePovCp(
            result.evaluation,
            result.scorePerspective || 'white',
            fen
        ) || 0;
        positionEvals.push(evalW);

        const prevEval = positionEvals[i];
        const side = mv.color || (i % 2 === 0 ? 'w' : 'b');
        const loss = side === 'w' ? (prevEval - evalW) : (evalW - prevEval);

        let classification = 'good';
        if (loss >= 300) classification = 'blunder';
        else if (loss >= 100) classification = 'mistake';
        else if (loss >= 30) classification = 'inaccuracy';
        else if (loss <= 5) classification = 'best';

        moveAnnotations[i] = {
            eval: evalW,
            bestMove: result.bestMoves && result.bestMoves[0] ? (result.bestMoves[0].san || result.bestMoves[0].move) : null,
            classification,
            loss: Math.max(0, loss)
        };

        const pct = Math.round(((i + 1) / total) * 100);
        if (progressFill) progressFill.style.width = pct + '%';
        if (progressText) progressText.textContent = pct + '%';

        if (i % 5 === 0 || i === total - 1) renderMoveList();
    }

    if (progressEl) progressEl.classList.add('hidden');
    showGameSummary();
    generateGameNarrative();
    renderMoveList();
    isFullAnalysisRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Full Analysis'; }
    showToast('Full game analysis complete');
}

function acplToRating(acpl) {
    if (acpl <= 0) return 3200;
    const raw = Math.round(2830 * Math.exp(-acpl / 130));
    return Math.max(400, Math.min(3200, raw));
}

function ratingLabel(rating) {
    if (rating >= 2500) return 'GM';
    if (rating >= 2300) return 'IM';
    if (rating >= 2100) return 'FM';
    if (rating >= 1900) return 'Expert';
    if (rating >= 1600) return 'Club';
    if (rating >= 1200) return 'Intermediate';
    if (rating >= 800) return 'Beginner';
    return 'Novice';
}

function showGameSummary() {
    const summaryEl = document.getElementById('game-summary');
    if (summaryEl) summaryEl.classList.remove('hidden');

    let bestCount = 0, inaccCount = 0, mistakeCount = 0, blunderCount = 0, totalLoss = 0, counted = 0;
    let whiteLoss = 0, whiteMoves = 0, blackLoss = 0, blackMoves = 0;
    const critical = [];

    moveAnnotations.forEach((ann, i) => {
        if (!ann) return;
        counted++;
        const loss = ann.loss || 0;
        totalLoss += loss;
        const isWhite = i % 2 === 0;
        if (isWhite) { whiteLoss += loss; whiteMoves++; }
        else { blackLoss += loss; blackMoves++; }
        if (ann.classification === 'best') bestCount++;
        else if (ann.classification === 'inaccuracy') inaccCount++;
        else if (ann.classification === 'mistake') { mistakeCount++; critical.push({ idx: i, type: 'Mistake', loss }); }
        else if (ann.classification === 'blunder') { blunderCount++; critical.push({ idx: i, type: 'Blunder', loss }); }
    });

    const avgLoss = counted > 0 ? totalLoss / counted : 0;
    const accuracy = Math.max(0, Math.min(100, 100 - avgLoss / 3)).toFixed(1);
    const whiteAcpl = whiteMoves > 0 ? whiteLoss / whiteMoves : 0;
    const blackAcpl = blackMoves > 0 ? blackLoss / blackMoves : 0;
    const whiteRating = acplToRating(whiteAcpl);
    const blackRating = acplToRating(blackAcpl);

    const el = (id) => document.getElementById(id);
    if (el('summary-accuracy')) el('summary-accuracy').textContent = accuracy + '%';
    if (el('summary-best')) el('summary-best').textContent = bestCount;
    if (el('summary-inaccuracies')) el('summary-inaccuracies').textContent = inaccCount;
    if (el('summary-mistakes')) el('summary-mistakes').textContent = mistakeCount;
    if (el('summary-blunders')) el('summary-blunders').textContent = blunderCount;

    if (el('rating-white')) el('rating-white').textContent = `~${whiteRating}`;
    if (el('acpl-white')) el('acpl-white').textContent = `ACPL ${whiteAcpl.toFixed(0)} · ${ratingLabel(whiteRating)}`;
    if (el('rating-black')) el('rating-black').textContent = `~${blackRating}`;
    if (el('acpl-black')) el('acpl-black').textContent = `ACPL ${blackAcpl.toFixed(0)} · ${ratingLabel(blackRating)}`;

    const critEl = document.getElementById('summary-critical');
    if (critEl) {
        if (critical.length === 0) {
            critEl.textContent = 'No critical moments detected.';
        } else {
            const top = critical.sort((a, b) => b.loss - a.loss).slice(0, 3);
            critEl.innerHTML = '<strong>Critical moments:</strong> ' +
                top.map(c => {
                    const moveNum = Math.floor(c.idx / 2) + 1;
                    const side = c.idx % 2 === 0 ? '' : '...';
                    return `Move ${moveNum}${side} ${moveHistory[c.idx].san} (${c.type}, −${(c.loss / 100).toFixed(1)})`;
                }).join('; ');
        }
    }
}

function hideGameSummary() {
    const el = document.getElementById('game-summary');
    if (el) el.classList.add('hidden');
    const narr = document.getElementById('game-narrative');
    if (narr) narr.classList.add('hidden');
}

function generateGameNarrative() {
    const el = document.getElementById('game-narrative');
    if (!el || moveHistory.length === 0 || positionEvals.length < 2) return;

    const total = moveHistory.length;
    const sanMoves = [];
    const tg = new Chess();
    for (let i = 0; i < total; i++) {
        const m = tg.move(moveHistory[i].san) || tg.move(moveHistory[i].san, { sloppy: true });
        if (m) sanMoves.push(m.san);
    }

    const opening = window.identifyOpening ? identifyOpening(sanMoves) : { name: 'Unknown', eco: '' };
    const moveRef = (idx) => {
        const num = Math.floor(idx / 2) + 1;
        const dots = idx % 2 === 0 ? '.' : '...';
        const san = moveHistory[idx] ? moveHistory[idx].san : '?';
        return `<span class="move-ref" onclick="goToMove(${idx})">${num}${dots}${san}</span>`;
    };

    const evalAt = (i) => (i >= 0 && i < positionEvals.length) ? positionEvals[i] : 0;
    const cp = (v) => { const p = v / 100; return (p >= 0 ? '+' : '') + p.toFixed(1); };

    // Phase boundaries
    const openingEnd = Math.min(total - 1, sanMoves.length <= 6 ? sanMoves.length - 1 : 11);
    const midStart = openingEnd + 1;
    const endgameStart = Math.min(total - 1, Math.max(midStart + 1, Math.floor(total * 0.7)));

    // Find turning points: biggest eval swings
    const swings = [];
    for (let i = 0; i < total; i++) {
        const ann = moveAnnotations[i];
        if (!ann) continue;
        const before = evalAt(i);
        const after = evalAt(i + 1);
        const swing = Math.abs(after - before);
        swings.push({ idx: i, swing, before, after, loss: ann.loss || 0, cls: ann.classification });
    }
    swings.sort((a, b) => b.swing - a.swing);
    const topSwings = swings.slice(0, 5);

    // Biggest single turning point
    const biggestTurn = topSwings[0] || null;

    // Find who had advantage at each phase
    const evalMid = evalAt(Math.min(midStart, positionEvals.length - 1));
    const evalEnd = evalAt(Math.min(endgameStart, positionEvals.length - 1));
    const evalFinal = evalAt(positionEvals.length - 1);

    const sideName = (v) => v > 30 ? 'White' : v < -30 ? 'Black' : 'neither side';
    const adv = (v) => {
        const abs = Math.abs(v / 100);
        if (abs < 0.3) return 'roughly equal';
        if (abs < 1) return 'a slight edge';
        if (abs < 3) return 'a clear advantage';
        return 'a decisive advantage';
    };

    // Count errors per side per phase
    const phaseErrors = (start, end) => {
        let wErr = [], bErr = [];
        for (let i = start; i <= end && i < total; i++) {
            const a = moveAnnotations[i];
            if (!a) continue;
            if (a.classification === 'blunder' || a.classification === 'mistake') {
                (i % 2 === 0 ? wErr : bErr).push(i);
            }
        }
        return { wErr, bErr };
    };

    const openingErrors = phaseErrors(0, openingEnd);
    const midErrors = phaseErrors(midStart, endgameStart - 1);
    const endErrors = phaseErrors(endgameStart, total - 1);

    let html = '';

    // Opening chapter
    html += '<h4>The Opening</h4>';
    html += `<p>The game began with the <strong>${opening.name}</strong>${opening.eco ? ` (${opening.eco})` : ''}. `;
    if (openingEnd >= 5) {
        const openingEval = evalAt(openingEnd + 1);
        html += `After the opening phase (through ${moveRef(openingEnd)}), the position stood at ${cp(openingEval)} — ${adv(openingEval)} for ${sideName(openingEval)}. `;
    }
    if (openingErrors.wErr.length > 0) {
        html += `White stumbled early with ${openingErrors.wErr.map(moveRef).join(', ')}. `;
    }
    if (openingErrors.bErr.length > 0) {
        html += `Black had trouble in the opening with ${openingErrors.bErr.map(moveRef).join(', ')}. `;
    }
    if (openingErrors.wErr.length === 0 && openingErrors.bErr.length === 0) {
        html += `Both sides navigated the opening cleanly. `;
    }
    html += '</p>';

    // Middlegame chapter
    if (midStart < total) {
        html += '<h4>The Middlegame</h4>';
        html += `<p>Entering the middlegame, the evaluation was ${cp(evalMid)} (${adv(evalMid)} for ${sideName(evalMid)}). `;

        const midSwings = topSwings.filter(s => s.idx >= midStart && s.idx < endgameStart);
        if (midSwings.length > 0) {
            const biggest = midSwings[0];
            const who = biggest.idx % 2 === 0 ? 'White' : 'Black';
            const what = biggest.cls === 'blunder' ? 'blundered' : biggest.cls === 'mistake' ? 'erred' : 'played inaccurately';
            html += `The critical middlegame moment came at ${moveRef(biggest.idx)}, where ${who} ${what} — the evaluation swung from ${cp(biggest.before)} to ${cp(biggest.after)}. `;
            if (biggest.loss >= 300) {
                html += `This was a game-changing moment that shifted the balance decisively. `;
            }
        }

        if (midErrors.wErr.length > 0 || midErrors.bErr.length > 0) {
            const midTotal = midErrors.wErr.length + midErrors.bErr.length;
            html += `The middlegame saw ${midTotal} significant error(s)`;
            if (midErrors.wErr.length > 0 && midErrors.bErr.length > 0) {
                html += ` from both sides`;
            } else if (midErrors.wErr.length > 0) {
                html += ` from White`;
            } else {
                html += ` from Black`;
            }
            html += `. `;
        } else {
            html += `Both players handled the middlegame complications well. `;
        }
        html += '</p>';
    }

    // Endgame / conclusion chapter
    if (endgameStart < total - 1) {
        html += '<h4>The Endgame</h4>';
        html += `<p>The game transitioned to the final phase at ${cp(evalEnd)}. `;

        const endSwings = topSwings.filter(s => s.idx >= endgameStart);
        if (endSwings.length > 0) {
            const biggest = endSwings[0];
            const who = biggest.idx % 2 === 0 ? 'White' : 'Black';
            html += `A key late moment was ${moveRef(biggest.idx)} by ${who}, shifting eval from ${cp(biggest.before)} to ${cp(biggest.after)}. `;
        }
        if (endErrors.wErr.length === 0 && endErrors.bErr.length === 0) {
            html += `Both sides played the endgame cleanly. `;
        }
        html += `The game concluded with the position standing at ${cp(evalFinal)}.</p>`;
    }

    // The story arc
    html += '<h4>The Story of This Game</h4>';
    html += '<p>';
    const evalProgression = [];
    const checkpoints = [0, Math.floor(total * 0.25), Math.floor(total * 0.5), Math.floor(total * 0.75), total - 1];
    checkpoints.forEach(c => {
        if (c < positionEvals.length) evalProgression.push({ idx: c, eval: evalAt(c + 1) || evalAt(c) });
    });

    let leadChanges = 0;
    let prevLead = 0;
    for (let i = 1; i < positionEvals.length; i++) {
        const cur = positionEvals[i] > 30 ? 1 : positionEvals[i] < -30 ? -1 : 0;
        if (cur !== 0 && cur !== prevLead) { leadChanges++; prevLead = cur; }
    }

    if (leadChanges >= 4) {
        html += `This was a back-and-forth battle with ${leadChanges} lead changes — a tense game where both players had their chances but neither could maintain control for long. `;
    } else if (leadChanges >= 2) {
        html += `The advantage shifted between the players at key moments, making this a game of missed opportunities for both sides. `;
    } else if (evalFinal > 100) {
        html += `White controlled the narrative for most of the game, steadily building and maintaining the advantage. `;
    } else if (evalFinal < -100) {
        html += `Black seized the initiative and never let go, dictating play throughout. `;
    } else {
        html += `This was a closely contested game where neither side could establish a lasting advantage. `;
    }

    if (biggestTurn) {
        const who = biggestTurn.idx % 2 === 0 ? 'White' : 'Black';
        html += `The single most impactful moment was ${moveRef(biggestTurn.idx)} — if ${who} could replay one move, this would be it.`;
    }
    html += '</p>';

    // Lessons
    html += '<h4>Lessons</h4>';

    let whiteLoss = 0, whiteMoves = 0, blackLoss = 0, blackMoves = 0;
    moveAnnotations.forEach((a, i) => {
        if (!a) return;
        if (i % 2 === 0) { whiteLoss += a.loss || 0; whiteMoves++; }
        else { blackLoss += a.loss || 0; blackMoves++; }
    });
    const wAcplVal = whiteMoves > 0 ? whiteLoss / whiteMoves : 0;
    const bAcplVal = blackMoves > 0 ? blackLoss / blackMoves : 0;

    // White lessons
    html += '<div class="lesson"><strong>For White:</strong> ';
    const wBlunders = moveAnnotations.filter((a, i) => a && i % 2 === 0 && a.classification === 'blunder');
    const wMistakes = moveAnnotations.filter((a, i) => a && i % 2 === 0 && a.classification === 'mistake');
    if (wBlunders.length > 0) {
        html += `The ${wBlunders.length} blunder(s) cost the most — focus on checking for opponent threats before committing to your plan. `;
    } else if (wMistakes.length > 0) {
        html += `The ${wMistakes.length} mistake(s) added up. Take an extra moment on critical moves to verify your calculation. `;
    } else if (wAcplVal < 20) {
        html += `Excellent play overall. To push further, look for positions where you can squeeze out small edges in equal positions. `;
    } else {
        html += `Solid play with room to tighten up. Review the inaccuracies to find patterns — are they tactical oversights or positional misjudgments? `;
    }

    const wOpeningErr = openingErrors.wErr.length;
    if (wOpeningErr > 0) html += `The opening needs work — study the ${opening.name} more deeply. `;
    html += '</div>';

    // Black lessons
    html += '<div class="lesson"><strong>For Black:</strong> ';
    const bBlunders = moveAnnotations.filter((a, i) => a && i % 2 === 1 && a.classification === 'blunder');
    const bMistakes = moveAnnotations.filter((a, i) => a && i % 2 === 1 && a.classification === 'mistake');
    if (bBlunders.length > 0) {
        html += `The ${bBlunders.length} blunder(s) were decisive. Before each move, ask: "What is my opponent threatening?" `;
    } else if (bMistakes.length > 0) {
        html += `The ${bMistakes.length} mistake(s) gave away the edge. Double-check candidate moves before executing. `;
    } else if (bAcplVal < 20) {
        html += `Very strong play. Focus on converting small advantages into wins — technique in better positions is the next frontier. `;
    } else {
        html += `Decent overall but can improve. Look at whether errors came from time pressure, tactical blindness, or strategic misunderstanding. `;
    }

    const bOpeningErr = openingErrors.bErr.length;
    if (bOpeningErr > 0) html += `The opening defense needs refinement — review common plans in the ${opening.name}. `;
    html += '</div>';

    el.innerHTML = html;
    el.classList.remove('hidden');
}

// === Analysis ===
function toWhitePovCp(evaluation, scorePerspective, fen) {
    if (evaluation === null || evaluation === undefined) return null;
    if (scorePerspective === 'white') return evaluation;
    const side = (fen.split(' ')[1] || 'w');
    return side === 'w' ? evaluation : -evaluation;
}

function formatDebugMeta(engineResult) {
    const ready = stockfishEngine && stockfishEngine.isReady ? 'yes' : 'no';
    const scoreWhite = engineResult && engineResult.evaluation !== null
        ? toWhitePovCp(engineResult.evaluation, engineResult.scorePerspective || 'white', currentFen) : null;
    const score = scoreWhite !== null ? `${(scoreWhite / 100).toFixed(2)}` : 'n/a';
    const best = engineResult && engineResult.bestMoves && engineResult.bestMoves[0]
        ? (engineResult.bestMoves[0].san || engineResult.bestMoves[0].move) : 'n/a';
    const depth = engineResult && engineResult.depth !== undefined && engineResult.depth !== null ? String(engineResult.depth) : 'n/a';
    const pv = engineResult && engineResult.principalVariation && engineResult.principalVariation.length > 0
        ? engineResult.principalVariation.slice(0, 6).join(' ') : 'n/a';
    return `engineReady: ${ready} | score: ${score} | depth: ${depth} | bestmove: ${best} | pv: ${pv}`;
}

function updateEngineDebugPanel(engineResult) {
    const meta = document.getElementById('engine-debug-meta');
    const lines = document.getElementById('engine-debug-lines');
    if (!meta || !lines) return;
    meta.textContent = formatDebugMeta(engineResult || {});
    const raw = engineResult && engineResult.rawLines ? engineResult.rawLines : [];
    lines.textContent = raw.length > 0 ? raw.slice(-12).join('\n') : '-';
}

function dedupeInsights(insights) {
    const seen = new Set();
    return insights.filter(i => {
        const key = [i.category, i.type, i.pattern, i.move, i.explanation].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function updateLongTermPlanPanel(engineResult, evaluationWhite) {
    const summaryEl = document.getElementById('plan-summary');
    const linesEl = document.getElementById('plan-lines');
    if (!summaryEl || !linesEl || !window.chessAnalyzer) return;
    const fen = game.fen();
    const bestMoves = engineResult && engineResult.bestMoves ? engineResult.bestMoves : [];
    const plan = window.chessAnalyzer.buildCoursePlan(game, fen, bestMoves, evaluationWhite);
    summaryEl.textContent = plan.summary || 'No plan available.';
    linesEl.innerHTML = (plan.lines || []).map(l => `<div class="plan-line">${l}</div>`).join('');
}

function createPositionOverviewInsight(analysisGame, fen, engineResult) {
    const brd = analysisGame.board();
    const pv = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    let wm = 0, bm = 0;
    brd.forEach(r => r.forEach(p => { if (p) { const v = pv[p.type] || 0; if (p.color === 'w') wm += v; else bm += v; } }));
    const md = wm - bm;
    const stm = (fen.split(' ')[1] || 'w') === 'w' ? 'White' : 'Black';
    const lm = analysisGame.moves({ verbose: true });
    const checks = lm.filter(m => (m.san || '').includes('+')).length;
    const caps = lm.filter(m => m.flags && m.flags.includes('c')).length;
    const matText = md === 0 ? 'Material is equal.' : md > 0 ? `White is up ${md} point(s).` : `Black is up ${-md} point(s).`;
    const hint = checks > 0 ? `${stm} has ${checks} check(s).` : caps > 0 ? `${stm} has ${caps} capture(s).` : `${stm} should improve activity.`;
    const best = engineResult && engineResult.bestMoves && engineResult.bestMoves[0]
        ? (engineResult.bestMoves[0].san || engineResult.bestMoves[0].move) : null;
    return {
        category: 'general', type: 'Position Overview',
        explanation: `${matText} ${stm} to move. ${hint}${best ? ` Best: ${best}.` : ''}`
    };
}

async function analyzePosition(options = {}) {
    const runId = ++analysisRunId;
    const auto = Boolean(options.auto);
    const fen = game.fen();
    currentFen = fen;

    if (!stockfishEngine.isReady) {
        const estimate = await simpleAnalyzer.analyze(fen, getTopNMovesSetting());
        if (runId !== analysisRunId || fen !== game.fen()) return;
        const score = toWhitePovCp(estimate.evaluation, estimate.scorePerspective || 'white', fen);
        updateEvalBar(score);
        updateEvaluationScore(score, true);
        await ensureEngineReady();
        if (runId !== analysisRunId || fen !== game.fen()) return;
    }
    const usingEngine = stockfishEngine.isReady;
    let evaluationWhite = null;

    const engineStatus = document.getElementById('engine-status');
    if (engineStatus) engineStatus.textContent = usingEngine ? 'Stockfish analyzing…' : 'Estimated score (Stockfish unavailable)';

    try {
        let engineResult = null;
        if (usingEngine) {
            try { engineResult = await stockfishEngine.analyze(fen, getTopNMovesSetting()); }
            catch (e) {
                stockfishEngine.isReady = false;
                engineResult = await simpleAnalyzer.analyze(fen, getTopNMovesSetting());
                engineResult.rawLines = [`engine-error: ${e && e.message || e}`, ...(engineResult.rawLines || [])];
            }
        } else {
            engineResult = await simpleAnalyzer.analyze(fen, getTopNMovesSetting());
        }

        if (engineResult.evaluation === null || engineResult.evaluation === undefined) {
            const fb = await simpleAnalyzer.analyze(fen, getTopNMovesSetting());
            engineResult.evaluation = fb.evaluation;
            engineResult.scorePerspective = fb.scorePerspective || 'white';
            if (!engineResult.bestMoves || !engineResult.bestMoves.length) engineResult.bestMoves = fb.bestMoves || [];
            if (!engineResult.principalVariation || !engineResult.principalVariation.length) engineResult.principalVariation = fb.principalVariation || [];
            if (!engineResult.depth && fb.depth !== undefined) engineResult.depth = fb.depth;
            if (!engineResult.rawLines) engineResult.rawLines = [];
            engineResult.rawLines.push(...(fb.rawLines || []), 'fallback-score-used');
        }

        evaluationWhite = toWhitePovCp(engineResult.evaluation, engineResult.scorePerspective || 'white', fen);

        if (runId !== analysisRunId || fen !== game.fen()) return;
        updateEngineDebugPanel(engineResult);
        updateEvalBar(evaluationWhite);
        updateEvaluationScore(evaluationWhite, !usingEngine);

        const analysisGame = new Chess(fen);
        let insights = chessAnalyzer.analyze(analysisGame, fen, evaluationWhite, engineResult.bestMoves);
        if (insights.length === 0) insights.push(createPositionOverviewInsight(analysisGame, fen, engineResult));
        insights = dedupeInsights(insights);

        window.knowledgeBase.recordPosition(fen, insights);
        displayAnalysis(engineResult, insights, fen, evaluationWhite);
        if (engineStatus && usingEngine) engineStatus.textContent = `Stockfish · depth ${engineResult.depth || 0}`;
        updateLongTermPlanPanel(engineResult, evaluationWhite);
        updateKnowledgeDisplay();
    } catch (e) {
        if (runId !== analysisRunId || fen !== game.fen()) return;
        console.error('Analysis failed:', e);
        updateEngineDebugPanel({ evaluation: null, bestMoves: [], principalVariation: [], depth: 0, rawLines: [`error: ${e && e.message || e}`] });
        if (evaluationWhite === null) document.getElementById('eval-score').textContent = 'Analysis failed';
        setInsightsContent('<div class="insight-placeholder">Could not analyze this position.</div>');
        updateLongTermPlanPanel(null, null);
    }
}

function updateEvaluationScore(evaluationWhite, estimated = false) {
    const evalEl = document.getElementById('eval-score');
    if (evaluationWhite !== null && evaluationWhite !== undefined) {
        const ev = evaluationWhite / 100;
        evalEl.textContent = `${ev >= 0 ? '+' : ''}${ev.toFixed(2)} (White POV)${estimated ? ' · estimated' : ''}`;
        evalEl.style.color = ev > 0.5 ? '#6fcf97' : ev < -0.5 ? '#f06565' : '#4a9eff';
    } else {
        evalEl.textContent = stockfishEngine.isReady ? 'No score yet' : 'Heuristic only';
        evalEl.style.color = '#4a9eff';
    }

    const boardScore = document.getElementById('board-eval-score');
    if (boardScore) boardScore.textContent = evalEl.textContent;
}

function setInsightsContent(html) {
    const container = document.getElementById('insights-container');
    container.innerHTML = html;
    // New analysis belongs to a new position; start its insights at the top.
    // Scroll this panel only, keeping the board and page in place.
    container.scrollTop = 0;
}

function displayAnalysis(engineResult, insights, fen, evaluationWhite) {
    if (fen !== game.fen()) return;
    updateEvaluationScore(evaluationWhite, !stockfishEngine.isReady);
    const topBM = engineResult.bestMoves && engineResult.bestMoves[0] ? engineResult.bestMoves[0].move : null;
    if (topBM) drawBestMoveArrow(topBM, fen); else clearBestMoveArrow();

    if (insights.length === 0) { setInsightsContent('<div class="insight-placeholder">No specific insights</div>'); return; }

    const topMoves = (engineResult.bestMoves || []).slice(0, getTopNMovesSetting()).filter(m => m && (m.san || m.move));
    const stm = (fen.split(' ')[1] || 'w') === 'w' ? 'White' : 'Black';
    const topMovesHtml = topMoves.length > 0 ? `<div class="insight-card">
        <span class="type">top moves</span>
        <div class="content">${topMoves.map((m, i) => {
            const mvE = (m.evaluation !== undefined && m.evaluation !== null)
                ? toWhitePovCp(m.evaluation, engineResult.scorePerspective || 'white', fen) : null;
            const eText = mvE !== null ? ` (${mvE >= 0 ? '+' : ''}${(mvE / 100).toFixed(2)})` : '';
            return `${i + 1}. ${m.san || m.move}${eText}`;
        }).join('<br>')}</div>
        <div class="top-moves-hint">Sorted by engine score (White POV). ${stm} to move: line 1 is best for ${stm}. Move-list “!” means excellent accuracy (≤5cp loss), not always engine line #1.</div>
    </div>` : '';

    const pvSan = engineResult.principalVariation && engineResult.principalVariation.length > 1
        ? chessAnalyzer.pvToSanSequence(engineResult.principalVariation, fen) : [];
    const pvHtml = pvSan.length > 1
        ? `<div class="insight-card"><span class="type">engine line</span><div class="pv-line">${
            chessAnalyzer.pvToDescription(pvSan, (fen.split(' ')[1] || 'w') === 'w' ? 'White' : 'Black')
        }</div></div>` : '';

    setInsightsContent(`${topMovesHtml}${pvHtml}${insights.map(ins => `
        <div class="insight-card">
            <span class="type">${ins.type || ins.category}</span>
            <div class="content">${ins.explanation}</div>
            ${ins.bestMoves && ins.bestMoves[0] ? `<div class="best-move">Best: ${ins.bestMoves[0].san || ins.bestMoves[0].move}</div>` : ''}
        </div>
    `).join('')}`);
}

// === Arrow Drawing ===
function getSquareElement(sq) {
    return document.querySelector(`[data-square="${sq}"]`) || document.querySelector(`.square-${sq}`);
}

function clearBestMoveArrow() {
    lastBestMoveUci = null;
    lastBestMoveFen = null;
    const svg = document.getElementById('best-move-arrow');
    if (svg) svg.classList.remove('visible');
}

function drawBestMoveArrow(uciMove, fen = lastBestMoveFen || game.fen()) {
    // Deferred redraws and worker results must refer to this exact position.
    if (fen !== game.fen() || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uciMove || '')) {
        clearBestMoveArrow();
        return;
    }
    const position = new Chess(fen);
    const legalMove = position.move({ from: uciMove.slice(0, 2), to: uciMove.slice(2, 4), promotion: uciMove[4] || 'q' });
    if (!legalMove) { clearBestMoveArrow(); return; }
    if (!uciMove || uciMove.length < 4) { clearBestMoveArrow(); return; }
    const fromEl = getSquareElement(uciMove.slice(0, 2));
    const toEl = getSquareElement(uciMove.slice(2, 4));
    const wrap = document.getElementById('board-wrap');
    const svg = document.getElementById('best-move-arrow');
    const line = document.getElementById('best-move-line');
    if (!fromEl || !toEl || !wrap || !svg || !line) { clearBestMoveArrow(); return; }

    const br = wrap.getBoundingClientRect();
    // Arrow coordinates are CSS pixels; keep the SVG coordinate system aligned
    // with the actual responsive board instead of assuming a 400px board.
    svg.setAttribute('viewBox', `0 0 ${br.width} ${br.height}`);
    const squareSize = br.width / 8;
    const headSize = Math.max(18, Math.min(26, squareSize * 0.5));
    const marker = document.getElementById('arrowhead');
    if (marker) {
        marker.setAttribute('markerWidth', String(headSize));
        marker.setAttribute('markerHeight', String(headSize));
    }
    line.style.strokeWidth = String(Math.max(4, Math.min(7, squareSize * 0.14)));
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    line.setAttribute('x1', String(fr.left + fr.width / 2 - br.left));
    line.setAttribute('y1', String(fr.top + fr.height / 2 - br.top));
    line.setAttribute('x2', String(tr.left + tr.width / 2 - br.left));
    line.setAttribute('y2', String(tr.top + tr.height / 2 - br.top));
    svg.classList.add('visible');
    lastBestMoveUci = uciMove;
    lastBestMoveFen = fen;
}

// === Knowledge ===
function updateKnowledgeDisplay() {
    const stats = window.knowledgeBase.getStats();
    document.getElementById('positions-analyzed').textContent = stats.positionsAnalyzed;
    document.getElementById('patterns-learned').textContent = stats.patternsLearned;
    const topPatterns = window.knowledgeBase.getTopPatterns(5);
    const listEl = document.getElementById('knowledge-list');
    if (topPatterns.length === 0) {
        listEl.innerHTML = '<div style="color:#666;text-align:center;padding:16px">No patterns yet</div>';
    } else {
        listEl.innerHTML = topPatterns.map(p => `
            <div class="knowledge-item">
                <span class="pattern">${p.name} <small style="color:#666">(${p.category})</small></span>
                <span class="count">${p.count}×</span>
            </div>`).join('');
    }
}

function exportKnowledge() {
    const data = window.knowledgeBase.export();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chess-knowledge-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Knowledge exported!');
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

window.addEventListener('resize', resizeResponsiveBoard);
window.addEventListener('orientationchange', resizeResponsiveBoard);

let boardResizeFrame = null;
function resizeResponsiveBoard() {
    if (boardResizeFrame !== null) cancelAnimationFrame(boardResizeFrame);
    boardResizeFrame = requestAnimationFrame(() => {
        boardResizeFrame = null;
        if (!board) return;
        board.resize();
        if (lastBestMoveUci) drawBestMoveArrow(lastBestMoveUci);
    });
}

// Observe the container, not the board whose height resize() changes.
document.addEventListener('DOMContentLoaded', () => {
    if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(resizeResponsiveBoard);
        observer.observe(document.querySelector('.board-with-eval'));
    }
});

window.getCoachContext = () => ({
    moveHistory,
    moveAnnotations,
    positionEvals
});

window.goToMove = goToMove;
