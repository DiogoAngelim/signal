import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {check} from './contracts.mjs';
import {EvidenceStore} from './evidence.mjs';
import {VerifiedDataClient,createInvestingService,startAutonomousWorker} from './service.mjs';
import {createInvestingHandler,isolatedResearch} from './http.mjs';
import {VerifiedBinancePorts} from './binance.mjs';
import {PaperPortfolio} from './paper.mjs';
import * as signal from '../dist/signal-adapter.mjs';
process.umask(0o077);
function readConfig(filename){
 check(filename&&path.isAbsolute(filename),'absolute_private_config_path_required');const info=fs.lstatSync(filename);
 check(info.isFile()&&!info.isSymbolicLink()&&info.size<=65536,'invalid_config_file');check((info.mode&0o077)===0,'config_must_be_owner_only');return JSON.parse(fs.readFileSync(filename,'utf8'));
}
const configPath=process.env.VERIFIED_INVESTING_CONFIG,configuration=()=>readConfig(configPath),config=configuration(),mode=config.mode||'paper';
check(['paper','testnet','live'].includes(mode),'invalid_mode');check(path.isAbsolute(config.ledgerFile||'')&&config.ledgerFile!==':memory:','persistent_ledger_path_required');
fs.mkdirSync(path.dirname(config.ledgerFile),{recursive:true,mode:0o700});const store=new EvidenceStore(config.ledgerFile);
const lock=JSON.parse(fs.readFileSync(new URL('../dependency-lock.json',import.meta.url),'utf8'));
const dataClient=new VerifiedDataClient({url:config.data.url,expectedRelease:lock.marketData.commit,token:process.env.MARKET_DATA_READ_TOKEN,streaming:config.data.streaming===true});
let accountPort,filterPort,permissionPort,brokerPort;
if(mode==='paper'&&config.paper){const paper=new PaperPortfolio({store,tenant:config.owner,seed:config.paper.account,filters:config.paper.filters,quotePort:dataClient});accountPort=paper;filterPort=paper;brokerPort=paper;}
else if(mode!=='paper'){
 check(config.permissions?.enabled===true,'explicit_operator_permission_required');
 const broker=new VerifiedBinancePorts({mode,apiKey:process.env.BINANCE_API_KEY,apiSecret:process.env.BINANCE_API_SECRET,owner:config.owner,
 permissions:()=>{const c=configuration();check(c.mode===mode&&c.owner===config.owner,'configuration_identity_changed');return c.permissions;},profileLookup:tenant=>store.currentProfile(tenant),quotePort:dataClient});
 accountPort=filterPort=permissionPort=brokerPort=broker;
}
const service=createInvestingService({store,dataClient,signal,runtime:signal.createInvestingRuntime(),mode,accountPort,filterPort,permissionPort,brokerPort,researchPort:isolatedResearch});
const server=createServer(createInvestingHandler({service,keyRegistry:()=>configuration().apiKeys})),port=Number(process.env.PORT||4030);
check(Number.isSafeInteger(port)&&port>0&&port<65536,'invalid_port');server.headersTimeout=10000;server.requestTimeout=45000;server.maxHeadersCount=40;server.listen(port,process.env.HOST||'127.0.0.1');
let worker;
if(config.autonomy?.enabled===true){check(mode!=='paper','paper_autonomy_not_enabled');worker=startAutonomousWorker({service,tenant:config.owner,strategyHashes:config.autonomy.strategies,permissions:config.autonomy,intervalMs:config.autonomy.intervalMs||60000,
 onError:code=>console.error(JSON.stringify({event:'autonomy.stopped',code})),onResult:result=>console.log(JSON.stringify({event:'autonomy.cycle',status:result.status||'blocked'}))});}
console.log(JSON.stringify({event:'verified_investing.started',mode,autonomy:Boolean(worker),sourceCommit:lock.signal.commit}));
for(const event of['SIGINT','SIGTERM'])process.once(event,()=>{worker?.stop();server.close(()=>store.close());});
