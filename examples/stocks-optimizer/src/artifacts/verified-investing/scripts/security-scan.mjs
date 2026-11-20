import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const signatures=['KAUi'+'TqPiXdWs','HjHsHac'+'$ObTDDGcJ','split'+'Lane('];
const problems=[];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 if(['node_modules','dist','.git'].includes(e.name)||e.isSymbolicLink())continue;
 const f=path.join(dir,e.name);if(e.isDirectory()){walk(f);continue;}
 if(!/\.(?:[cm]?js|tsx?)$/.test(f)&&e.name!=='init')continue;
 const text=fs.readFileSync(f,'utf8');
 if(signatures.some(s=>text.includes(s)))problems.push(f+': known unsafe source signature');
 if(text.split(/\r?\n/).some(s=>s.length>12000))problems.push(f+': unexplained executable long line');
}}
walk(root);if(problems.length){console.error(problems.join('\n'));process.exitCode=1;}else console.log('Source signature scan passed; not a general malware certification.');
