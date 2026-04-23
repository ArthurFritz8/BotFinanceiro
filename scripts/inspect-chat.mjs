import fs from "node:fs";
import readline from "node:readline";

const inFile = process.argv[2];
const rl = readline.createInterface({
  input: fs.createReadStream(inFile, { encoding: "utf8", highWaterMark: 1 << 20 }),
  crlfDelay: Infinity,
});
let snapshot = null;
function applyPatch(root, keyPath, value) {
  if (!Array.isArray(keyPath) || keyPath.length === 0) return;
  let cur = root;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const k = keyPath[i];
    if (cur[k] == null) cur[k] = typeof keyPath[i + 1] === "number" ? [] : {};
    cur = cur[k];
  }
  cur[keyPath[keyPath.length - 1]] = value;
}
for await (const line of rl) {
  if (!line.trim()) continue;
  let obj;
  try { obj = JSON.parse(line); } catch { continue; }
  if (obj.kind === 0) snapshot = obj.v;
  else if ((obj.kind === 1 || obj.kind === 2) && snapshot) applyPatch(snapshot, obj.k, obj.v);
}
const kinds = new Map();
for (const r of snapshot.requests) {
  if (Array.isArray(r?.response)) {
    for (const p of r.response) {
      const k = p?.kind ?? "(no-kind)";
      kinds.set(k, (kinds.get(k) ?? 0) + 1);
    }
  }
}
console.log("KINDS DISTRIBUTION:");
for (const [k, n] of [...kinds.entries()].sort((a,b)=>b[1]-a[1])) {
  console.log(" " + k + ": " + n);
}
let sampled = false;
for (const r of snapshot.requests) {
  if (!Array.isArray(r?.response)) continue;
  for (const p of r.response) {
    if (p?.kind === "markdownContent") {
      console.log("MARKDOWN SAMPLE:", JSON.stringify(p).slice(0, 600));
      sampled = true;
      break;
    }
  }
  if (sampled) break;
}
for (let i = 0; i < Math.min(5, snapshot.requests.length); i++) {
  const r = snapshot.requests[i];
  const txt = r?.message?.text ?? "";
  console.log("R" + i + ": text='" + txt.slice(0,80) + "' responseLen=" + (Array.isArray(r?.response)?r.response.length:0));
}
