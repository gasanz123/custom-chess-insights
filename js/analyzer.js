// Analyzer.js - Transforms engine output to human-readable insights

class ChessAnalyzer {
    constructor() {
        this.concepts = {
            // Development concepts
            'development': {
                detect: (game, move) => {
                    const piece = game.get(move.to);
                    if (piece && (piece.type === 'n' || piece.type === 'b')) {
                        const startRank = piece.color === 'w' ? 1 : 8;
                        const fromRank = move.from[1];
                        const toRank = move.to[1];
                        if ((piece.color === 'w' && fromRank === '1') || 
                            (piece.color === 'b' && fromRank === '8')) {
                            if ((piece.type === 'n' && ['c3', 'f3', 'c6', 'f6', 'd2', 'e2', 'd7', 'e7'].includes(move.to)) ||
                                (piece.type === 'b' && move.to.match(/[c-f][3-6]/))) {
                                return true;
                            }
                        }
                    }
                    return false;
                },
                explain: (move, game) =>
                    `Good development! Moving the ${this.getPieceName(game.get(move.to))} to ${move.to} gets your pieces off the back rank and into the game.`,
                pattern: 'piece-development'
            },
            
            // Center control
            'center-control': {
                detect: (game, move) => {
                    const centerSquares = ['d4', 'd5', 'e4', 'e5'];
                    const piece = game.get(move.to);
                    if (piece && (piece.type === 'p' || piece.type === 'n')) {
                        if (centerSquares.includes(move.to)) {
                            return true;
                        }
                    }
                    return false;
                },
                explain: (move) => `Controlling the center! The ${move.to} square is a key central square. Controlling the center gives your pieces more mobility.`,
                pattern: 'center-control'
            },
            
            // Castling
            'castling': {
                detect: (game, move) => {
                    return move.san && move.san.includes('O-O');
                },
                explain: (move) => {
                    const side =
                        move.san && move.san.includes('O-O-O') ? 'queenside' : 'kingside';
                    return `Castling ${side}! This important move achieves two goals: getting your king to safety and connecting your rooks.`;
                },
                pattern: 'king-safety'
            },
            
            // Pin
            'pin': {
                detect: (game, move, engineLines) => {
                    // Simplified pin detection from engine analysis
                    return engineLines && engineLines.some(line => 
                        line.note && line.note.toLowerCase().includes('pin')
                    );
                },
                explain: (move) => `Creating a pin! This tactic immobilizes an enemy piece because moving it would expose a more valuable piece behind it.`,
                pattern: 'pin'
            },
            
            // Fork
            'fork': {
                detect: (game, move, engineLines) => {
                    const piece = game.get(move.to);
                    if (piece && piece.type === 'n') {
                        // Knight forks are most common
                        return engineLines && engineLines.some(line => 
                            line.evaluation && Math.abs(line.evaluation) > 100
                        );
                    }
                    return false;
                },
                explain: (move) => `Knight fork! The knight's unique movement allows it to attack multiple pieces simultaneously. Your opponent must choose what to save.`,
                pattern: 'fork'
            }
        };
    }

    getPieceName(piece) {
        if (!piece) return 'piece';
        const names = {
            'p': 'pawn',
            'n': 'knight',
            'b': 'bishop',
            'r': 'rook',
            'q': 'queen',
            'k': 'king'
        };
        return names[piece.type] || 'piece';
    }

    // Main analysis function
    analyze(game, fen, engineEvaluation, bestMoves) {
        const insights = [];
        const history = game.history({ verbose: true });
        const lastMove = history.length > 0 ? history[history.length - 1] : null;

        if (engineEvaluation !== null && engineEvaluation !== undefined) {
            insights.push(this.analyzeEvaluation(game, fen, engineEvaluation, bestMoves || []));
        }

        // Detect tactical/positional themes
        if (lastMove) {
            Object.entries(this.concepts).forEach(([name, concept]) => {
                if (concept.detect(game, lastMove, bestMoves)) {
                    insights.push({
                        category: this.categorizeConcept(name),
                        type: name.replace('-', ' '),
                        pattern: concept.pattern,
                        explanation: concept.explain(lastMove, game),
                        move: lastMove.san
                    });
                }
            });
        }

        // Analyze position structure
        const positionalInsights = this.analyzePositionStructure(game, fen);
        insights.push(...positionalInsights);
        insights.push(...this.analyzeTacticalOptions(game, fen));
        insights.push(...this.analyzeLongTermPlans(game, fen, bestMoves || []));

        // Check knowledge base for related past insights
        const relatedInsights = window.knowledgeBase.getRelatedInsights(fen);
        if (relatedInsights.length > 0) {
            const uniquePatterns = Array.from(
                new Set(
                    relatedInsights
                        .map((i) => i.pattern)
                        .filter(Boolean)
                )
            ).slice(0, 3);
            const application = uniquePatterns
                .map((p) => this.getPatternApplicationText(p, game, fen))
                .filter(Boolean)
                .slice(0, 2);
            insights.push({
                category: 'memory',
                type: 'Previously Learned',
                explanation: uniquePatterns.length > 0
                    ? `You've seen ${relatedInsights.length} similar position(s). Patterns: ${uniquePatterns.join(', ')}.${application.length > 0 ? ` How this applies now: ${application.join(' ')}` : ''}`
                    : `You've seen ${relatedInsights.length} similar position(s).`,
                related: relatedInsights
            });
        }

        return insights;
    }

