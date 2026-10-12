// Actual SVG-to-screen geometry; run with optional deployed URL.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/homebrew/lib/node_modules/playwright');
(async () => {
  const path = require('node:path'), fs = require('node:fs');
  const root = path.join(__dirname, fs.existsSync(path.join(__dirname, '../public')) ? '../public' : '..');
  const server = process.argv[2] ? null : require('node:child_process').spawn('python3', ['-m', 'http.server', '18082', '--bind', '127.0.0.1'], {cwd:root, stdio:'ignore'});
  if (server) await new Promise(r=>setTimeout(r,500));
  const browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_PATH || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.argv[2] || 'http://127.0.0.1:18082');
    await page.locator('#board [data-square="e2"]').waitFor();
    await page.waitForFunction(() => typeof stockfishEngine !== 'undefined' && stockfishEngine.isReady, null, {timeout:30000});
    await page.waitForTimeout(1500); // Allow startup's scheduled analysis to settle before geometry fixtures.
    for (const orientation of ['white','black']) {
      await page.evaluate(o=>{clearTimeout(autoAnalyzeTimer);analysisRunId++;game=new Chess();boardOrientation=o;board.orientation(o);board.position(game.fen(),false);clearBestMoveArrow();},orientation);
      for (const move of ['e2e4','g1f3','a2a3','h2h4']) {
        await page.evaluate(m=>drawBestMoveArrow(m,game.fen()),move);
        for (const width of [390,320,768,1440,390]) {
          await page.setViewportSize({width,height:844}); await page.waitForTimeout(300);
          const g = await page.evaluate(m=>{
            const svg=document.querySelector('#best-move-arrow'),line=document.querySelector('#best-move-line'),head=document.querySelector('#arrowhead');
            const matrix=line.getScreenCTM();
            const points=['1','2'].map((suffix,i)=>{const point=new DOMPoint(+line.getAttribute('x'+suffix),+line.getAttribute('y'+suffix)).matrixTransform(matrix);const square=getSquareElement(m.slice(i*2,i*2+2)).getBoundingClientRect();return {x:point.x,y:point.y,cx:square.x+square.width/2,cy:square.y+square.height/2};});
            const r=svg.getBoundingClientRect(),b=document.querySelector('#board').getBoundingClientRect();
            return {points,tip:+head.getAttribute('refX'),units:head.getAttribute('markerUnits'),head:+head.getAttribute('markerWidth'),stroke:parseFloat(getComputedStyle(line).strokeWidth),pointer:getComputedStyle(svg).pointerEvents,overflow:getComputedStyle(svg).overflow,visible:svg.classList.contains('visible'),rect:{x:r.x,y:r.y,w:r.width,h:r.height},board:{x:b.x,y:b.y,w:b.width,h:b.height},square:getSquareElement(m.slice(0,2)).getBoundingClientRect().width};
          },move);
          for(const p of g.points) assert.ok(Math.hypot(p.x-p.cx,p.y-p.cy)<0.25,`${orientation} ${move} ${width}px endpoints not square centers: ${JSON.stringify(g)}`);
          assert.equal(g.tip,24,'visible arrow tip must land at destination, not past it');
          assert.equal(g.units,'userSpaceOnUse','head does not scale with stroke');
          const renderedHead = await page.evaluate(() => {
            const svg=document.querySelector('#best-move-arrow'), line=document.querySelector('#best-move-line'), marker=document.querySelector('#arrowhead');
            const shape=marker.querySelector('polygon');
            const tip=[...shape.points].reduce((a,p)=>p.x>a.x?p:a,shape.points[0]);
            const angle=Math.atan2(+line.getAttribute('y2')-+line.getAttribute('y1'),+line.getAttribute('x2')-+line.getAttribute('x1'));
            const dx=(tip.x-marker.refX.baseVal.value)*marker.markerWidth.baseVal.value/marker.viewBox.baseVal.width;
            const dy=(tip.y-marker.refY.baseVal.value)*marker.markerHeight.baseVal.value/marker.viewBox.baseVal.height;
            const point=new DOMPoint(+line.getAttribute('x2')+dx*Math.cos(angle)-dy*Math.sin(angle),+line.getAttribute('y2')+dx*Math.sin(angle)+dy*Math.cos(angle)).matrixTransform(svg.getScreenCTM());
            return {x:point.x,y:point.y,marker:getComputedStyle(line).markerEnd};
          });
          assert.ok(renderedHead.marker.includes('#arrowhead'),'head actually attached');
          assert.ok(Math.hypot(renderedHead.x-g.points[1].cx,renderedHead.y-g.points[1].cy)<.25,'transformed polygon tip at destination center');
          assert.ok(g.head>=g.square*.35 && g.head<=g.square*.55,'responsive readable head');
          assert.ok(g.stroke>=g.square*.08 && g.stroke<=g.square*.15,'responsive shaft');
          assert.equal(g.pointer,'none'); assert.equal(g.overflow,'hidden'); assert.ok(g.visible);
          assert.ok(g.rect.x>=g.board.x-.25 && g.rect.y>=g.board.y-.25 && g.rect.x+g.rect.w<=g.board.x+g.board.w+.25 && g.rect.y+g.rect.h<=g.board.y+g.board.h+.25,'overlay contained by board');
        }
      }
      await page.locator('#flip-btn').tap(); await page.waitForTimeout(300);
      const flip=await page.evaluate(()=>{const line=document.querySelector('#best-move-line'),p=new DOMPoint(+line.getAttribute('x2'),+line.getAttribute('y2')).matrixTransform(line.getScreenCTM()),r=getSquareElement('h4').getBoundingClientRect();return Math.hypot(p.x-r.x-r.width/2,p.y-r.y-r.height/2)});
      assert.ok(flip<.25,'actual flip button redraws arrow');
      console.log(`PASS ${orientation}: 4 moves × 5 resizes; endpoints within 0.25px, tip, sizing, clipping, touch passthrough, flip button`);
    }
    assert.deepEqual(errors,[]);
    if(process.env.SCREENSHOT) {await page.evaluate(()=>{boardOrientation='white';board.orientation('white');drawBestMoveArrow('e2e4',game.fen())});await page.waitForTimeout(300);await page.screenshot({path:process.env.SCREENSHOT});}
  } finally {await browser.close();if(server)server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
