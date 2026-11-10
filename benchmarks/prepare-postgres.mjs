#!/usr/bin/env node
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dbRequire=createRequire(new URL("../api/idempotency-postgres/package.json",import.meta.url));
const {Pool}=dbRequire("pg");
const connectionString=process.env.SIGNAL_TEST_DATABASE_URL??process.env.DATABASE_URL;
if(!connectionString) throw new Error("SIGNAL_TEST_DATABASE_URL or DATABASE_URL is required");
const root=path.dirname(fileURLToPath(import.meta.url));
const migrations=path.resolve(root,"../api/idempotency-postgres/src/drizzle/migrations");
const files=(await readdir(migrations)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
if(files.length===0) throw new Error("No PostgreSQL adapter migrations were found");
const pool=new Pool({connectionString,max:1,application_name:"signal-benchmark-migrations"});
try{
  for(const file of files){
    const sql=await readFile(path.join(migrations,file),"utf8");
    await pool.query(sql);
    process.stdout.write(`Applied ${file}\n`);
  }
}finally{
  await pool.end();
}
