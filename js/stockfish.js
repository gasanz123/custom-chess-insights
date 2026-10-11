// Stockfish wrapper: dedicated worker only (stable path).

class StockfishEngine {
    constructor() {
        this.transport = null;
        this.isReady = false;
        this._lineHandler = null;
        this._initPromise = null;
        this.isAnalyzing = false;
        this.depth = 10;
        this.handshakeMs = 20000;
        this.analyzeMs = 4000;
        this.movetimeMs = 2000;
        this.workerUrls = [
            '/js/stockfish-worker-16.js',
            '/js/stockfish-worker.js',
            'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js'
        ];
    }

    _normalizeData(data) {
        if (data == null) return [];
        // Some builds post strings, others wrap payloads in objects.
        if (typeof data === 'object') {
            if (typeof data.data === 'string') data = data.data;
            else if (typeof data.message === 'string') data = data.message;
        }
        const text = typeof data === 'string' ? data : String(data);
        return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    }

    async init() {
        if (this._initPromise) return this._initPromise;

        this._initPromise = this._initInternal();
        try {
            await this._initPromise;
        } finally {
            this._initPromise = null;
        }
    }

    async _initInternal() {
        if (this.isAnalyzing) {
            throw new Error('Engine is busy analyzing');
        }
        if (this.transport) {
            this.quit();
        }

        let lastErr = null;
        for (const workerUrl of this.workerUrls) {
            try {
                await this._spawnWorkerFromUrl(workerUrl);
                await this._handshake(this.handshakeMs);
                this.isReady = true;
                return;
            } catch (e) {
                lastErr = e;
                this._teardownWorker();
            }
        }

        throw lastErr || new Error('Stockfish failed to start');
    }

    _spawnWorkerFromUrl(url) {
        return new Promise((resolve, reject) => {
            const worker = new Worker(url);
            const bootTimeout = setTimeout(() => {
                reject(new Error(`worker boot timeout for ${url}`));
            }, 10000);

            worker.onmessage = (e) => {
                clearTimeout(bootTimeout);
                for (const line of this._normalizeData(e.data)) {
                    if (this._lineHandler) this._lineHandler(line);
                }
            };

            worker.onerror = (e) => {
                clearTimeout(bootTimeout);
                reject(e.error || new Error(`worker error for ${url}`));
            };

            this.transport = {
                postMessage: (msg) => worker.postMessage(msg),
                terminate: () => worker.terminate(),
                quit: () => {
                    try {
                        worker.postMessage('quit');
                    } catch (_) {}
                }
            };
            // Resolve quickly; handshake will verify UCI readiness.
            clearTimeout(bootTimeout);
            resolve();
        });
    }

    _teardownWorker() {
        if (this.transport) {
            try {
                if (typeof this.transport.quit === 'function') this.transport.quit();
                if (typeof this.transport.terminate === 'function') this.transport.terminate();
            } catch (_) {}
        }
        this.transport = null;
        this.isReady = false;
        this._lineHandler = null;
    }

    _handshake(ms) {
        return new Promise((resolve, reject) => {
            let sawUciOk = false;
            let pingTimer = null;
            const t = setTimeout(() => {
                this._lineHandler = null;
                if (pingTimer) clearInterval(pingTimer);
                reject(new Error('Stockfish handshake timeout'));
            }, ms);
            this._lineHandler = (line) => {
                if (line.includes('uciok')) {
                    sawUciOk = true;
                    this.send('isready');
                }
                if (line.includes('readyok') && sawUciOk) {
                    clearTimeout(t);
                    if (pingTimer) clearInterval(pingTimer);
                    this._lineHandler = null;
                    resolve();
                }
            };
            // Keep nudging UCI until we get both uciok and readyok.
            pingTimer = setInterval(() => {
                this.send('uci');
                if (sawUciOk) this.send('isready');
            }, 500);
            this.send('uci');
        });
    }

    send(command) {
        if (this.transport) this.transport.postMessage(command);
    }

