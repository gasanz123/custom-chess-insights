const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, fs.existsSync(path.join(__dirname, '../public')) ? '../public' : '..');
const { Chess } = require(path.join(root, fs.existsSync(path.join(root, 'js/chess.min.js')) ? 'js/chess.min.js' : 'vendor/chess.min.js'));
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {textContent:'', value:'3', style:{}, classList:{add(){},remove(){}}, innerHTML:''});
  return elements.get(id);
}
let rejectSearch, fallbackCalls = 0;
const context = vm.createContext({Chess, console, setTimeout(){return 1}, clearTimeout(){}, requestAnimationFrame(){}, addEventListener(){},
 document:{addEventListener(){},getElementById:element,querySelector(){return null},querySelectorAll(){return []}},
 stockfishEngine:{isReady:true,analyze(){return new Promise((resolve,reject)=>{rejectSearch=reject})}},
 simpleAnalyzer:{analyze(){fallbackCalls++; return Promise.resolve({evaluation:0,bestMoves:[]})}}});
context.window=context;
vm.runInContext(fs.readFileSync(path.join(root,'js/app.js'),'utf8'),context);
(async()=>{
 const pending=vm.runInContext('analyzePosition()',context);
 vm.runInContext("game.move('e4'); scheduleAutoAnalyze()",context);
 rejectSearch(new Error('obsolete search failed')); await pending;
 assert.equal(context.stockfishEngine.isReady,true,'obsolete failure must not disable the current engine');
 assert.equal(fallbackCalls,0,'obsolete failure must not start fallback work');
 console.log('PASS stale errors: no engine readiness mutation or fallback work after turn change');
})().catch(e=>{console.error(e);process.exitCode=1});
