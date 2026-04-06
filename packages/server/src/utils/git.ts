import { execSync } from "node:child_process";
import { logger } from "./logger.js";

const SCOPE = "Git";

export function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --git-dir", { cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function getStatus(cwd: string): string[] {
  try {
    const output = execSync("git status --porcelain", { cwd, encoding: "utf-8" });
    return output.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.slice(3));
  } catch {
    return [];
  }
}

export function stageAndCommit(cwd: string, message: string, authorName: string): { sha: string; files: string[] } | null {
  try {
    const files = getStatus(cwd);
    if (files.length === 0) return null;
    execSync("git add -A", { cwd, stdio: "pipe" });
    execSync(`git commit --no-gpg-sign --author="${authorName} <agent@hivemind>" -m "${message.replace(/"/g, '\\"')}"`, { cwd, stdio: "pipe" });
    const sha = execSync("git rev-parse --short HEAD", { cwd, encoding: "utf-8" }).trim();
    logger.info(SCOPE, `Committed ${sha}: ${message} (${files.length} files)`);
    return { sha, files };
  } catch (err) {
    logger.debug(SCOPE, `Commit skipped: ${err instanceof Error ? err.message : "unknown"}`);
    return null;
  }
}

export function getDiff(cwd: string, sha: string): string {
  try {
    return execSync(`git show --stat ${sha}`, { cwd, encoding: "utf-8" });
  } catch {
    return "";
  }
}