    analyzeLongTermPlans(game, fen, bestMoves) {
        const insights = [];
        const sideToMove = (fen.split(' ')[1] || 'w');
        const sideName = sideToMove === 'w' ? 'White' : 'Black';
        const legalMoves = game.moves({ verbose: true });
        const board = game.board();

        // 1) King safety plan if still uncastled with king in center.
        const kingSquare = this.findKing(board, sideToMove);
        if (kingSquare && kingSquare[0] === 'e') {
            insights.push({
                category: 'plan',
                type: 'Long-Term Plan',
                pattern: 'castle-and-coordinate',
                explanation: `${sideName}'s king is still centralized on ${kingSquare}. Long-term plan: prioritize castling, then connect rooks and centralize them behind your pawns.`
            });
        }

        // 2) Open-file/rook activity plan.
        const openFiles = this.getOpenFiles(board);
        const sideRooks = this.getPieceSquares(board, sideToMove, 'r');
        if (openFiles.length > 0 && sideRooks.length > 0) {
            const targetFile = openFiles[0];
            const rookOnOpenFile = sideRooks.some((sq) => sq[0] === targetFile);
            if (!rookOnOpenFile) {
                insights.push({
                    category: 'plan',
                    type: 'Long-Term Plan',
                    pattern: 'rook-to-open-file',
                    explanation: `There is an open file on ${targetFile}. Long-term plan: reroute a rook to the ${targetFile}-file and build pressure on entry squares (${targetFile}7/${targetFile}2).`
                });
            }
        }

        // 3) Pawn break plan from common central breaks.
        const candidateBreaks = sideToMove === 'w'
            ? ['c4', 'd4', 'e4', 'f4']
            : ['c5', 'd5', 'e5', 'f5'];
        const breakMoves = legalMoves.filter((m) =>
            m.piece === 'p' && candidateBreaks.includes(m.to)
        );
        if (breakMoves.length > 0) {
            const sample = breakMoves.slice(0, 2).map((m) => m.san).join(', ');
            insights.push({
                category: 'plan',
                type: 'Long-Term Plan',
                pattern: 'pawn-break',
                explanation: `A strategic pawn break is available (${sample}). Long-term plan: prepare this break with piece support, then open lines for your bishops and rooks.`
            });
        }

        // 4) Improvement plan from engine top move (if available).
        if (bestMoves && bestMoves[0]) {
            const bm = bestMoves[0];
            const bmText = bm.san || bm.move;
            const bmSan = bm.san || '';
            let planText = null;
            if (bmSan.includes('O-O')) {
                planText = `The engine's top move (${bmText}) supports king safety first; follow up by activating rooks and contesting central/open files.`;
            } else if (bmSan.includes('x')) {
                planText = `The top move (${bmText}) simplifies tactically. Long-term plan: convert the resulting structural/material edge by trading favorable pieces.`;
            } else if (/^[RNBQK]/.test(bmSan)) {
                planText = `The top move (${bmText}) is a piece-improvement move. Long-term plan: keep improving worst-placed pieces before committing to pawn advances.`;
            }
            if (planText) {
                insights.push({
                    category: 'plan',
                    type: 'Plan from Best Move',
                    pattern: 'engine-plan',
                    explanation: planText
                });
            }
        }

        return insights;
    }

