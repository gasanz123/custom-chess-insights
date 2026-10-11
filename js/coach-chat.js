// Local coach chat — no APIs, no tokens. Answers from your analysis data only.

(function () {
    function escapeHtml(s) {
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function hasFullAnalysis(ctx) {
        if (!ctx.moveAnnotations || !ctx.moveAnnotations.length) return false;
        return ctx.moveAnnotations.some((a) => a && a.classification);
    }

    function moveLabel(idx, ctx) {
        if (!ctx.moveHistory[idx]) return '?';
        const num = Math.floor(idx / 2) + 1;
        const dots = idx % 2 === 0 ? '.' : '...';
        return `${num}${dots}${ctx.moveHistory[idx].san}`;
    }

    function listMovesByClass(ctx, cls) {
        const out = [];
        ctx.moveAnnotations.forEach((a, i) => {
            if (a && a.classification === cls) out.push({ idx: i, ann: a });
        });
        return out.sort((x, y) => (y.ann.loss || 0) - (x.ann.loss || 0));
    }

    function formatLine(ctx, item) {
        const { idx, ann } = item;
        const lossP = ann.loss != null ? (ann.loss / 100).toFixed(2) : '?';
        const best = ann.bestMove ? ` Engine preferred: ${escapeHtml(ann.bestMove)}.` : '';
        return `<li><button type="button" class="coach-jump" data-idx="${idx}">${escapeHtml(moveLabel(idx, ctx))}</button> — lost about <strong>${lossP}</strong> pawns vs best play.${best}</li>`;
    }

    function coachReply(raw) {
        const ctx = typeof window.getCoachContext === 'function' ? window.getCoachContext() : null;
        if (!ctx || !ctx.moveHistory || ctx.moveHistory.length === 0) {
            return '<p>Load a PGN first, then run <strong>Full Analysis</strong> so I can see mistakes and blunders.</p>';
        }

        const q = String(raw).toLowerCase().trim();
        if (!q) return '<p>Ask me something, or click a quick question below.</p>';

        if (/^help|^what can|how does (this|the coach)|^who are you/.test(q)) {
            return (
                '<p><strong>I run entirely in your browser</strong> — no cloud AI, no accounts, no paid tokens.</p>' +
                '<p>After <strong>Full Analysis</strong>, try asking:</p><ul>' +
                '<li>Which blunders? / List mistakes</li>' +
                '<li>Worst moves / Biggest errors</li>' +
                '<li>Opening / What opening is this?</li>' +
                '<li>Summary / How did we play?</li>' +
                '<li>White mistakes / Black blunders</li>' +
                '</ul>'
            );
        }

        if (!hasFullAnalysis(ctx)) {
            return '<p>I need <strong>Full Analysis</strong> results first. Click <strong>Full Analysis</strong>, wait for it to finish, then ask again (e.g. “which blunders?”).</p>';
        }

        if (/opening|eco|what (line|opening)/.test(q)) {
            const sanMoves = [];
            const g = new Chess();
            for (let i = 0; i < ctx.moveHistory.length; i++) {
                const m = g.move(ctx.moveHistory[i].san) || g.move(ctx.moveHistory[i].san, { sloppy: true });
                if (m) sanMoves.push(m.san);
            }
            const op = window.identifyOpening ? identifyOpening(sanMoves) : { name: 'Unknown', eco: '' };
            return `<p>Opening: <strong>${escapeHtml(op.name)}</strong>${op.eco ? ` (${escapeHtml(op.eco)})` : ''}.</p>`;
        }

        if (/summary|recap|overview|how (did|was)|stats/.test(q) && !/mistake|blunder|move/.test(q)) {
            let b = 0, m = 0, i = 0, best = 0;
            ctx.moveAnnotations.forEach((a) => {
                if (!a) return;
                if (a.classification === 'blunder') b++;
                else if (a.classification === 'mistake') m++;
                else if (a.classification === 'inaccuracy') i++;
                else if (a.classification === 'best') best++;
            });
            return (
                `<p>Quick recap: <strong>${ctx.moveHistory.length}</strong> half-moves played.</p>` +
                `<p>Engine tags: <strong>${best}</strong> excellent, <strong>${i}</strong> inaccuracies, <strong>${m}</strong> mistakes, <strong>${b}</strong> blunders.</p>` +
                '<p>Ask <em>which blunders?</em> or <em>worst moves</em> for details with jump links.</p>'
            );
        }

        const whiteOnly = /\bwhite\b/.test(q) && !/\bblack\b/.test(q);
        const blackOnly = /\bblack\b/.test(q) && !/\bwhite\b/.test(q);

        function filterSide(items) {
            if (!whiteOnly && !blackOnly) return items;
            return items.filter((x) => (whiteOnly ? x.idx % 2 === 0 : x.idx % 2 === 1));
        }

        if (/blunder/.test(q) && /mistake/.test(q)) {
            let bItems = filterSide(listMovesByClass(ctx, 'blunder'));
            let mItems = filterSide(listMovesByClass(ctx, 'mistake'));
            let html = '';
            if (bItems.length) {
                html += `<p><strong>Blunders (${bItems.length}):</strong></p><ul>`;
                bItems.forEach((it) => { html += formatLine(ctx, it); });
                html += '</ul>';
            }
            if (mItems.length) {
                html += `<p><strong>Mistakes (${mItems.length}):</strong></p><ul>`;
                mItems.forEach((it) => { html += formatLine(ctx, it); });
                html += '</ul>';
            }
            if (!html) return '<p>No blunders or mistakes tagged.</p>';
            html += '<p class="coach-hint">Click a move to show it on the board.</p>';
            return html;
        }

        if (/blunder/.test(q)) {
            let items = filterSide(listMovesByClass(ctx, 'blunder'));
            if (items.length === 0) {
                return '<p>No moves tagged as <strong>blunder</strong> in this analysis. Ask about <em>mistakes</em> or <em>worst moves</em>.</p>';
            }
            let html = `<p><strong>${items.length} blunder(s):</strong></p><ul>`;
            items.forEach((it) => { html += formatLine(ctx, it); });
            html += '</ul><p class="coach-hint">Click a move to jump the board there.</p>';
            return html;
        }

        if (/mistake/.test(q) && !/inaccuracy/.test(q)) {
            let items = filterSide(listMovesByClass(ctx, 'mistake'));
            if (items.length === 0) {
                return '<p>No moves tagged as <strong>mistake</strong>. Try <em>inaccuracies</em> or <em>worst moves</em>.</p>';
            }
            let html = `<p><strong>${items.length} mistake(s):</strong></p><ul>`;
            items.forEach((it) => { html += formatLine(ctx, it); });
            html += '</ul>';
            return html;
        }

        if (/inaccuracy|inaccuracies/.test(q)) {
            let items = filterSide(listMovesByClass(ctx, 'inaccuracy'));
            if (items.length === 0) return '<p>No inaccuracies tagged.</p>';
            let html = `<p><strong>${items.length} inaccuracies</strong> (engine-tagged):</p><ul>`;
            items.forEach((it) => { html += formatLine(ctx, it); });
            html += '</ul>';
            return html;
        }

        if (/worst|biggest|costly|terrible|bad moves/.test(q)) {
            const all = [];
            ctx.moveAnnotations.forEach((a, i) => {
                if (a && (a.loss || 0) > 0) all.push({ idx: i, ann: a });
            });
            let sorted = all.sort((x, y) => (y.ann.loss || 0) - (x.ann.loss || 0));
            sorted = filterSide(sorted);
            sorted = sorted.slice(0, 12);
            if (sorted.length === 0) return '<p>No loss data found.</p>';
            let html = '<p><strong>Largest eval drops (worst first):</strong></p><ul>';
            sorted.forEach((it) => { html += formatLine(ctx, it); });
            html += '</ul>';
            return html;
        }

        if (/excellent|best moves|precision/.test(q)) {
            const items = [];
            ctx.moveAnnotations.forEach((a, i) => {
                if (a && a.classification === 'best') items.push({ idx: i, ann: a });
            });
            if (items.length === 0) return '<p>No moves tagged excellent (≤5 cp loss) in this run.</p>';
            let html = `<p><strong>${items.length} excellent move(s):</strong></p><ul>`;
            items.forEach((it) => {
                html += `<li><button type="button" class="coach-jump" data-idx="${it.idx}">${escapeHtml(moveLabel(it.idx, ctx))}</button></li>`;
            });
            html += '</ul>';
            return html;
        }

        return (
            '<p>I did not match that question. Try:</p><ul>' +
            '<li><strong>Which blunders?</strong> — list with jump links</li>' +
            '<li><strong>List mistakes</strong> / <strong>inaccuracies</strong></li>' +
            '<li><strong>Worst moves</strong> — biggest eval drops</li>' +
            '<li><strong>Opening</strong> — name from the game line</li>' +
            '<li><strong>Summary</strong> — counts</li>' +
            '</ul><p class="coach-hint">Tip: say <em>White mistakes</em> or <em>Black blunders</em> to filter.</p>'
        );
    }

    function appendMessage(role, htmlOrText, isHtml) {
        const box = document.getElementById('coach-messages');
        if (!box) return;
        const div = document.createElement('div');
        div.className = 'coach-msg ' + (role === 'user' ? 'coach-msg-user' : 'coach-msg-coach');
        if (isHtml) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(String(htmlOrText), 'text/html');
            doc.body.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach((n) => n.remove());
            doc.body.querySelectorAll('*').forEach((el) => {
                [...el.attributes].forEach((attr) => {
                    const name = attr.name.toLowerCase();
                    const value = attr.value.trim().toLowerCase();
                    if (name.startsWith('on')) el.removeAttribute(attr.name);
                    if ((name === 'href' || name === 'src') && value.startsWith('javascript:')) el.removeAttribute(attr.name);
                });
            });
            div.append(...doc.body.childNodes);
        } else div.textContent = htmlOrText;
        box.appendChild(div);
        box.scrollTop = box.scrollHeight;
    }

    function sendCoachMessage() {
        const input = document.getElementById('coach-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        appendMessage('user', text, false);
        const reply = coachReply(text);
        appendMessage('coach', reply, true);
    }

    function initCoachChat() {
        const send = document.getElementById('coach-send');
        const input = document.getElementById('coach-input');
        if (send) send.addEventListener('click', sendCoachMessage);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendCoachMessage();
                }
            });
        }

        const box = document.getElementById('coach-messages');
        if (box) {
            box.addEventListener('click', (e) => {
                const btn = e.target.closest('.coach-jump');
                if (!btn) return;
                const idx = parseInt(btn.getAttribute('data-idx'), 10);
                if (Number.isFinite(idx) && typeof window.goToMove === 'function') {
                    window.goToMove(idx);
                }
            });
        }

        document.querySelectorAll('.coach-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                const t = chip.getAttribute('data-ask');
                if (!t || !input) return;
                input.value = t;
                sendCoachMessage();
            });
        });
    }

    window.initCoachChat = initCoachChat;
    window.coachReply = coachReply;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCoachChat);
    } else {
        initCoachChat();
    }
})();
