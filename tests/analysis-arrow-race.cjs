const assert = require('node:assert/strict');
const { chromium } = require('/opt/homebrew/lib/node_modules/playwright');
const path=require('node:path'),fs=require('node:fs');
(async()=>{
 const root=path.resolve(__dirname,fs.existsSync(path.join(__dirname,'../public'))?'../public':'..');
 const server=process.argv[2]?null:require('node:child_process').spawn('python3',['-m','http.server','18083','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
 if(server)await new Promise(r=>setTimeout(r,500));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await page.goto((process.argv[2]||'http://127.0.0.1:18083')+'/?arrow-race='+Date.now());
 await page.locator('#board [data-square="e2"]').waitFor();
 await page.waitForFunction(()=>stockfishEngine.isReady,null,{timeout:30000});
 await page.evaluate(()=>{
 clearTimeout(autoAnalyzeTimer);analysisRunId++;clearBestMoveArrow();
 stockfishEngine.analyze=fen=>new Promise((resolve,reject)=>(window.pendingSearches ||= []).push({fen,resolve,reject}));
 game=new Chess();game.move('e4');game.move('e5');game.move('Nf3');moveHistory=game.history({verbose:true});goToMove(-1);clearTimeout(autoAnalyzeTimer);
 window.resultFor=(fen)=>{const c=new Chess(fen),m=c.moves({verbose:true})[0];return {evaluation:20,scorePerspective:'white',depth:1,bestMoves:[{move:m.from+m.to+(m.promotion||''),san:m.san}],principalVariation:[]}};
 window.firstSearch=analyzePosition();
 });
 // Return to the identical FEN before the debounce starts: FEN alone is insufficient.
 await page.evaluate(()=>{goToMove(0);goToMove(1);goToMove(-1);clearTimeout(autoAnalyzeTimer);const s=pendingSearches.shift();s.resolve(resultFor(s.fen));});
 await page.evaluate(()=>firstSearch);
 assert.equal(await page.locator('#best-move-arrow').evaluate(e=>e.classList.contains('visible')),false,'obsolete run must stay hidden even after navigation back to same FEN');
 await page.evaluate(()=>{window.newSearch=analyzePosition();});
 await page.locator('#flip-btn').tap();await page.setViewportSize({width:768,height:844});
 await page.evaluate(()=>{const s=pendingSearches.shift();s.resolve(resultFor(s.fen));});await page.evaluate(()=>newSearch);
 async function legalArrow(){
 const state=await page.evaluate(()=>{const svg=document.querySelector('#best-move-arrow'),line=document.querySelector('#best-move-line');const squares=[...document.querySelectorAll('#board [data-square]')];const endpoint=i=>{const p=new DOMPoint(+line.getAttribute('x'+i),+line.getAttribute('y'+i)).matrixTransform(line.getScreenCTM());return squares.find(e=>{const r=e.getBoundingClientRect();return Math.hypot(p.x-r.x-r.width/2,p.y-r.y-r.height/2)<.25})?.dataset.square};const from=endpoint(1),to=endpoint(2),p=game.get(from);return {visible:svg.classList.contains('visible'),from,to,color:p?.color,turn:game.turn(),legal:!!new Chess(game.fen()).move({from,to,promotion:lastBestMoveUci?.[4]||'q'})};});
 assert.ok(state.visible&&state.color===state.turn&&state.legal,'visible SVG endpoints must be a legal current-turn move: '+JSON.stringify(state));
 }
 await legalArrow();
 await page.evaluate(()=>{window.oldSearch=analyzePosition();onDrop('e2','e4');board.position(game.fen(),false);clearTimeout(autoAnalyzeTimer);const s=pendingSearches.shift();s.resolve(resultFor(s.fen));});await page.evaluate(()=>oldSearch);
 assert.equal(await page.locator('#best-move-arrow').evaluate(e=>e.classList.contains('visible')),false,'manual move rejects delayed White result on Black turn');
 await page.evaluate(()=>{window.blackSearch=analyzePosition();});await page.locator('#flip-btn').tap();await page.setViewportSize({width:320,height:844});
 await page.evaluate(()=>{const s=pendingSearches.shift();s.resolve(resultFor(s.fen));});await page.evaluate(()=>blackSearch);await legalArrow();
 // Direct invalid engine output must never draw an opponent or illegal move.
 await page.evaluate(()=>drawBestMoveArrow('g1f3',game.fen()));
 assert.equal(await page.locator('#best-move-arrow').evaluate(e=>e.classList.contains('visible')),false,'opponent move rejected');
 await page.evaluate(()=>drawBestMoveArrow('e7e4',game.fen()));
 assert.equal(await page.locator('#best-move-arrow').evaluate(e=>e.classList.contains('visible')),false,'illegal destination rejected');
 console.log('PASS arrow race: rapid same-FEN navigation, delayed manual turn change, flip/resize while waiting, legal visible White/Black SVG endpoints, wrong-side/illegal rejection');
 }finally{await browser.close();if(server)server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
