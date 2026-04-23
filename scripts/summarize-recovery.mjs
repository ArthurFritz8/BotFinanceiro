import fs from "node:fs";
const md = fs.readFileSync(process.argv[2], "utf8");
const lines = md.split(/\r?\n/);
const out = [];
let curTurn = null;
let curTs = null;
let inUser = false;
let buf = [];
function flush() {
  if (curTurn != null && buf.length) {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    const snippet = text.length > 220 ? text.slice(0, 220) + "..." : text;
    out.push(`- T${curTurn} (${curTs ?? "?"}): ${snippet}`);
  }
  buf = [];
}
for (const line of lines) {
  const m = line.match(/^## Turno (\d+)(?: \(([^)]+)\))?/);
  if (m) {
    flush();
    curTurn = m[1];
    curTs = m[2] ?? null;
    inUser = false;
    continue;
  }
  if (line.startsWith("### Usuario")) { inUser = true; continue; }
  if (line.startsWith("### Assistente")) { flush(); inUser = false; continue; }
  if (inUser && line.trim()) buf.push(line.trim());
}
flush();
fs.writeFileSync(process.argv[3], out.join("\n"), "utf8");
console.log("wrote", process.argv[3], out.length, "entries");
