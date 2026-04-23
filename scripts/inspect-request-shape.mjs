import fs from "node:fs";
import readline from "node:readline";
const file = process.argv[2];
const idx = Number(process.argv[3] ?? 200);
const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: "utf8", highWaterMark: 1<<20 }), crlfDelay: Infinity });
let snap = null;
function applyPatch(root, keyPath, value){ if(!Array.isArray(keyPath)||!keyPath.length) return; let cur=root; for(let i=0;i<keyPath.length-1;i++){ const k=keyPath[i]; if(cur[k]==null) cur[k]= typeof keyPath[i+1]==="number"?[]:{}; cur=cur[k]; } cur[keyPath[keyPath.length-1]]=value; }
for await (const line of rl){ if(!line.trim()) continue; let o; try{o=JSON.parse(line);}catch{continue;} if(o.kind===0) snap=o.v; else if((o.kind===1||o.kind===2)&&snap) applyPatch(snap,o.k,o.v); }
console.log("snap top keys:", Object.keys(snap));
console.log("requests length:", snap.requests?.length);
console.log("sample indices nonempty:");
for (let i = 165; i < Math.min(snap.requests.length, 405); i++) {
  const rr = snap.requests[i];
  if (rr && Object.keys(rr).length > 0) {
    console.log(`  [${i}] keys=`, Object.keys(rr).slice(0, 12));
  }
}
const r = snap.requests[idx];
console.log(`\nrequest[${idx}]:`, JSON.stringify(r, null, 2).slice(0, 4000));
