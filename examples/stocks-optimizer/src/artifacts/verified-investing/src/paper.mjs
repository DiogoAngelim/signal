import {check,fingerprint,units,decimal,tradeNotional} from './contracts.mjs';
/** Local simulation account; cannot access real accounts or exchanges. */
export class PaperPortfolio {
 constructor({store,tenant,seed,filters,quotePort,now=Date.now}){
  this.store=store;this.tenant=tenant;this.filtersBySymbol=filters;this.quotePort=quotePort;this.now=now;
  check(seed&&Array.isArray(seed.holdings),'paper_seed_required');units(seed.availableCash);for(const h of seed.holdings)units(h.availableQuantity);
  this.store.db.exec('CREATE TABLE IF NOT EXISTS paper_accounts(tenant TEXT PRIMARY KEY,body TEXT NOT NULL)');
  this.store.db.prepare('INSERT OR IGNORE INTO paper_accounts VALUES(?,?)').run(tenant,JSON.stringify(seed));
 }
 raw(){const row=this.store.db.prepare('SELECT body FROM paper_accounts WHERE tenant=?').get(this.tenant);check(row,'paper_account_missing');return JSON.parse(row.body);}
 async snapshot(tenant,profile){check(tenant===this.tenant,'account_owner_mismatch');const raw=this.raw();check(raw.quoteCurrency===profile.quoteCurrency,'currency_conversion_required');let equity=Number(raw.availableCash);
  for(const h of raw.holdings){const q=await this.quotePort.quote(h.symbol);equity+=Number(h.availableQuantity)*q.price;}
  return{...raw,flowAdjustedPeakEquity:Math.max(raw.flowAdjustedPeakEquity??equity,equity),syncedAt:this.now(),reconciled:true,openOrders:0,simulated:true};
 }
 async filters(symbol,currency){const f=this.filtersBySymbol[symbol];check(f&&f.quoteCurrency===currency,'paper_exchange_filters_required');return structuredClone(f);}
 settlePaper(tenant,key,plan){check(tenant===this.tenant,'account_owner_mismatch');return this.store.transaction(()=>{
  const raw=this.raw();let cash=units(raw.availableCash);const holdings=new Map(raw.holdings.map(h=>[h.symbol,units(h.availableQuantity)]));
  for(const o of plan.orders){if(o.action==='HOLD')continue;const q=units(o.quantity),notional=units(tradeNotional(o.quantity,o.limitPrice)),fee=units(o.estimatedFee);check(q>0n,'invalid_quantity');const held=holdings.get(o.symbol)||0n;
   if(o.action==='SELL'){check(q<=held,'paper_oversell');holdings.set(o.symbol,held-q);cash+=notional-fee;}
   else{check(o.action==='BUY'&&notional+fee<=cash,'paper_insufficient_cash');holdings.set(o.symbol,held+q);cash-=notional+fee;}}
  check(cash>=0n,'paper_negative_cash');const next={...raw,availableCash:decimal(cash),flowAdjustedPeakEquity:Math.max(raw.flowAdjustedPeakEquity||0,plan.equity),holdings:[...holdings].filter(([,q])=>q>0n).map(([symbol,q])=>({symbol,availableQuantity:decimal(q)}))};
  this.store.db.prepare('UPDATE paper_accounts SET body=? WHERE tenant=?').run(JSON.stringify(next),tenant);
  const body={mode:'paper',simulated:true,orders:plan.orders,account:next,liveOrdersPlaced:0};this.store.db.prepare("UPDATE executions SET status='filled',body=? WHERE tenant=? AND id=?").run(JSON.stringify(body),tenant,key);
  this.store.append(tenant,'paper.filled',{planHash:plan.planHash,accountHash:fingerprint(next)});return{status:'filled',body};
 });}
}
