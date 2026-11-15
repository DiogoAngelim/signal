import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FencedOperationalLedger, FencedBinancePorts, ObservedPaperPortfolio } from '../src/execution-fencing.mjs';
const NOW=1800000000000;
function ledger(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'investing-fence-'));let now=NOW;const store=new FencedOperationalLedger(path.join(dir,'ledger.db'),{owner:'alice',now:()=>now});store.acquireLease(1000);
 return{store,advance:n=>{now+=n;},close:()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});}};}
test('a transaction that outlives its writer lease rolls back before commit',()=>{
 const t=ledger();try{assert.throws(()=>t.store.transaction(()=>{t.store.append('alice','must_not_commit',{});t.advance(1001);}),/worker_lease_lost/);
 assert.equal(t.store.verifyIntegrity().auditEvents,0);}finally{t.close();}
});
test('restart reconciliation synchronizes exchange time before reading a signed order',async()=>{
 const calls=[];const broker=new FencedBinancePorts({mode:'testnet',apiKey:'fixture-key',apiSecret:'fixture-secret',owner:'alice',permissions:{},leaseGuard:()=>{},now:()=>NOW,
  fetchImpl:async value=>{const url=new URL(value);calls.push(url.pathname);return Response.json(url.pathname.endsWith('/time')?{serverTime:NOW}:{symbol:'BTCUSDT',status:'EXPIRED'});}});
 assert.equal((await broker.order('BTCUSDT','fixture')).status,'EXPIRED');assert.deepEqual(calls,['/api/v3/time','/api/v3/order']);
});
test('lost lease immediately before order POST prevents all financial side effects',async()=>{
 let writes=0;const broker=new FencedBinancePorts({mode:'testnet',apiKey:'fixture-key',apiSecret:'fixture-secret',owner:'alice',permissions:{},leaseGuard:()=>{throw Error('worker_lease_lost');},now:()=>NOW,
  fetchImpl:async(_url,options)=>{if(options.method!=='GET')writes++;return Response.json({});}});
 broker.timeSyncedAt=NOW;await assert.rejects(broker.request('/api/v3/order',{symbol:'BTCUSDT'},'POST',true,1),/worker_lease_lost/);assert.equal(writes,0);
});
test('paper drawdown high-water mark survives a price rise and fall with no trades',async()=>{
 const t=ledger();let price=100;const paper=new ObservedPaperPortfolio({store:t.store,tenant:'alice',seed:{quoteCurrency:'USDT',availableCash:'100',holdings:[{symbol:'BTCUSDT',availableQuantity:'1'}],flowAdjustedPeakEquity:200},filters:{},quotePort:{quote:async()=>({price})},now:()=>NOW});
 try{price=200;assert.equal((await paper.snapshot('alice',{quoteCurrency:'USDT'})).flowAdjustedPeakEquity,300);
 price=90;assert.equal((await paper.snapshot('alice',{quoteCurrency:'USDT'})).flowAdjustedPeakEquity,300);assert.equal(paper.raw().flowAdjustedPeakEquity,300);
 }finally{t.close();}
});
