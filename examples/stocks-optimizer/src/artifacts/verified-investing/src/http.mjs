import {createHash,timingSafeEqual} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {check} from './contracts.mjs';
export function isolatedResearch(datasets,options){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./research-worker.mjs',import.meta.url),{workerData:{datasets,options},resourceLimits:{maxOldGenerationSizeMb:128}});let done=false;
 const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);void worker.terminate();error?reject(error):resolve(value);};
 const timer=setTimeout(()=>finish(Error('research_time_budget_exhausted')),25000);
 worker.on('message',message=>finish(message.ok?null:Error(message.error),message.report));worker.on('error',()=>finish(Error('research_worker_failed')));worker.on('exit',code=>{if(!done)finish(Error(`research_worker_exited_${code}`));});
});}
export function createInvestingHandler({service,keyRegistry,now=Date.now}){
 check(keyRegistry&&['object','function'].includes(typeof keyRegistry),'key_registry_required');const rate=new Map();let streams=0;
 function authenticate(request,scope){
  const header=String(request.headers.authorization||'');check(header.startsWith('Bearer ')&&header.length<=520,'unauthorized');
  const digest=createHash('sha256').update(header.slice(7)).digest('hex');let match;
  for(const[hash,key]of Object.entries(typeof keyRegistry==='function'?keyRegistry():keyRegistry))if(/^[a-f0-9]{64}$/.test(hash)&&timingSafeEqual(Buffer.from(hash),Buffer.from(digest)))match=key;
  check(match&&match.expiresAt>now()&&Array.isArray(match.scopes)&&match.scopes.includes(scope),'unauthorized');return match.subject;
 }
 return async function handler(request,response){
  response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');let closeStream;
  try{
   const path=String(request.url||'').split('?')[0].replace(/^\/api\/investing/,'').replace(/^\/investing/,'')||'/',method=request.method||'GET';
   const scope=path==='/execute'?'investing:execute':method==='GET'?'investing:read':'investing:write',tenant=authenticate(request,scope);
   const minute=Math.floor(now()/60000),key=`${tenant}:${minute}`;for(const k of rate.keys())if(!k.endsWith(`:${minute}`))rate.delete(k);
   check(rate.size<1000||rate.has(key),'request_capacity_exceeded');rate.set(key,(rate.get(key)||0)+1);check(rate.get(key)<=60,'rate_limit_exceeded');
   const send=(status,body)=>{response.statusCode=status;response.end(JSON.stringify(body));},url=new URL(request.url||'/', 'http://localhost');
   if(method==='GET'&&path==='/capabilities')return send(200,service.capabilities());
   if(method==='GET'&&path==='/report')return send(200,service.report(tenant,url.searchParams.get('id'))??{error:'not_found'});
   if(method==='GET'&&(path==='/signals'||path==='/stream')){
    const hashes=(url.searchParams.get('strategies')||'').split(',').filter(Boolean);if(path==='/signals')return send(200,await service.signals(tenant,hashes));
    check(streams<20,'stream_capacity_exceeded');streams++;response.setHeader('Content-Type','text/event-stream');response.setHeader('Connection','keep-alive');response.flushHeaders?.();
    let timer,closed=false,count=0;closeStream=()=>{if(closed)return;closed=true;streams--;clearTimeout(timer);response.end();};request.on('aborted',closeStream);response.on('close',closeStream);
    const tick=async()=>{if(closed)return;try{authenticate(request,'investing:read');const data=await service.signals(tenant,hashes);if(closed)return;if(!response.write(`event: signal\ndata: ${JSON.stringify(data)}\n\n`))return closeStream();}
     catch{if(!closed)response.write('event: unavailable\ndata: {"action":"HOLD","quantity":"0"}\n\n');}
     if(++count>=120)return closeStream();if(!closed)timer=setTimeout(tick,service.capabilities().streamingQuotes?5000:60000);
    };void tick();return;
   }
   check(method==='POST','method_not_allowed');let body=request.body;
   if(body===undefined){let bytes=0,text='';for await(const chunk of request){bytes+=chunk.length;check(bytes<=65536,'body_too_large');text+=chunk;}body=JSON.parse(text||'{}');}
   check(body&&typeof body==='object'&&!Array.isArray(body)&&JSON.stringify(body).length<=65536,'invalid_body');
   if(path==='/profile')return send(200,service.saveProfile(tenant,body));
   if(path==='/research')return send(200,await service.research(tenant,body));
   if(path==='/plan')return send(200,await service.plan(tenant,body.strategies));
   if(path==='/execute')return send(200,await service.execute(tenant,body.planHash));
   return send(404,{error:'route_not_found'});
  }catch(error){if(closeStream){closeStream();return;}const code=error.code||'request_failed';response.statusCode=code==='unauthorized'?401:/limit|capacity|busy/.test(code)?429:422;response.end(JSON.stringify({error:code,action:'HOLD',quantity:'0'}));}
 };
}
