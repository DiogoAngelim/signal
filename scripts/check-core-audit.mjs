#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const file=process.argv[2];
if(!file) throw new Error("Usage: node scripts/check-core-audit.mjs <pnpm-audit-output>");
let output=await readFile(file,"utf8");
output=output.replace(/\u001b\[[0-9;]*m/g,"");
const blocks=output.split(/(?=┌─)/);
const findings=[];
let parsed=0;
for(const block of blocks){
  const severity=block.match(/│\s*(critical|high|moderate|low)\s*│/i)?.[1]?.toLowerCase();
  const packageName=block.match(/│ Package\s+│\s+([^│]+?)\s+│/)?.[1]?.trim();
  const corePath=block.match(/(?:api|packages|server)__[^\\s│]+/)?.[0];
  if(!severity||!packageName) continue;
  parsed+=1;
  if(corePath && ["critical","high"].includes(severity)){
    findings.push({severity,packageName,path:corePath});
  }
}
const totals=output.match(/(\d+) vulnerabilities found/i)?.[1]??null;
if(parsed===0 && totals!==null){
  const summary=[...output.matchAll(/Severity:\s*(\d+)\s+(critical|high|moderate|low)/gi)];
  const summarizedTotal=summary.reduce((sum,match)=>sum+Number(match[1]),0);
  const hasHighOrCritical=summary.some(match=>["critical","high"].includes(match[2].toLowerCase()) && Number(match[1])>0);
  if(summary.length===0 || summarizedTotal!==Number(totals)){
    throw new Error("Could not reconcile pnpm audit summary; refusing to report a false clean result.");
  }
  if(hasHighOrCritical){
    throw new Error("pnpm audit summary reports high/critical findings but did not provide parseable advisory paths.");
  }
  process.stdout.write(`Full workspace audit: ${totals} vulnerabilities reported; severity summary: ${summary.map(match=>match[1]+" "+match[2]).join(", ")}. Detailed advisories were omitted by pnpm.\n`);
}else if(parsed===0 && !/no known vulnerabilities found/i.test(output)){
  throw new Error("Could not parse pnpm audit findings; refusing to report a false clean result.");
}
process.stdout.write(`Full workspace audit: ${totals??"0"} vulnerabilities reported. Parsed advisories: ${parsed}.\n`);
if(findings.length){
  process.stderr.write("High/critical findings in Signal runtime/domain/server dependency paths:\n");
  for(const finding of findings) process.stderr.write(`- ${finding.severity}: ${finding.packageName} (${finding.path})\n`);
  process.exit(1);
}
process.stdout.write("No high/critical advisories were found in api/, packages/, or server/ dependency paths. Example applications remain separately visible in the full audit artifact.\n");
