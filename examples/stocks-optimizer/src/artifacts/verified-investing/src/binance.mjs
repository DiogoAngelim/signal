import { createHmac } from 'node:crypto';
import { check, number, units, decimal, SCALE, fingerprint } from './contracts.mjs';

/** Spot only: no withdrawals, transfers, leverage, arbitrary hosts or automatic POST retry. */
export class VerifiedBinancePorts {
 constructor({mode,apiKey,apiSecret,owner,permissions,profileLookup,quotePort,fetchImpl=globalThis.fetch,now=Date.now}){
  check(['testnet','live'].includes(mode),'broker_mode_required');check(typeof apiKey==='string'&&apiKey.length>0&&typeof apiSecret==='string'&&apiSecret.length>0,'broker_credentials_required');
  this.mode=mode;this.apiKey=apiKey;this.apiSecret=apiSecret;this.owner=owner;this.permissionSource=permissions;this.profileLookup=profileLookup;this.quotePort=quotePort;this.fetch=fetchImpl;this.now=now;
  this.base=mode==='live'?'https://api.binance.com':'https://testnet.binance.vision';this.active=0;this.used=0;this.window=0;this.blockedUntil=0;this.cache=new Map();this.timeOffset=0;this.timeSyncedAt=0;
 }
 get permissionConfig(){return typeof this.permissionSource==='function'?this.permissionSource():this.permissionSource;}
 async request(path,params={},method='GET',signed=true,weight=20){
  const now=this.now();check(now>=this.blockedUntil,'broker_cooldown');check(this.active<2,'broker_concurrency');
  const window=Math.floor(now/60000);if(window!==this.window){this.window=window;this.used=0;}check(this.used+weight<=300,'broker_weight_budget');this.used+=weight;this.active++;
  try{
   const q=new URLSearchParams();for(const[k,v]of Object.entries(params))q.set(k,String(v));
   if(signed){check(now-this.timeSyncedAt<60000,'broker_time_sync_required');q.set('timestamp',String(Math.floor(now+this.timeOffset)));q.set('recvWindow','5000');q.set('signature',createHmac('sha256',this.apiSecret).update(q.toString()).digest('hex'));}
   const response=await this.fetch(`${this.base}${path}?${q}`,{method,redirect:'error',signal:AbortSignal.timeout(8000),headers:signed?{'X-MBX-APIKEY':this.apiKey}:{}});
   if([401,403,418,429,451].includes(response.status)){
    const seconds=Number(response.headers.get('retry-after')),wait=Number.isFinite(seconds)&&seconds>0?seconds*1000:60000;
    this.blockedUntil=now+Math.max(wait,response.status===429?60000:86400000);throw Error('broker_restricted');
   }
   check(Number(response.headers.get('content-length')||0)<=2000000,'broker_response_too_large');const reader=response.body.getReader(),chunks=[];let size=0;
   try{while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2000000){await reader.cancel();throw Error('broker_response_too_large');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('broker_invalid_response');}
   if(!response.ok){const error=new Error('broker_request_failed');error.code='broker_request_failed';error.exchangeCode=data?.code;throw error;}return data;
  }finally{this.active--;}
 }
 async syncTime(){const before=this.now(),result=await this.request('/api/v3/time',{},'GET',false,1),after=this.now();number(result.serverTime,'server_time',before-60000,after+60000);check(after-before<=2000,'broker_clock_uncertainty');this.timeOffset=result.serverTime-(before+after)/2;this.timeSyncedAt=after;}
 async symbolInfo(symbol){
  check(/^[A-Z0-9]{5,24}$/.test(symbol),'invalid_symbol');const old=this.cache.get(symbol);if(old&&this.now()-old.at<300000)return old.info;
  const result=await this.request('/api/v3/exchangeInfo',{symbol},'GET',false,20),info=result.symbols?.find(s=>s.symbol===symbol);
  check(info?.status==='TRADING'&&info.isSpotTradingAllowed!==false,'symbol_not_tradable');if(this.cache.size>=20)this.cache.delete(this.cache.keys().next().value);this.cache.set(symbol,{at:this.now(),info});return info;
 }
 async filters(symbol,quoteCurrency){
  const info=await this.symbolInfo(symbol);check(info.quoteAsset===quoteCurrency,'quote_currency_mismatch');
  const lot=info.filters.find(f=>f.filterType==='LOT_SIZE'),price=info.filters.find(f=>f.filterType==='PRICE_FILTER'),min=info.filters.find(f=>f.filterType==='NOTIONAL')||info.filters.find(f=>f.filterType==='MIN_NOTIONAL');
  check(lot&&price&&min,'exchange_filters_unavailable');number(this.permissionConfig.feeBps,'fee_ceiling',1,1000);
  return{quoteCurrency,lotStep:lot.stepSize,minQuantity:lot.minQty,maxQuantity:lot.maxQty,priceTick:price.tickSize,minNotional:min.minNotional,feeBps:this.permissionConfig.feeBps,liquidityCapWeight:0.25};
 }
 async snapshot(tenant,profile){
  check(tenant===this.owner,'account_owner_mismatch');await this.syncTime();const account=await this.request('/api/v3/account'),open=await this.request('/api/v3/openOrders',{},'GET',true,80);
  check(account.canTrade===true&&Array.isArray(account.balances)&&Array.isArray(open),'broker_account_unavailable');check(open.length===0,'open_order_reconciliation_required');
  const maker=Number(account.commissionRates?.maker),taker=Number(account.commissionRates?.taker);
  check(Number.isFinite(maker)&&Number.isFinite(taker)&&maker>=0&&taker>=0,'account_fee_rates_unavailable');check(Math.max(maker,taker)*10000<=this.permissionConfig.feeBps,'fee_ceiling_below_account_rate');
  const configs=this.permissionConfig.allowedSymbols;check(Array.isArray(configs)&&configs.length>0&&configs.length<=20,'symbol_allowlist_required');
  const infos=[];for(const symbol of configs)infos.push(await this.symbolInfo(symbol));check(infos.every(i=>i.quoteAsset===profile.quoteCurrency),'mixed_account_quote_currency');
  const supported=new Set([profile.quoteCurrency,...infos.map(i=>i.baseAsset)]);
  check(account.balances.every(b=>(units(b.free)+units(b.locked)===0n)||supported.has(b.asset)),'unvalued_broker_holdings');check(account.balances.every(b=>units(b.locked)===0n),'locked_balance_reconciliation_required');
  const balances=new Map(account.balances.map(b=>[b.asset,b])),availableCash=balances.get(profile.quoteCurrency)?.free||'0',holdings=[];let equity=Number(availableCash);
  for(const info of infos){const availableQuantity=balances.get(info.baseAsset)?.free||'0';if(units(availableQuantity)>0n){const q=await this.quotePort.quote(info.symbol);holdings.push({symbol:info.symbol,availableQuantity});equity+=Number(availableQuantity)*q.price;}}
  check(this.permissionConfig.cashFlowReconciliationAt>=this.now()-86400000&&this.permissionConfig.cashFlowReconciliationAt<=this.now(),'cash_flow_reconciliation_required');
  const peak=this.permissionConfig.flowAdjustedPeakEquity;number(peak,'flow_adjusted_peak_equity',equity,1e12);
  return{quoteCurrency:profile.quoteCurrency,syncedAt:this.now(),reconciled:true,openOrders:0,holdings,availableCash,flowAdjustedPeakEquity:peak};
 }
 async permissions(tenant,plan){const profile=this.profileLookup(tenant);check(profile,'profile_required');const account=await this.snapshot(tenant,profile);return{...this.permissionConfig,tenant,mode:this.mode,profileHash:fingerprint(profile),accountHash:fingerprint({...account,syncedAt:0}),reconciledAccountAt:account.syncedAt,spentToday:0};}
 assertPermission(symbol,expiresAt){
  const p=this.permissionConfig;check(p.enabled===true&&p.expiresAt>this.now(),'execution_permission_expired');
  check(p.killSwitch===false&&p.securityReviewCleared===true,'execution_clearance_required');
  if(this.mode==='live')check(p.liveAcknowledged===true,'live_acknowledgement_required');
  check(p.allowedSymbols.includes(symbol),'symbol_not_permitted');check(Number.isFinite(expiresAt)&&this.now()<expiresAt,'order_plan_expired');
 }
 async submitLimit(order){
  check(this.permissionConfig.enabled===true&&this.permissionConfig.expiresAt>this.now(),'execution_permission_expired');check(this.permissionConfig.killSwitch===false&&this.permissionConfig.securityReviewCleared===true,'execution_clearance_required');
  if(this.mode==='live')check(this.permissionConfig.liveAcknowledged===true,'live_acknowledgement_required');check(this.permissionConfig.allowedSymbols.includes(order.symbol),'symbol_not_permitted');
  check(['BUY','SELL'].includes(order.action)&&/^vi[a-f0-9]{25}\d{1,2}$/.test(order.clientOrderId),'invalid_order');await this.syncTime();
  const info=await this.symbolInfo(order.symbol),filters=await this.filters(order.symbol,info.quoteAsset),quantity=units(order.quantity),price=units(order.limitPrice);
  check(quantity>0n&&price>0n&&quantity%units(filters.lotStep)===0n&&price%units(filters.priceTick)===0n,'order_step_mismatch');check(quantity>=units(filters.minQuantity)&&quantity<=units(filters.maxQuantity),'order_quantity_limit');
  const notional=quantity*price/SCALE;check(notional>=units(filters.minNotional),'order_below_minimum');const nf=info.filters.find(f=>f.filterType==='NOTIONAL');if(nf?.maxNotional)check(notional<=units(nf.maxNotional),'order_above_exchange_maximum');
  try{return await this.request('/api/v3/order',{symbol:order.symbol,origClientOrderId:order.clientOrderId});}catch(error){if(error.exchangeCode!==-2013)throw error;}
  this.assertPermission(order.symbol,order.expiresAt);
  return this.request('/api/v3/order',{symbol:order.symbol,side:order.action,type:'LIMIT',timeInForce:'IOC',quantity:decimal(quantity),price:decimal(price),newClientOrderId:order.clientOrderId},'POST',true,1);
 }
 order(symbol,clientOrderId){return this.request('/api/v3/order',{symbol,origClientOrderId:clientOrderId});}
}