    /**
     * Sort MultiPV lines by score in White-POV terms for the side to move:
     * White wants higher eval; Black wants lower eval (worse for White).
     * Re-sync headline evaluation and PV to the true best line (fixes stale rank-1 scores).
     */
    finalizeBestMoves(fen, bestMoves, evaluation, principalVariation) {
        const side = (fen.split(' ')[1] || 'w');
        const arr = (bestMoves || []).filter((x) => x && x.move);
        if (arr.length === 0) {
            return { bestMoves: [], evaluation, principalVariation };
        }
        const missing = side === 'w' ? -9e9 : 9e9;
        arr.sort((a, b) => {
            const ea = a.evaluation !== undefined && a.evaluation !== null ? a.evaluation : missing;
            const eb = b.evaluation !== undefined && b.evaluation !== null ? b.evaluation : missing;
            if (side === 'w') return eb - ea;
            return ea - eb;
        });
        const top = arr[0];
        const newEval =
            top.evaluation !== undefined && top.evaluation !== null ? top.evaluation : evaluation;
        const newPv = top.pv && top.pv.length ? top.pv : principalVariation;
        return { bestMoves: arr, evaluation: newEval, principalVariation: newPv };
    }

    analyzeFast(fen, movetimeMs = 300) {
        return this.analyze(fen, 1, this.depth, { movetimeOverride: movetimeMs, timeoutOverride: movetimeMs + 800, skipNewGame: true });
    }

    analyze(fen, topN = 1, depth = this.depth, opts = {}) {
        const movetimeMs = opts.movetimeOverride || this.movetimeMs;
        const analyzeTimeout = opts.timeoutOverride || this.analyzeMs;
        const skipNewGame = opts.skipNewGame || false;
        return new Promise((resolve) => {
            const rootSide = (fen.split(' ')[1] || 'w');
            const toWhitePov = (cp) => (rootSide === 'w' ? cp : -cp);
            if (!this.transport) {
                resolve({
                    evaluation: null,
                    scorePerspective: 'white',
                    bestMoves: [],
                    principalVariation: [],
                    depth: 0,
                    rawLines: ['engine transport unavailable'],
                    lastScoreLine: null
                });
                return;
            }
            let evaluation = null;
            let bestMoves = [];
            let principalVariation = [];
            let currentDepth = 0;
            let settled = false;
            let lastScoreLine = null;
            const rawLines = [];
            const parsedTopN = Math.max(1, Math.min(20, parseInt(topN, 10) || 1));
            const pvByRank = new Map();

            const done = () => {
                clearTimeout(timeout);
                this._lineHandler = null;
                this.isAnalyzing = false;
            };

            const finish = (payload) => {
                if (settled) return;
                settled = true;
                done();
                resolve(payload);
            };

            const timeout = setTimeout(() => {
                this.send('stop');
                if ((!bestMoves || bestMoves.length === 0) && principalVariation[0]) {
                    const pvMove = principalVariation[0];
                    bestMoves = [{ move: pvMove, san: this.moveToSan(pvMove, fen), pv: principalVariation }];
                }
                if (!bestMoves || bestMoves.length === 0) {
                    bestMoves = Array.from(pvByRank.values())
                        .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                        .slice(0, parsedTopN)
                        .map((x) => ({
                            move: x.move,
                            san: x.san,
                            evaluation: x.evaluation,
                            pv: x.pv || []
                        }))
                        .filter((x) => x.move);
                }
                const fin = this.finalizeBestMoves(fen, bestMoves, evaluation, principalVariation);
                finish({
                    evaluation: fin.evaluation,
                    scorePerspective: 'white',
                    bestMoves: fin.bestMoves,
                    principalVariation: fin.principalVariation,
                    depth: currentDepth,
                    rawLines,
                    lastScoreLine
                });
            }, analyzeTimeout);

            this._lineHandler = (message) => {
                rawLines.push(message);
                if (rawLines.length > 40) rawLines.shift();
                if (message.startsWith('info')) {
                    const depthMatch = message.match(/\bdepth (\d+)\b/);
                    const scoreMatch = message.match(/\bscore (cp|mate) (-?\d+)\b/);
                    const pvMatch = message.match(/\bpv (.+)/);
                    const multipvMatch = message.match(/\bmultipv (\d+)\b/);
                    const rank = multipvMatch ? parseInt(multipvMatch[1], 10) : 1;

                    if (depthMatch) currentDepth = parseInt(depthMatch[1], 10);

                    if (scoreMatch) {
                        lastScoreLine = message;
                        const type = scoreMatch[1];
                        const value = parseInt(scoreMatch[2], 10);
                        const parsedEvalSideToMove = type === 'cp' ? value : (value > 0 ? 10000 : -10000);
                        const parsedEval = toWhitePov(parsedEvalSideToMove);
                        // Headline evaluation must come only from PV #1.
                        if (rank === 1) evaluation = parsedEval;

                        const existing = pvByRank.get(rank) || { rank };
                        existing.evaluation = parsedEval;
                        existing.depth = currentDepth;
                        pvByRank.set(rank, existing);
                    }

                    if (pvMatch) {
                        const pv = pvMatch[1].trim().split(/\s+/);
                        principalVariation = rank === 1 ? pv : principalVariation;
                        const firstMove = pv[0] || null;
                        const existing = pvByRank.get(rank) || { rank };
                        existing.pv = pv;
                        existing.move = firstMove;
                        existing.san = firstMove ? this.moveToSan(firstMove, fen) : null;
                        existing.depth = currentDepth;
                        pvByRank.set(rank, existing);
                    }
                }

                if (message.startsWith('bestmove')) {
                    const m = message.match(/bestmove (\S+)/);
                    const uci = m && m[1] && m[1] !== '(none)' ? m[1] : null;
                    if (uci) {
                        if (!pvByRank.has(1)) {
                            pvByRank.set(1, {
                                rank: 1,
                                move: uci,
                                san: this.moveToSan(uci, fen),
                                depth: currentDepth
                            });
                        }
                        bestMoves = Array.from(pvByRank.values())
                            .sort((a, b) => (a.rank || 99) - (b.rank || 99))
                            .slice(0, parsedTopN)
                            .map((x) => ({
                                move: x.move,
                                san: x.san,
                                evaluation: x.evaluation,
                                pv: x.pv || []
                            }))
                            .filter((x) => x.move);
                    }
                    const finDone = this.finalizeBestMoves(fen, bestMoves, evaluation, principalVariation);
                    finish({
                        evaluation: finDone.evaluation,
                        scorePerspective: 'white',
                        bestMoves: finDone.bestMoves,
                        principalVariation: finDone.principalVariation,
                        depth: currentDepth,
                        rawLines,
                        lastScoreLine
                    });
                }
            };

            this.isAnalyzing = true;
            this.send(`setoption name MultiPV value ${parsedTopN}`);
            if (!skipNewGame) this.send('ucinewgame');
            this.send(`position fen ${fen}`);
            this.send('isready');
            this.send(`go movetime ${movetimeMs}`);
        });
    }

