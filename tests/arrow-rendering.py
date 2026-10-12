"""Render the real app in Chromium and verify visible arrowhead pixels."""
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

output = Path('/workspace/arrow-rendering')
output.mkdir(exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page()
    failures = []
    page.on('pageerror', lambda error: failures.append(str(error)))
    for viewport, label in [({'width': 1440, 'height': 1100}, 'desktop'), ({'width': 390, 'height': 844}, 'phone')]:
        page.set_viewport_size(viewport)
        page.goto('http://127.0.0.1:8000/', wait_until='load')
        page.wait_for_function("document.getElementById('eval-score').textContent.includes('White POV')", timeout=30000)
        for turn, move, setup in [('white', 'e2e4', ''), ('black', 'e7e5', "game.move('e4');")]:
            for orientation in ['white', 'black']:
                page.evaluate(f"""() => {{
                    analysisRunId++; clearTimeout(autoAnalyzeTimer);
                    game = new Chess(); {setup}
                    boardOrientation = '{orientation}'; board.orientation(boardOrientation);
                    board.position(game.fen(), false);
                    clearBestMoveArrow();
                    drawBestMoveArrow('{move}', game.fen());
                }}""")
                page.wait_for_timeout(250)
                board = page.locator('#board-wrap')
                screenshot = board.screenshot()
                name = f'{label}-{turn}-{orientation}'
                (output / f'{name}.png').write_bytes(screenshot)
                geometry = page.evaluate("""() => {
                    const line = document.getElementById('best-move-line');
                    const svg = document.getElementById('best-move-arrow');
                    const marker = document.getElementById('arrowhead');
                    return {marker: getComputedStyle(line).markerEnd, head: Number(marker.getAttribute('markerWidth')),
                            width: svg.getBoundingClientRect().width, viewWidth: svg.viewBox.baseVal.width};
                }""")
                assert geometry['marker'] == 'url("#arrowhead")', geometry
                assert 18 <= geometry['head'] <= 26, geometry
                assert abs(geometry['width'] - geometry['viewWidth']) < 1, geometry
                # Compare rendered pixels with the marker disabled. The head must
                # contribute a clearly visible region beyond the arrow shaft.
                page.locator('#best-move-line').evaluate("el => el.style.markerEnd = 'none'")
                no_head = board.screenshot()
                page.locator('#best-move-line').evaluate("el => el.style.removeProperty('marker-end')")
                im = Image.open(BytesIO(screenshot)).convert('RGB')
                baseline = Image.open(BytesIO(no_head)).convert('RGB')
                diff = ImageChops.difference(im, baseline)
                count = sum(1 for rgb, delta in zip(im.getdata(), diff.getdata())
                    if max(delta) > 25 and rgb[0] > 210 and 140 < rgb[1] < 230 and rgb[2] < 150)
                assert count >= 70, f'{name}: arrowhead not clearly visible ({count} pixels)'
                print(f'{name}: {geometry["head"]:.1f}px head; {count} visible arrowhead pixels')
    assert not failures, failures
    browser.close()
print('All 8 browser rendering checks passed.')
