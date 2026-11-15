import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash,createHmac} from 'node:crypto';
import {once} from 'node:events';
import {EvidenceStore} from '../src/evidence.mjs';
import {createInvestingHandler} from '../src/http.mjs';
import {createInvestingService} from '../src/service.mjs';
import {VerifiedBinancePorts} from '../src/binance.mjs';
import {PaperPortfolio} from '../src/paper.mjs';
const NOW=1800000000000;
const response=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers});
const info={symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true,filters:[{filterType:'LOT_SIZE',stepSize:'0.001',minQty:'0.001',maxQty:'100'},{filterType:'PRICE_FILTER',tickSize:'0.01'},{filterType:'MIN_NOTIONAL',minNotional:'5'}]};
const permissions=()=>({enabled:true,mode:'testnet',killSwitch:false,securityReviewCleared:true,expiresAt:NOW+100000,allowedSymbols:['BTCUSDT'],feeBps:20,flowAdjustedPeakEquity:1000,cashFlowReconciliationAt:NOW});
function broker(fetchImpl,p=permissions()){return new VerifiedBinancePorts({mode:'testnet',owner:'alice',apiKey:'test-key',apiSecret:'test-secret',permissions:p,now:()=>NOW,fetchImpl});}
test('signed exchange requests use only a fixed host and verifiable HMAC',async()=>{
 let seen;const b=broker(async(raw,init)=>{seen={url:new URL(raw),init};return response({serverTime:NOW});});await b.syncTime();await b.request('/api/v3/account');
 assert.equal(seen.url.origin,'https://testnet.binance.vision');const q=seen.url.searchParams,signature=q.get('signature');q.delete('signature');
 assert.equal(signature,createHmac('sha256','test-secret').update(q.toString()).digest('hex'));assert.equal(seen.init.headers['X-MBX-APIKEY'],'test-key');assert.equal(seen.init.redirect,'error');
});
test('mutating order is submitted once after deterministic id lookup; uncertainty is never retried',async()=>{
 let posts=0;const b=broker(async(raw,init)=>{const u=new URL(raw);if(u.pathname.endsWith('/time'))return response({serverTime:NOW});if(u.pathname.endsWith('/exchangeInfo'))return response({symbols:[info]});if(init.method==='POST'){posts++;throw Error('connection_lost');}return response({code:-2013},400);});
 await assert.rejects(b.submitLimit({symbol:'BTCUSDT',action:'BUY',quantity:'0.1',limitPrice:'100',expiresAt:NOW+5000,clientOrderId:'vi'+'a'.repeat(25)+'0'}));assert.equal(posts,1);
});
test('fresh permission reload can revoke trading immediately',async()=>{
 let p=permissions(),calls=0;const b=broker(async()=>{calls++;return response({});},()=>p);p={...p,killSwitch:true};await assert.rejects(b.submitLimit({}),/clearance/);assert.equal(calls,0);
});
test('revocation during lookup prevents the subsequent order POST',async()=>{
 let p=permissions(),posts=0;const b=broker(async(raw,init)=>{const u=new URL(raw);if(u.pathname.endsWith('/time'))return response({serverTime:NOW});if(u.pathname.endsWith('/exchangeInfo'))return response({symbols:[info]});if(init.method==='POST')posts++;p={...p,killSwitch:true};return response({code:-2013},400);},()=>p);
 await assert.rejects(b.submitLimit({symbol:'BTCUSDT',action:'BUY',quantity:'0.1',limitPrice:'100',expiresAt:NOW+5000,clientOrderId:'vi'+'c'.repeat(25)+'0'}),/clearance/);assert.equal(posts,0);
});
test('regional denial stops subsequent requests instead of changing hosts',async()=>{
 let calls=0;const b=broker(async()=>{calls++;return response({},451);});await assert.rejects(b.syncTime());await assert.rejects(b.syncTime(),/cooldown/);assert.equal(calls,1);
});
test('execution filters never inflate orders below the minimum',async()=>{
 let posts=0;const b=broker(async(raw,init)=>{const u=new URL(raw);if(init.method==='POST')posts++;return u.pathname.endsWith('/time')?response({serverTime:NOW}):response({symbols:[info]});});
 await assert.rejects(b.submitLimit({symbol:'BTCUSDT',action:'BUY',quantity:'0.001',limitPrice:'100',expiresAt:NOW+5000,clientOrderId:'vi'+'b'.repeat(25)+'0'}),/below_minimum/);assert.equal(posts,0);
});
test('paper settlement atomically updates balances and cannot oversell',()=>{
 const store=new EvidenceStore(':memory:',{allowMemory:true,now:()=>NOW});const paper=new PaperPortfolio({store,tenant:'alice',seed:{quoteCurrency:'USDT',availableCash:'100',holdings:[]},filters:{},quotePort:{}});
 const plan={planHash:'one',equity:100,orders:[{symbol:'BTCUSDT',action:'BUY',quantity:'0.5',limitPrice:'100',estimatedFee:'0.1',notional:'50'}]};
 store.reserveExecution('alice','one',plan);paper.settlePaper('alice','one',plan);assert.equal(paper.raw().availableCash,'49.9');assert.equal(paper.raw().holdings[0].availableQuantity,'0.5');
 assert.throws(()=>paper.settlePaper('alice','two',{...plan,orders:[{...plan.orders[0],action:'SELL',quantity:'2'}]}),/oversell/);assert.equal(paper.raw().availableCash,'49.9');store.close();
});
test('data failures produce HOLD zero, not an exception or invented signal',async()=>{
 const store=new EvidenceStore(':memory:',{allowMemory:true,now:()=>NOW});store.put('alice','strategy','candidate',{symbol:'BTCUSDT',interval:'1d',model:{config:{slow:50}},frozenAt:NOW});
 const service=createInvestingService({store,dataClient:{history:async()=>{throw Error('offline');}},signal:{},runtime:{},now:()=>NOW});
 const output=await service.signals('alice',['candidate']);assert.equal(output.signals[0].action,'HOLD');assert.equal(output.signals[0].quantity,'0');store.close();
});
test('HTTP scopes, tenant isolation and key revocation are enforced',async t=>{
 let registry={[createHash('sha256').update('reader').digest('hex')]:{subject:'alice',scopes:['investing:read'],expiresAt:NOW+10000}};
 const service={capabilities:()=>({mode:'paper'}),report:tenant=>({tenant}),signals:async tenant=>({tenant}),execute:async()=>{throw Error('must_not_execute');}};
 const server=createServer(createInvestingHandler({service,keyRegistry:()=>registry,now:()=>NOW}));server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const base=`http://127.0.0.1:${server.address().port}/api/investing`;assert.equal((await fetch(base+'/capabilities')).status,401);const headers={authorization:'Bearer reader','content-type':'application/json'};
 assert.deepEqual(await(await fetch(base+'/report?id=x',{headers})).json(),{tenant:'alice'});assert.equal((await fetch(base+'/execute',{method:'POST',headers,body:'{}'})).status,401);
 registry={};assert.equal((await fetch(base+'/capabilities',{headers})).status,401);
});
