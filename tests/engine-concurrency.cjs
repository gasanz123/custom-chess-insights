const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,fs.existsSync(path.join(__dirname,'../public'))?'../public':'..');
const chessFile=fs.existsSync(path.join(root,'js/chess.min.js'))?'js/chess.min.js':'vendor/chess.min.js';
const {Chess}=require(path.join(root,chessFile));
const context=vm.createContext({Chess,URL,console,setTimeout,clearTimeout,setInterval,clearInterval,document:{currentScript:{src:'https://test/js/stockfish.js'}}});context.window=context;
vm.runInContext(fs.readFileSync(path.join(root,'js/stockfish.js'),'utf8'),context);
(async()=>{
 const engine=context.stockfishEngine,commands=[];
 engine.transport={postMessage(c){commands.push(c)},terminate(){},quit(){}};engine.isReady=true;
 const white=new Chess(),black=new Chess();black.move('e4');
 const searches=[engine.analyze(white.fen(),1,4,{timeoutOverride:500}),engine.analyze(black.fen(),1,4,{timeoutOverride:500})];
 await new Promise(r=>setTimeout(r,0));
 assert.equal(commands.filter(c=>c.startsWith('go ')).length,1,'one worker must not overlap callers');
 engine._lineHandler('info depth 4 score cp 20 pv e2e4');engine._lineHandler('bestmove e2e4');
 const first=await searches[0];await new Promise(r=>setTimeout(r,0));
 engine._lineHandler('info depth 4 score cp 10 pv e7e5');engine._lineHandler('bestmove e7e5');
 const second=await searches[1];
 assert.equal(first.bestMoves[0].move,'e2e4');assert.equal(second.bestMoves[0].move,'e7e5');
 assert.ok(white.move({from:'e2',to:'e4'}));assert.ok(black.move({from:'e7',to:'e5'}));
 // Timeout must retire the transport rather than route its delayed bestmove to the next caller.
 const timeout=engine.analyze(new Chess().fen(),1,4,{timeoutOverride:10});await timeout;
 assert.equal(engine.transport,null,'timed-out worker must be retired');
 console.log('PASS engine concurrency: serialized opposite-turn callers keep their own legal results; timed-out transport retired');
})().catch(e=>{console.error(e);process.exitCode=1});
