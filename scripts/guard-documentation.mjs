import { execFileSync } from "node:child_process";

function runGit(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function getChangedFilesForPullRequest() {
  const baseRef = process.env.GITHUB_BASE_REF;

  if (!baseRef || baseRef.trim().length === 0) {
    return [];
  }

  runGit(["fetch", "--no-tags", "--depth=1", "origin", baseRef]);

  const output = runGit(["diff", "--name-only", `origin/${baseRef}...HEAD`]);
  return output.length > 0 ? output.split("\n").filter(Boolean) : [];
}

function getChangedFilesForPush() {
  try {
    const output = runGit(["diff", "--name-only", "HEAD~1...HEAD"]);
    return output.length > 0 ? output.split("\n").filter(Boolean) : [];
  } catch {
    const output = runGit(["show", "--pretty=format:", "--name-only", "HEAD"]);
    return output.length > 0 ? output.split("\n").filter(Boolean) : [];
  }
}

function getChangedFilesForLocal() {
  const output = runGit(["status", "--porcelain"]);

  if (output.length === 0) {
    return [];
  }

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter((filePath) => filePath.length > 0);
}

function getChangedFiles() {
  const eventName = process.env.GITHUB_EVENT_NAME;

  if (eventName === "pull_request") {
    return getChangedFilesForPullRequest();
  }

  if (eventName === "push") {
    return getChangedFilesForPush();
  }

  return getChangedFilesForLocal();
}

function isDocumentationFile(filePath) {
  return filePath === "README.md" || filePath.startsWith("docs/");
}

function requiresDocumentation(filePath) {
  return (
    filePath.startsWith("apps/") ||
    filePath.startsWith("packages/") ||
    filePath.startsWith("scripts/") ||
    filePath.startsWith(".github/workflows/") ||
    filePath === ".env.example" ||
    filePath === "package.json" ||
    filePath === "package-lock.json"
  );
}

function main() {
  const changedFiles = getChangedFiles();

  if (changedFiles.length === 0) {
    console.log("documentation-guard: no changed files detected.");
    return;
  }

  const technicalChanges = changedFiles.filter((filePath) => requiresDocumentation(filePath));

  if (technicalChanges.length === 0) {
    console.log("documentation-guard: no technical changes requiring documentation.");
    return;
  }

  const documentationChanges = changedFiles.filter((filePath) => isDocumentationFile(filePath));

  if (documentationChanges.length > 0) {
    console.log("documentation-guard: OK (technical changes have documentation updates).");
    return;
  }

  console.error("documentation-guard: FAIL");
  console.error("Technical changes detected without documentation updates.");
  console.error("Changed technical files:");

  for (const filePath of technicalChanges) {
    console.error(`- ${filePath}`);
  }

  console.error("Expected at least one update in docs/ or README.md.");
  process.exitCode = 1;
}

main();
