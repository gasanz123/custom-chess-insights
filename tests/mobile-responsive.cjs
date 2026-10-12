// Run: PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_PATH=/path/to/chromium node tests/mobile-responsive.cjs [URL]
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const server = !process.argv[2] ? require('node:child_process').spawn(process.env.PYTHON || 'python3', ['-m', 'http.server', '18080', '--bind', '127.0.0.1'], { cwd: require('node:path').join(__dirname, '..'), stdio: 'ignore' }) : null;
  if (server) await new Promise(r => setTimeout(r, 1000));
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
  try {
    for (const width of [320, 375, 390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(process.argv[2] || 'http://127.0.0.1:18080');
      await page.waitForFunction(() => typeof stockfishEngine !== 'undefined' && stockfishEngine.isReady, null, { timeout: 30000 });
      const layout = async () => {
        await page.waitForTimeout(250);
        const result = await page.evaluate(() => {
          const rect = document.querySelector('#board-wrap').getBoundingClientRect();
          const squares = [...document.querySelectorAll('#board [data-square]')];
          return { overflow: document.documentElement.scrollWidth > innerWidth, width: rect.width, height: rect.height, squares: squares.length, square: squares[0].getBoundingClientRect().width, controls: [...document.querySelectorAll('.game-nav button, .btn, .coach-chip')].map(e => e.getBoundingClientRect().height), images: [...document.querySelectorAll('#board img')].every(e => e.complete && e.naturalWidth > 0) };
        });
        assert.equal(result.overflow, false, `horizontal overflow at ${width}`);
        assert.equal(result.squares, 64);
        assert.ok(result.images, 'piece images loaded');
        assert.ok(Math.abs(result.width - result.height) < 9, 'square board');
        assert.ok(Math.abs(result.square * 8 - result.width) < 9, 'squares fill board after resize');
        assert.ok(result.controls.every(h => h >= 44), '44px touch targets');
      };
      await layout();
      const panels = await page.evaluate(() => ['header', '.board-section', '.left-panel', '.analysis-section'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y }; }));
      if (width <= 1200) assert.ok(panels[0].y < panels[1].y && panels[1].y < panels[2].y && panels[2].y < panels[3].y, 'mobile panel order');
      else assert.ok(panels[2].x < panels[1].x && panels[1].x < panels[3].x, 'desktop three columns');
      await page.locator('#pgn-input').fill('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6');
      await page.locator('#load-pgn').tap();
      await page.waitForFunction(() => document.querySelector('#move-counter').textContent === 'Move: 6 / 6');
      await page.locator('#prev-btn').tap();
      assert.equal(await page.locator('#move-counter').textContent(), 'Move: 5 / 6');
      await page.locator('#next-btn').tap();
      assert.equal(await page.locator('#move-counter').textContent(), 'Move: 6 / 6');
      await page.locator('#flip-btn').tap();
      await page.setViewportSize({ width: 900, height: width });
      await layout();
      await page.setViewportSize({ width, height: 900 });
      await layout();
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: layout, 44px controls, 64 squares, images, Stockfish ready, PGN, navigation, flip, orientation resize; page errors=0`);
      await context.close();
    }
    console.log('PASS mobile responsive regression: 5 viewports');
  } finally { await browser.close(); if (server) server.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
