import {parentPort,workerData} from 'node:worker_threads';
import {discoverStrategy} from './research.mjs';
import * as signal from '../dist/signal-adapter.mjs';
try{parentPort.postMessage({ok:true,report:discoverStrategy(workerData.datasets,{...workerData.options,signal})});}
catch(error){parentPort.postMessage({ok:false,error:error.code||error.message||'research_failed'});}
