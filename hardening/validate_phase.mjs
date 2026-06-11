#!/usr/bin/env node
/**
 * SIGNAL Production Hardening — Phase Validation Engine
 * Local deterministic validation. Returns PASS or FAIL.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const H = resolve(import.meta.dirname);

function rj(p) { if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p,"utf-8")); } catch { return null; } }
function rt(p) { if (!existsSync(p)) return null; try { return readFileSync(p,"utf-8"); } catch { return null; } }
function d(ph) { return join(H, `phase-${String(ph).padStart(2,"0")}`); }
function mf(ph, fs) { const m=[]; for(const f of fs) if(!existsSync(join(d(ph),f))) m.push(f); return m; }
function vc(ph) {
  const c = rj(join(d(ph),"PHASE_CHECKPOINT.json"));
  if(!c) return {v:false,r:"Checkpoint missing/invalid"};
  if(typeof c.phase!=="number") return {v:false,r:"Missing phase number"};
  if(!["COMPLETE","INCOMPLETE"].includes(c.status)) return {v:false,r:"Invalid status"};
  if(!c.validation||typeof c.validation.schemaValid!=="boolean") return {v:false,r:"validation.schemaValid missing"};
  if(typeof c.validation.filesPresent!=="boolean") return {v:false,r:"validation.filesPresent missing"};
  if(typeof c.validation.criteriaSatisfied!=="boolean") return {v:false,r:"validation.criteriaSatisfied missing"};
  if(!Array.isArray(c.artifacts)) return {v:false,r:"Missing artifacts"};
  if(!Array.isArray(c.blockingIssues)) return {v:false,r:"Missing blockingIssues"};
  if(!Array.isArray(c.evidence)) return {v:false,r:"Missing evidence"};
  return {v:true,c};
}
function ct(ph,f) { return rt(join(d(ph),f))||""; }

const V = {
  0:()=>{const m=mf(0,["ARCHITECTURE_REVIEW.md","PHASE_CHECKPOINT.json"]);const c=vc(0);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(0,"ARCHITECTURE_REVIEW.md");if(!(t.includes("Architecture A")&&t.includes("Architecture B")&&t.includes("Architecture C")))return{p:false,r:"<3 architectures"};if(!t.toLowerCase().includes("scor")&&!t.toLowerCase().includes("matrix"))return{p:false,r:"No scoring matrix"};if(!/\d+/.test(t)||!t.toLowerCase().includes("select"))return{p:false,r:"No numeric selection"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  1:()=>{const m=mf(1,["RISK_REGISTER.md","PHASE_CHECKPOINT.json"]);const c=vc(1);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(1,"RISK_REGISTER.md");if(!t.includes("|")||!t.includes("---"))return{p:false,r:"No risk table"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  2:()=>{const m=mf(2,["PHASE_CHECKPOINT.json"]);const c=vc(2);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  3:()=>{const m=mf(3,["SECURITY_MODEL.md","PHASE_CHECKPOINT.json"]);const c=vc(3);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(3,"SECURITY_MODEL.md");if(!t.toLowerCase().includes("threat model"))return{p:false,r:"No threat model"};if(!t.toLowerCase().includes("trust boundar"))return{p:false,r:"No trust boundaries"};if(!t.toLowerCase().includes("zero-trust")&&!t.toLowerCase().includes("zero trust"))return{p:false,r:"No zero-trust"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  4:()=>{const m=mf(4,["SUPPLY_CHAIN.md","PHASE_CHECKPOINT.json"]);const c=vc(4);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(4,"SUPPLY_CHAIN.md");if(!t.toLowerCase().includes("dependenc"))return{p:false,r:"No dependencies"};if(!t.toLowerCase().includes("vulnerabilit")&&!t.toLowerCase().includes("cve"))return{p:false,r:"No vulnerability check"};if(!t.toLowerCase().includes("pin")&&!t.toLowerCase().includes("lock"))return{p:false,r:"No pinning"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  5:()=>{const m=mf(5,["SLOS.md","PHASE_CHECKPOINT.json"]);const c=vc(5);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(5,"SLOS.md");if(!t.includes("100%")||!t.toLowerCase().includes("determinist"))return{p:false,r:"Det SLO not 100%"};if(!t.toLowerCase().includes("replay")||!t.includes("100%"))return{p:false,r:"Replay SLO not 100%"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  6:()=>{const m=mf(6,["REPLAY_CERTIFICATION.md","PHASE_CHECKPOINT.json"]);const c=vc(6);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(6,"REPLAY_CERTIFICATION.md");if(!t.toLowerCase().includes("hash chain")&&!t.toLowerCase().includes("fingerprint"))return{p:false,r:"No hash chain"};if(!t.toLowerCase().includes("replay procedure"))return{p:false,r:"No replay procedure"};if(!t.toLowerCase().includes("deterministic proof")&&!t.toLowerCase().includes("determinism proof"))return{p:false,r:"No deterministic proof"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  7:()=>{const m=mf(7,["INVARIANTS.md","PHASE_CHECKPOINT.json"]);const c=vc(7);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(7,"INVARIANTS.md");if(!t.toLowerCase().includes("invariant"))return{p:false,r:"No invariants"};if(!t.toLowerCase().includes("test"))return{p:false,r:"No tests"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  8:()=>{const m=mf(8,["ARCHITECTURE_FITNESS.md","PHASE_CHECKPOINT.json"]);const c=vc(8);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  9:()=>{const m=mf(9,["TESTING_PROGRAM.md","PHASE_CHECKPOINT.json"]);const c=vc(9);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(9,"TESTING_PROGRAM.md");if(!t.toLowerCase().includes("unit test"))return{p:false,r:"No unit tests"};if(!t.toLowerCase().includes("integration test"))return{p:false,r:"No integration tests"};if(!t.toLowerCase().includes("replay test"))return{p:false,r:"No replay tests"};if(!t.toLowerCase().includes("adversarial"))return{p:false,r:"No adversarial tests"};if(!t.toLowerCase().includes("failure injection")&&!t.toLowerCase().includes("fault injection"))return{p:false,r:"No failure injection"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  10:()=>{const m=mf(10,["OBSERVABILITY.md","PHASE_CHECKPOINT.json"]);const c=vc(10);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(10,"OBSERVABILITY.md");if(!t.toLowerCase().includes("log"))return{p:false,r:"No logs"};if(!t.toLowerCase().includes("trace"))return{p:false,r:"No traces"};if(!t.toLowerCase().includes("metric"))return{p:false,r:"No metrics"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  11:()=>{const m=mf(11,["GOVERNANCE.md","PHASE_CHECKPOINT.json"]);const c=vc(11);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(11,"GOVERNANCE.md");if(!t.toLowerCase().includes("rollback"))return{p:false,r:"No rollback"};if(!t.toLowerCase().includes("policy lifecycle"))return{p:false,r:"No policy lifecycle"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  12:()=>{const m=mf(12,["ADRS.md","PHASE_CHECKPOINT.json"]);const c=vc(12);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(12,"ADRS.md");const n=(t.match(/ADR-\d+/g)||[]).length;if(n<6)return{p:false,r:`${n} ADRs, need 6+`};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  13:()=>{const m=mf(13,["PERFORMANCE.md","PHASE_CHECKPOINT.json"]);const c=vc(13);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(13,"PERFORMANCE.md");if(!t.toLowerCase().includes("before")&&!t.toLowerCase().includes("baseline"))return{p:false,r:"No before/baseline"};if(!t.toLowerCase().includes("after")&&!t.toLowerCase().includes("improvement"))return{p:false,r:"No after/improvement"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  14:()=>{const m=mf(14,["PHASE_CHECKPOINT.json"]);const c=vc(14);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const dir=d(14);let n=0;if(existsSync(dir)){for(const f of readdirSync(dir)){if(f.endsWith(".json")&&f!=="PHASE_CHECKPOINT.json")n++;}}if(n<7)return{p:false,r:`${n}/7 JSON artifacts`};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
  15:()=>{const m=mf(15,["FINAL_AUDIT.md","PHASE_CHECKPOINT.json"]);const c=vc(15);if(m.length)return{p:false,r:`Missing: ${m}`};if(!c.v)return{p:false,r:c.r};const t=ct(15,"FINAL_AUDIT.md");if(!t.toLowerCase().includes("audit"))return{p:false,r:"No audit"};if(!t.toLowerCase().includes("traceabilit"))return{p:false,r:"No traceability"};if(!t.toLowerCase().includes("compliance"))return{p:false,r:"No compliance"};if(!t.toLowerCase().includes("operational readiness"))return{p:false,r:"No operational readiness"};if(c.c.status!=="COMPLETE")return{p:false,r:"Not COMPLETE"};return{p:true}},
};

const phase = Number(process.argv[2]);
if (Number.isNaN(phase) || phase < 0 || phase > 15) {
  console.error("Usage: node validate_phase.mjs <phase 0-15>");
  process.exit(2);
}

const result = V[phase]();
if (result.p) {
  console.log("PASS");
  process.exit(0);
} else {
  console.log("FAIL");
  console.error(result.r);
  process.exit(1);
}