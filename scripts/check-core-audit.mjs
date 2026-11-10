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
if(parsed===0 && /vulnerabilities found/i.test(output)){
  throw new Error("Could not parse pnpm audit findings; refusing to report a false clean result.");
}
const totals=output.match(/(\d+) vulnerabilities found/i)?.[1]??"unknown";
process.stdout.write(`Full workspace audit: ${totals} vulnerabilities reported. Parsed advisories: ${parsed}.\n`);
if(findings.length){
  process.stderr.write("High/critical findings in Signal runtime/domain/server dependency paths:\n");
  for(const finding of findings) process.stderr.write(`- ${finding.severity}: ${finding.packageName} (${finding.path})\n`);
  process.exit(1);
}
process.stdout.write("No high/critical advisories were found in api/, packages/, or server/ dependency paths. Example applications remain separately visible in the full audit artifact.\n");
