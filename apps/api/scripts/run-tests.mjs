import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceRoot = resolve(projectRoot, "src");

async function collectTestFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const testFiles = [];

  for (const entry of entries) {
    const absoluteEntryPath = resolve(directoryPath, entry.name);

    if (entry.isDirectory()) {
      const nestedTestFiles = await collectTestFiles(absoluteEntryPath);
      testFiles.push(...nestedTestFiles);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      testFiles.push(absoluteEntryPath);
    }
  }

  return testFiles;
}

const discoveredTestFiles = (await collectTestFiles(sourceRoot)).sort((left, right) =>
  left.localeCompare(right),
);

if (discoveredTestFiles.length === 0) {
  console.log("No API tests found.");
  process.exit(0);
}

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...discoveredTestFiles],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  },
);

child.once("exit", (code) => {
  process.exit(code ?? 1);
});