    moveToSan(move, fen) {
        try {
            const tempGame = new Chess(fen);
            const from = move.substring(0, 2);
            const to = move.substring(2, 4);
            const promotion = move.length > 4 ? move[4] : undefined;
            const result = tempGame.move({ from, to, promotion });
            return result ? result.san : move;
        } catch (e) {
            return move;
        }
    }

    stop() {
        this.send('stop');
    }

    quit() {
        try {
            this.send('quit');
        } catch (_) {}
        this._teardownWorker();
    }
}

class SimpleAnalyzer {
    evaluateFen(fen) {
        try {
            const g = new Chess(fen);
            const side = fen.split(' ')[1] || 'w';

            if (g.game_over && g.game_over()) {
                if (g.in_checkmate && g.in_checkmate()) {
                    return side === 'w' ? -100000 : 100000;
                }
                return 0;
            }

            const board = g.board();
            const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
            let material = 0;
            board.forEach((row) => {
                row.forEach((piece) => {
                    if (!piece) return;
                    const v = values[piece.type] || 0;
                    material += piece.color === 'w' ? v : -v;
                });
            });

            // Small mobility term so different positions get different scores.
            const ownMobility = g.moves().length;
            const opp = new Chess(fen);
            // Flip side-to-move field to estimate opponent options quickly.
            const parts = fen.split(' ');
            parts[1] = side === 'w' ? 'b' : 'w';
            let oppMobility = 0;
            try {
                opp.load(parts.join(' '));
                oppMobility = opp.moves().length;
            } catch (_) {}

            const mobility = (ownMobility - oppMobility) * 3;
            const inCheckPenalty = (g.in_check && g.in_check())
                ? (side === 'w' ? -250 : 250)
                : 0;
            let oppChecks = 0;
            try {
                const oppMoves = opp.moves({ verbose: true });
                oppChecks = oppMoves.filter((m) => (m.san || '').includes('+')).length;
            } catch (_) {}
            const oppCheckPressure = (side === 'w' ? -1 : 1) * (oppChecks * 20);
            const evalFromWhite = material + mobility + inCheckPenalty + oppCheckPressure;
            return Number.isFinite(evalFromWhite) ? evalFromWhite : 0;
        } catch (_) {
            return 0;
        }
    }