    getPieceSquares(board, color, type) {
        const squares = [];
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const p = board[i][j];
                if (p && p.color === color && p.type === type) {
                    squares.push(String.fromCharCode(97 + j) + (8 - i));
                }
            }
        }
        return squares;
    }

    getOpenFiles(board) {
        const files = [];
        for (let file = 0; file < 8; file++) {
            let hasPawn = false;
            for (let rank = 0; rank < 8; rank++) {
                const p = board[rank][file];
                if (p && p.type === 'p') {
                    hasPawn = true;
                    break;
                }
            }
            if (!hasPawn) files.push(String.fromCharCode(97 + file));
        }
        return files;
    }

    getPatternApplicationText(pattern, game, fen) {
        const side = (fen.split(' ')[1] || 'w') === 'w' ? 'White' : 'Black';
        const legalMoves = game.moves({ verbose: true });
        if (pattern === 'forcing-checks') {
            const checks = legalMoves.filter((m) => (m.san || '').includes('+')).length;
            return checks > 0
                ? `${side} has ${checks} checking move(s), so forcing play is available.`
                : `${side} currently has no direct checks, so improve piece activity first.`;
        }
        if (pattern === 'captures-available') {
            const captures = legalMoves.filter((m) => m.flags && m.flags.includes('c')).length;
            return captures > 0
                ? `${side} can consider ${captures} capture(s); compare resulting king safety before choosing.`
                : `No immediate captures stand out, so focus on improving coordination.`;
        }
        if (pattern === 'king-safety' || pattern === 'king-in-check' || pattern === 'mate-threat') {
            return game.in_check && game.in_check()
                ? `${side} king is under direct pressure now; prioritize defense.`
                : `${side} king safety remains important in this structure.`;
        }
        if (pattern === 'piece-development' || pattern === 'center-control') {
            return `This position still rewards active development and central control.`;
        }
        if (pattern === 'mate-opportunity') {
            return `Check forcing checks and mating nets before playing slower moves.`;
        }
        return '';
    }

    buildCoursePlan(game, fen, bestMoves, evaluationWhite) {
        const side = (fen.split(' ')[1] || 'w');
        const sideName = side === 'w' ? 'White' : 'Black';
        const fullmove = parseInt((fen.split(' ')[5] || '1'), 10);
        const board = game.board();
        const legalMoves = game.moves({ verbose: true });

        const phase = fullmove <= 12 ? 'opening' : (fullmove <= 30 ? 'middlegame' : 'late middlegame/endgame');
        const dev = this.countDevelopedMinorPieces(board, side);
        const kingSq = this.findKing(board, side) || '?';
        const inCheck = game.in_check && game.in_check();
        const checks = legalMoves.filter((m) => (m.san || '').includes('+')).length;
        const captures = legalMoves.filter((m) => m.flags && m.flags.includes('c')).length;

        let summary = `${sideName} to move in the ${phase}.`;
        const lines = [];

        if (inCheck) {
            summary = `${sideName} is under immediate king pressure.`;
            lines.push('1) Immediate priority: neutralize the check with the most forcing defensive move.');
            lines.push('2) Next: trade attacking pieces or force simplification to reduce mating threats.');
            lines.push('3) Then: improve king shelter before expanding elsewhere.');
            return { summary, lines };
        }

        const topMove = bestMoves && bestMoves[0] ? bestMoves[0] : null;
        const topSan = topMove ? (topMove.san || topMove.move || '') : '';
        const topIntent = this.classifyMoveIntent(topSan);

        // Opening-course style progression: immediate idea -> transition -> target position.
        if (phase === 'opening') {
            lines.push(
                `1) Immediate idea: ${this.getIntentImmediateIdea(topIntent, topSan, {
                    dev,
                    kingSq,
                    checks,
                    captures
                })}`
            );
            if (checks > 0 || captures > 0) {
                lines.push(`2) Tactical checkpoint: verify forcing options first (${checks} checks, ${captures} captures).`);
            } else {
                lines.push('2) Tactical checkpoint: no forcing play stands out, so continue principled piece improvement.');
            }
            lines.push(
                `3) Transition goal: ${this.getIntentTransitionGoal(topIntent)}`
            );
        } else {
            lines.push(`1) Immediate idea: ${this.getIntentImmediateIdea(topIntent, topSan, { dev, kingSq, checks, captures })}`);
            lines.push(`2) Transition: ${this.getIntentTransitionGoal(topIntent)}`);
            lines.push(`3) Conversion goal: ${this.getIntentConversionGoal(topIntent)}`);
        }

        if (bestMoves && bestMoves[0]) {
            const bm = bestMoves[0].san || bestMoves[0].move;
            const pvUci = bestMoves[0].pv || [];
            const pvSan = this.pvToSanSequence(pvUci, fen);
            const pvDesc = this.pvToDescription(pvSan, sideName);
            if (pvDesc && pvSan.length > 1) {
                lines.unshift(`Engine line: ${pvDesc}`);
            } else {
                lines.unshift(`Engine-guided candidate: ${bm}`);
            }
        }

        if (evaluationWhite !== null && evaluationWhite !== undefined) {
            const evalPawns = (evaluationWhite / 100).toFixed(2);
            summary += ` Eval: ${evalPawns >= 0 ? '+' : ''}${evalPawns}.`;
        }

        return { summary, lines };
    }

    classifyMoveIntent(san) {
        if (!san) return 'unknown';
        if (san.includes('O-O')) return 'castle';
        if (san.includes('#') || san.includes('+')) return 'check';
        if (san.includes('x')) return 'capture';
        if (/^[a-h][1-8]$/.test(san)) return 'pawn-push';
        if (/^[a-h]x[a-h][1-8]/.test(san)) return 'pawn-capture';
        if (/^[RNBQK]/.test(san)) return 'piece-improve';
        return 'quiet';
    }

    getIntentImmediateIdea(intent, san, ctx) {
        const castleHint = ctx.kingSq === 'e1' || ctx.kingSq === 'e8'
            ? ' while keeping castling in your near-term priorities'
            : '';
        if (intent === 'capture' || intent === 'pawn-capture') {
            return `${san} aims to win/secure material or improve pawn structure first${castleHint}.`;
        }
        if (intent === 'check') {
            return `${san} is a forcing move to seize initiative and restrict the opponent king.`;
        }
        if (intent === 'castle') {
            return `${san} prioritizes king safety and rook activation before wider expansion.`;
        }
        if (intent === 'pawn-push') {
            return `${san} claims space and supports a future pawn break plan.`;
        }
        if (intent === 'piece-improve') {
            return `${san} improves piece activity and coordination (${ctx.dev}/4 minor pieces developed).`;
        }
        return `finish development (${ctx.dev}/4 minor pieces developed) and secure king safety${castleHint}.`;
    }

    getIntentTransitionGoal(intent) {
        if (intent === 'capture' || intent === 'pawn-capture') {
            return 'consolidate the gain, prevent counterplay, then activate remaining pieces.';
        }
        if (intent === 'check') {
            return 'convert initiative into concrete gains (material, king exposure, or improved piece placement).';
        }
        if (intent === 'castle') {
            return 'shift from safety to central/open-file pressure with coordinated rooks.';
        }
        if (intent === 'pawn-push') {
            return 'support the advanced pawn with pieces and open lines at the right moment.';
        }
        return 'complete development into coordinated pressure on central/open files.';
    }

    getIntentConversionGoal(intent) {
        if (intent === 'capture' || intent === 'pawn-capture') {
            return 'convert the structural/material edge with favorable trades and safe king position.';
        }
        if (intent === 'check') {
            return 'carry the initiative into a decisive attack or a favorable simplified position.';
        }
        if (intent === 'castle') {
            return 'use king safety to outmaneuver and create lasting pressure on targets.';
        }
        if (intent === 'pawn-push') {
            return 'turn space advantage into concrete weaknesses and entry squares.';
        }
        return 'enter a favorable structure/endgame by simplifying on your terms.';
    }

    pvToSanSequence(pvUci, fen) {
        if (!pvUci || pvUci.length === 0) return [];
        try {
            const g = new Chess(fen);
            const result = [];
            for (const uci of pvUci) {
                if (!uci || uci.length < 4) break;
                const from = uci.slice(0, 2);
                const to = uci.slice(2, 4);
                const promo = uci.length > 4 ? uci[4] : undefined;
                const m = g.move({ from, to, promotion: promo });
                if (!m) break;
                result.push(m.san);
            }
            return result;
        } catch (_) {
            return [];
        }
    }

    pvToDescription(pvSan, sideName) {
        if (!pvSan || pvSan.length === 0) return '';
        const seq = pvSan.slice(0, 6);
        const formatted = seq.map((m, i) => {
            const moveNum = Math.floor(i / 2) + 1;
            if (i === 0) return `${sideName === 'White' ? moveNum + '.' : moveNum + '...'} ${m}`;
            if (i % 2 === 0) return `${Math.floor(i / 2) + 1}. ${m}`;
            return m;
        }).join(' ');
        return formatted;
    }

    countDevelopedMinorPieces(board, color) {
        const homeRank = color === 'w' ? 7 : 0; // board index rank for 1/8
        const minorFiles = [1, 2, 5, 6]; // b, c, f, g
        let undeveloped = 0;
        minorFiles.forEach((f) => {
            const p = board[homeRank][f];
            if (p && p.color === color && (p.type === 'n' || p.type === 'b')) undeveloped++;
        });
        return 4 - undeveloped;
    }

    analyzeEvaluation(game, fen, evaluation, bestMoves) {
        const perspectiveEval = evaluation; // already normalized to White POV by caller

        let explanation = '';
        let type = 'position';
        let category = 'positional';

        if (perspectiveEval > 300) {
            explanation = `Strong winning advantage (+${(perspectiveEval/100).toFixed(1)}). Your position is excellent - look for ways to convert this advantage.`;
            type = 'winning advantage';
            category = 'evaluation';
        } else if (perspectiveEval > 100) {
            explanation = `Clear advantage (+${(perspectiveEval/100).toFixed(1)}). You're better - look for ways to increase the pressure.`;
            type = 'advantage';
            category = 'evaluation';
        } else if (perspectiveEval > 30) {
            explanation = `Slight edge (+${(perspectiveEval/100).toFixed(1)}). Small advantage - keep building your position.`;
            type = 'slight advantage';
            category = 'evaluation';
        } else if (perspectiveEval < -300) {
            explanation = `Difficult position (${(perspectiveEval/100).toFixed(1)}). Look for defensive resources and counterplay.`;
            type = 'difficult';
            category = 'evaluation';
        } else if (perspectiveEval < -100) {
            explanation = `Worse position (${(perspectiveEval/100).toFixed(1)}). Stay solid and look for opportunities to equalize.`;
            type = 'worse';
            category = 'evaluation';
        } else {
            explanation = `Equal position (${perspectiveEval > 0 ? '+' : ''}${(perspectiveEval/100).toFixed(1)}). Position is roughly balanced - focus on active piece play.`;
            type = 'equal';
            category = 'evaluation';
        }

        // Add best move explanation
        if (bestMoves && bestMoves[0]) {
            const bestMove = bestMoves[0];
            explanation += ` Best move: ${bestMove.san || bestMove.move}. ${this.explainMovePurpose(bestMove)}.`;
        }

        return {
            category,
            type,
            explanation,
            evaluation: perspectiveEval,
            bestMoves: bestMoves.slice(0, 3)
        };
    }

    explainMovePurpose(moveInfo) {
        if (!moveInfo.san && !moveInfo.move) return '';
        
        const san = moveInfo.san || moveInfo.move || '';
        
        // Basic explanations based on move characteristics
        if (san.includes('x')) {
            return 'Captures material';
        }
        if (san.includes('+')) {
            return 'Gives check';
        }
        if (san.includes('O-O')) {
            return 'Castles for king safety';
        }
        if (san.match(/[QRBN][a-h][1-8]/)) {
            return 'Improves piece position';
        }
        
        return 'Improves your position';
    }

    analyzePositionStructure(game, fen) {
        const insights = [];
        const board = game.board();
        
        // Count material
        let whiteMaterial = 0;
        let blackMaterial = 0;
        const pieceValues = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9 };
        
        board.forEach(row => {
            row.forEach(piece => {
                if (piece) {
                    const value = pieceValues[piece.type] || 0;
                    if (piece.color === 'w') whiteMaterial += value;
                    else blackMaterial += value;
                }
            });
        });

        const materialDiff = whiteMaterial - blackMaterial;
        if (Math.abs(materialDiff) >= 2) {
            insights.push({
                category: 'material',
                type: 'Material Balance',
                explanation: materialDiff > 0 
                    ? `White has +${materialDiff} material advantage. Trade pieces when ahead.`
                    : `Black has +${-materialDiff} material advantage. Trade pieces when ahead.`,
                pattern: 'material-imbalance'
            });
        }

        // Check for king safety issues
        const turn = fen.split(' ')[1];
        const kingPos = this.findKing(board, turn);
        if (kingPos) {
            const kingSafety = this.assessKingSafety(game, kingPos, turn);
            if (kingSafety.issues > 0) {
                insights.push({
                    category: 'positional',
                    type: 'King Safety',
                    explanation: `Your king on ${kingPos} has ${kingSafety.issues} potential weakness(es). ${kingSafety.advice}`,
                    pattern: 'king-safety'
                });
            }
        }

        return insights;
    }

    analyzeTacticalOptions(game, fen) {
        const insights = [];
        const legalMoves = game.moves({ verbose: true });
        const checkingMoves = legalMoves.filter((m) => (m.san || '').includes('+'));
        const captures = legalMoves.filter((m) => m.flags && m.flags.includes('c'));
        const side = (fen.split(' ')[1] || 'w') === 'w' ? 'White' : 'Black';
        const mateInOne = this.findMateInOneMoves(game);
        const opponentMateInOne = this.findOpponentMateInOneMoves(fen);

        if (game.in_check && game.in_check()) {
            insights.push({
                category: 'tactics',
                type: 'King In Check',
                explanation: `${side} king is currently in check. Prioritize legal responses that improve king safety.`,
                pattern: 'king-in-check'
            });
        }

        if (opponentMateInOne.length > 0) {
            const examples = opponentMateInOne.slice(0, 2).join(', ');
            insights.push({
                category: 'tactics',
                type: 'Mate Threat',
                explanation: `${side} is facing a mate-in-1 threat (e.g. ${examples}). You must prioritize forcing defenses: checks, captures, or escape squares.`,
                pattern: 'mate-threat'
            });
        }

        if (mateInOne.length > 0) {
            const examples = mateInOne.slice(0, 2).join(', ');
            insights.push({
                category: 'tactics',
                type: 'Mate Opportunity',
                explanation: `${side} has a mate-in-1 opportunity (e.g. ${examples}). This is a decisive tactical finish.`,
                pattern: 'mate-opportunity'
            });
        }

        if (checkingMoves.length > 0) {
            insights.push({
                category: 'tactics',
                type: 'Forcing Checks',
                explanation: `${side} has ${checkingMoves.length} checking move(s) available. Forcing checks are useful to gain initiative.`,
                pattern: 'forcing-checks'
            });
        }

        if (captures.length > 0) {
            insights.push({
                category: 'tactics',
                type: 'Captures Available',
                explanation: `${side} has ${captures.length} capture(s) to evaluate. Compare resulting positions before committing.`,
                pattern: 'captures-available'
            });
        }

        return insights;
    }

    findMateInOneMoves(game) {
        const mateMoves = [];
        const legalMoves = game.moves({ verbose: true });
        legalMoves.forEach((mv) => {
            const t = new Chess(game.fen());
            const res = t.move({
                from: mv.from,
                to: mv.to,
                promotion: mv.promotion || 'q'
            });
            if (!res) return;
            if (t.in_checkmate && t.in_checkmate()) {
                mateMoves.push(res.san || `${mv.from}${mv.to}`);
            }
        });
        return mateMoves;
    }

    findOpponentMateInOneMoves(fen) {
        try {
            const parts = fen.split(' ');
            parts[1] = parts[1] === 'w' ? 'b' : 'w';
            const opp = new Chess(parts.join(' '));
            return this.findMateInOneMoves(opp);
        } catch (_) {
            return [];
        }
    }

    findKing(board, color) {
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 8; j++) {
                const piece = board[i][j];
                if (piece && piece.type === 'k' && piece.color === color) {
                    return String.fromCharCode(97 + j) + (8 - i);
                }
            }
        }
        return null;
    }

    assessKingSafety(game, kingPos, color) {
        let issues = 0;
        let advice = '';
        
        // Check if king has castled
        const expectedKingRank = color === 'w' ? 1 : 8;
        const kingRank = parseInt(kingPos[1]);
        
        if (kingRank === expectedKingRank) {
            // King might not have castled
            const kingFile = kingPos[0];
            if (kingFile === 'e') {
                issues += 1;
                advice = 'Consider castling to bring your king to safety.';
            }
        }
        
        return { issues, advice };
    }

    categorizeConcept(conceptName) {
        const tactical = ['pin', 'fork', 'skewer', 'discovered-attack'];
        const positional = ['center-control', 'development', 'space', 'pawn-structure'];
        const safety = ['castling', 'king-safety'];
        
        if (tactical.some(t => conceptName.includes(t))) return 'tactics';
        if (positional.some(p => conceptName.includes(p))) return 'positional';
        if (safety.some(s => conceptName.includes(s))) return 'king-safety';
        
        return 'general';
    }
}

window.chessAnalyzer = new ChessAnalyzer();
