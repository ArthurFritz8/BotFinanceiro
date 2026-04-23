#!/usr/bin/env node
/* eslint-disable no-console */
// Recovery utility: read the Copilot Chat JSONL session file (kind=0 snapshot + kind=1/2 patches)
// and emit a compact markdown transcript with user prompts + assistant text only.
// Usage: node scripts/recover-chat-session.mjs <path-to.jsonl> <out.md> [--from <turnIndex>]

import fs from "node:fs";
import readline from "node:readline";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("usage: recover-chat-session.mjs <jsonl> <out.md> [--from N]");
  process.exit(1);
}
const [inFile, outFile] = args;
let fromTurn = 0;
const fromIdx = args.indexOf("--from");
if (fromIdx >= 0) fromTurn = Number(args[fromIdx + 1] ?? 0);

console.log(`reading ${inFile}`);

// Stream the file line-by-line. Snapshot (kind=0) is one giant line we parse with JSON.parse.
const rl = readline.createInterface({
  input: fs.createReadStream(inFile, { encoding: "utf8", highWaterMark: 1 << 20 }),
  crlfDelay: Infinity,
});

let snapshot = null;
let patchCount = 0;

function applyPatch(root, keyPath, value, kind) {
  if (!Array.isArray(keyPath) || keyPath.length === 0) return;
  let cur = root;
  for (let i = 0; i < keyPath.length - 1; i++) {
    const k = keyPath[i];
    if (cur[k] == null) cur[k] = typeof keyPath[i + 1] === "number" ? [] : {};
    cur = cur[k];
  }
  const lastKey = keyPath[keyPath.length - 1];
  // kind=2 with array value at array slot = APPEND (push items), preserving snapshot.
  if (kind === 2 && Array.isArray(value) && Array.isArray(cur[lastKey])) {
    cur[lastKey].push(...value);
    return;
  }
  cur[lastKey] = value;
}

for await (const line of rl) {
  if (!line.trim()) continue;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch (e) {
    console.warn("bad line, skipped:", e.message);
    continue;
  }
  if (obj.kind === 0) {
    snapshot = obj.v;
    console.log("snapshot loaded, requests:", snapshot?.requests?.length ?? 0);
  } else if ((obj.kind === 1 || obj.kind === 2) && snapshot) {
    applyPatch(snapshot, obj.k, obj.v, obj.kind);
    patchCount++;
  }
}
console.log(`patches applied: ${patchCount}`);

if (!snapshot || !Array.isArray(snapshot.requests)) {
  console.error("no requests found in snapshot");
  process.exit(2);
}

const requests = snapshot.requests;
console.log(`total requests: ${requests.length}`);

const out = [];
out.push(`# Conversa recuperada (sessao ${snapshot.sessionId ?? "?"})`);
out.push("");
out.push(`> Exportado de ${inFile}`);
out.push(`> Total de turnos: ${requests.length}. Iniciando do turno ${fromTurn + 1}.`);
out.push("");

function extractTextFromResponse(resp) {
  // resp can be: array of parts, object with .value, string, etc.
  if (!resp) return "";
  if (typeof resp === "string") return resp;
  if (Array.isArray(resp)) return resp.map(extractTextFromResponse).join("");
  if (typeof resp === "object") {
    if (typeof resp.value === "string") return resp.value;
    if (typeof resp.text === "string") return resp.text;
    if (Array.isArray(resp.parts)) return resp.parts.map(extractTextFromResponse).join("");
    if (Array.isArray(resp.value)) return resp.value.map(extractTextFromResponse).join("");
    // fallback: try common nested fields
    const candidates = ["content", "markdown", "message"];
    for (const k of candidates) {
      if (typeof resp[k] === "string") return resp[k];
    }
  }
  return "";
}

for (let i = fromTurn; i < requests.length; i++) {
  const r = requests[i];
  if (!r) continue;
  const ts = r.timestamp ? new Date(r.timestamp).toISOString() : "";
  const userMsg =
    r.message?.text ??
    r.message?.parts?.map((p) => p?.text ?? "").join("") ??
    (typeof r.message === "string" ? r.message : "") ??
    "";
  let assistantText = "";
  const resp = r.response;
  if (Array.isArray(resp)) {
    assistantText = resp
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.kind === "markdownContent" && part?.content?.value) return part.content.value;
        if (part?.value && typeof part.value === "string") return part.value;
        if (part?.value?.value && typeof part.value.value === "string") return part.value.value;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  } else {
    assistantText = extractTextFromResponse(resp);
  }
  out.push(`## Turno ${i + 1}${ts ? ` (${ts})` : ""}`);
  out.push("");
  out.push("### Usuario");
  out.push("");
  out.push(userMsg.trim() || "_(vazio)_");
  out.push("");
  out.push("### Assistente");
  out.push("");
  out.push(assistantText.trim() || "_(sem resposta capturada)_");
  out.push("");
}

fs.writeFileSync(outFile, out.join("\n"), "utf8");
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);
