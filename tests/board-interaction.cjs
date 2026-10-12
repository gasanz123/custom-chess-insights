// Run with PLAYWRIGHT_MODULE and BROWSER_PATH; optional deployed URL.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/homebrew/lib/node_modules/playwright');
(async () => {
  const server = process.argv[2] ? null : require('node:child_process').spawn('python3', ['-m', 'http.server', '18081', '--bind', '127.0.0.1'], { cwd: require('node:path').join(__dirname, require('node:fs').existsSync(require('node:path').join(__dirname, '../public')) ? '../public' : '..'), stdio: 'ignore' });
  if (server) await new Promise(r => setTimeout(r, 500));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' });
  try {
    for (const mobile of [true, false]) {
      const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: 850 }, hasTouch: mobile, isMobile: mobile });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(process.argv[2] || 'http://127.0.0.1:18081');
      await page.locator('#board [data-square="e2"]').waitFor();
      const act = async square => { const el = page.locator(`#board [data-square="${square}"]`); await (mobile ? el.tap() : el.click()); };
      await act('e2');
      assert.equal(await page.locator('#board .selected-square').count(), 1, 'piece is selected');
      assert.equal(await page.locator('#board [data-square="e4"].legal-square').count(), 1, 'legal destination highlighted');
      await act('e5');
      assert.equal(await page.evaluate(() => game.history().length), 0, 'illegal move rejected');
      await act('e4');
      assert.deepEqual(await page.evaluate(() => game.history()), ['e4'], 'actual tap/click moves exactly once');
      assert.equal(await page.locator('#board .selected-square').count(), 0);
      assert.equal(await page.locator('#move-counter').textContent(), 'Move: 1 / 1', 'navigation records manual move');
      await page.locator('#prev-btn').click();
      assert.equal(await page.evaluate(() => game.history().length), 0, 'navigate to initial position');
      await page.locator('#last-btn').click();
      assert.deepEqual(await page.evaluate(() => game.history()), ['e4'], 'navigation restores manual move');
      await page.waitForTimeout(400);
      if (mobile) {
        const session = await context.newCDPSession(page);
        const swipe = async (x, y) => {
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          for (let i = 1; i <= 10; i++) { await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 10 }] }); await page.waitForTimeout(20); }
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await page.waitForTimeout(500);
        };
        await page.locator('#board').scrollIntoViewIfNeeded();
        const rect = await page.locator('#board').boundingBox();
        const before = await page.evaluate(() => scrollY);
        await swipe(rect.x + rect.width / 2, rect.y + rect.height * .75);
        assert.equal(await page.evaluate(() => scrollY), before, 'board swipe does not pan page');
        assert.deepEqual(await page.evaluate(() => game.history()), ['e4'], 'board swipe does not accidentally move');
        await swipe(3, 650);
        assert.ok(await page.evaluate(() => scrollY) > before, 'outside board still scrolls');
      } else {
        const from = await page.locator('#board [data-square="e7"]').boundingBox();
        const to = await page.locator('#board [data-square="e5"]').boundingBox();
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
        await page.mouse.up();
        assert.deepEqual(await page.evaluate(() => game.history()), ['e4', 'e5'], 'desktop drag moves exactly once');
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${mobile ? 'mobile taps, legality, board pan lock, outside scroll' : 'desktop clicks and drag'}; page errors=0`);
      await context.close();
    }
  } finally { await browser.close(); if (server) server.kill(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