    toUci(move) {
        if (!move || !move.from || !move.to) return null;
        return `${move.from}${move.to}${move.promotion || ''}`;
    }

    terminalScore(game, sideToMoveAtRoot) {
        if (!(game.game_over && game.game_over())) return null;
        if (game.in_checkmate && game.in_checkmate()) {
            const sideNow = game.turn();
            // Side to move is checkmated.
            return sideNow === 'w' ? -100000 : 100000;
        }
        return 0;
    }

    // 2-ply minimax fallback: rank moves by safe expected outcome.
    pickRankedMovesWithSafety(baseFen) {
        const root = new Chess(baseFen);
        const side = baseFen.split(' ')[1] || 'w';
        const rootMoves = root.moves({ verbose: true });
        if (rootMoves.length === 0) return [];
        const ranked = [];

        rootMoves.forEach((mv) => {
            const g1 = new Chess(baseFen);
            let played = g1.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
            if (!played && mv.san) played = g1.move(mv.san, { sloppy: true });
            if (!played) return;

            // Immediate tactical self-check: if move allows opponent mate in 1, punish heavily.
            const oppMoves = g1.moves({ verbose: true });
            let allowsMateIn1 = false;
            let worstReplyScore = side === 'w' ? Infinity : -Infinity;
            let worstReplyMove = null;

            if (oppMoves.length === 0) {
                const t = this.terminalScore(g1, side);
                worstReplyScore = t !== null ? t : this.evaluateFen(g1.fen());
            } else {
                oppMoves.forEach((oppMv) => {
                    const g2 = new Chess(g1.fen());
                    let oppPlayed = g2.move({
                        from: oppMv.from,
                        to: oppMv.to,
                        promotion: oppMv.promotion
                    });
                    if (!oppPlayed && oppMv.san) oppPlayed = g2.move(oppMv.san, { sloppy: true });
                    if (!oppPlayed) return;

                    if (g2.in_checkmate && g2.in_checkmate()) {
                        allowsMateIn1 = true;
                    }

                    const t = this.terminalScore(g2, side);
                    const score = t !== null ? t : this.evaluateFen(g2.fen());
                    if (side === 'w') {
                        if (score < worstReplyScore) {
                            worstReplyScore = score;
                            worstReplyMove = oppPlayed;
                        }
                    } else {
                        if (score > worstReplyScore) {
                            worstReplyScore = score;
                            worstReplyMove = oppPlayed;
                        }
                    }
                });
            }

            // Hard safety penalty for allowing forced mate in 1.
            if (allowsMateIn1) {
                worstReplyScore = side === 'w' ? -99999 : 99999;
            }

            ranked.push({
                move: played,
                reply: worstReplyMove,
                score: worstReplyScore
            });
        });

        ranked.sort((a, b) => (side === 'w' ? b.score - a.score : a.score - b.score));
        return ranked;
    }

    analyze(fen, topN = 1) {
        const baseFen = fen || new Chess().fen();
        const evaluation = this.evaluateFen(baseFen);
        const parsedTopN = Math.max(1, Math.min(20, parseInt(topN, 10) || 1));
        const ranked = this.pickRankedMovesWithSafety(baseFen).slice(0, parsedTopN);
        const bestMoves = ranked
            .map((r) => {
                const moveUci = this.toUci(r.move);
                const replyUci = this.toUci(r.reply);
                return {
                    move: moveUci || (r.move && r.move.san) || null,
                    san: (r.move && r.move.san) || moveUci,
                    evaluation: r.score,
                    pv: [moveUci, replyUci].filter(Boolean)
                };
            })
            .filter((x) => x.move);
        const bestUci = bestMoves[0] ? bestMoves[0].move : null;
        return Promise.resolve({
            evaluation,
            scorePerspective: 'white',
            bestMoves,
            principalVariation: bestMoves[0] ? bestMoves[0].pv : (bestUci ? [bestUci] : []),
            depth: 2,
            rawLines: ['fallback-eval', `fallback-bestmove: ${bestUci || 'none'}`]
        });
    }
}

window.stockfishEngine = new StockfishEngine();
window.simpleAnalyzer = new SimpleAnalyzer();
