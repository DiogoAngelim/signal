import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tools=process.env.VERIFIED_TOOLING_DIR;
const req=createRequire(tools?path.join(tools,'package.json'):path.join(root,'package.json'));
const esbuild=await import(pathToFileURL(req.resolve('esbuild')).href);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
await esbuild.build({entryPoints:[path.join(root,'src/signal-adapter.ts')],outfile:path.join(root,'dist/signal-adapter.mjs'),
 bundle:true,platform:'node',format:'esm',target:'node22',sourcemap:true,logLevel:'info',
 alias:{'@signal/ports':path.join(root,'vendor/api/ports/src/index.ts'),
 '@signal/protocol':path.join(root,'vendor/api/protocol/src/index.ts'),'zod':req.resolve('zod')},
 tsconfigRaw:{compilerOptions:{target:'ES2022',module:'ESNext'}}});
console.log('Built pinned Signal runtime and calibration sources without executing bootstrap/lifecycle scripts.');
