import { execSync } from "node:child_process";
import { logger } from "./logger.js";

const SCOPE = "ClaudeCLI";

export interface ClaudeCliInfo {
  path: string;
  version: string;
}

export function detectClaudeCli(): ClaudeCliInfo | null {
  try {
    const path = execSync("which claude", { encoding: "utf-8" }).trim();
    const version = execSync("claude --version", { encoding: "utf-8" }).trim();
    logger.info(SCOPE, `Found Claude CLI at ${path} (${version})`);
    return { path, version };
  } catch {
    logger.error(SCOPE, "Claude CLI not found. Install it: https://docs.anthropic.com/en/docs/claude-code");
    return null;
  }
}

export function validateClaudeCli(): ClaudeCliInfo {
  const info = detectClaudeCli();
  if (!info) {
    throw new Error(
      "Claude CLI is required but not found. Install it from https://docs.anthropic.com/en/docs/claude-code"
    );
  }
  return info;
}
