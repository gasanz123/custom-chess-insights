const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('/opt/homebrew/lib/node_modules/playwright');
(async()=>{
 const root=path.resolve(__dirname,fs.existsSync(path.join(__dirname,'../public'))?'../public':'..');
 const server=process.argv[2]?null:require('node:child_process').spawn('python3',['-m','http.server','18084','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});if(server)await new Promise(r=>setTimeout(r,500));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'});
 try{
 const page=await browser.newPage();await page.goto((process.argv[2]||'http://127.0.0.1:18084')+'/?real-engine='+Date.now());
 await page.waitForFunction(()=>stockfishEngine.isReady,null,{timeout:30000});
 const result=await page.evaluate(async()=>{
 clearTimeout(autoAnalyzeTimer);analysisRunId++;
 const b=new Chess();b.move('e4');const fens=[new Chess().fen(),b.fen()];
 const searches=await Promise.all(fens.map(fen=>stockfishEngine.analyze(fen,2,8,{movetimeOverride:200,timeoutOverride:3000})));
 return searches.map((r,i)=>({moves:r.bestMoves.map(m=>m.move),legal:r.bestMoves.length>0&&r.bestMoves.every(m=>!!new Chess(fens[i]).move({from:m.move.slice(0,2),to:m.move.slice(2,4),promotion:m.move[4]||'q'}))}));
 });
 assert.ok(result.every(r=>r.legal),'actual engine results belong to each caller: '+JSON.stringify(result));
 // Valid arrows must return after a real engine analysis, not merely synthetic fixtures.
 await page.evaluate(async()=>{game=new Chess();board.position(game.fen(),false);clearBestMoveArrow();await analyzePosition();});
 await page.waitForFunction(()=>document.querySelector('#best-move-arrow').classList.contains('visible'));
 await page.evaluate(async()=>{onDrop('e2','e4');clearTimeout(autoAnalyzeTimer);board.position(game.fen(),false);await analyzePosition();});
 const black=await page.evaluate(()=>({visible:document.querySelector('#best-move-arrow').classList.contains('visible'),turn:game.turn(),color:game.get(lastBestMoveUci?.slice(0,2))?.color,legal:!!new Chess(game.fen()).move({from:lastBestMoveUci?.slice(0,2),to:lastBestMoveUci?.slice(2,4),promotion:lastBestMoveUci?.[4]||'q'})}));
 assert.ok(black.visible&&black.turn==='b'&&black.color==='b'&&black.legal,JSON.stringify(black));
 console.log('PASS actual worker concurrent callers: '+JSON.stringify(result)+'; real White/Black arrows restored and legal');
 }finally{await browser.close();if(server)server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
