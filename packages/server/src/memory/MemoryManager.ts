import { readFile, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { logger } from "../utils/logger.js";
import type { AgentMemory, MemoryUpdate } from "./types.js";

const SCOPE = "MemoryManager";

function safePath(base: string, ...segments: string[]): string {
  const resolved = resolve(base, ...segments);
  if (!resolved.startsWith(base)) {
    throw new Error(`Path traversal detected: ${segments.join("/")}`);
  }
  return resolved;
}

const FILE_MAP: Record<MemoryUpdate["field"], string> = {
  memory: "memory.md",
  currentTask: "current-task.md",
  decisions: "decisions.md",
};

const MAX_MEMORY_LINES = 200;

export class MemoryManager {
  private agentBaseDir: string;
  private hivemindDir: string;

  constructor(agentBaseDir: string) {
    this.agentBaseDir = agentBaseDir;
    this.hivemindDir = resolve(agentBaseDir, "..");
  }

  async read(agentName: string): Promise<AgentMemory> {
    const agentDir = safePath(this.agentBaseDir, agentName);

    const [memory, currentTask, decisions] = await Promise.all([
      this.readFile(resolve(agentDir, "memory.md")),
      this.readFile(resolve(agentDir, "current-task.md")),
      this.readFile(resolve(agentDir, "decisions.md")),
    ]);

    return { agentName, memory, currentTask, decisions };
  }

  async update(update: MemoryUpdate): Promise<void> {
    const fileName = FILE_MAP[update.field];
    const filePath = safePath(this.agentBaseDir, update.agentName, fileName);

    if (update.append) {
      const entry = `\n${update.content}`;
      await appendFile(filePath, entry);
      logger.debug(SCOPE, `Appended to ${update.agentName}/${fileName}`);
    } else {
      await writeFile(filePath, update.content);
      logger.debug(SCOPE, `Wrote ${update.agentName}/${fileName}`);
    }

    if (update.field === "memory") {
      await this.pruneMemory(filePath);
    }
  }

  async clearCurrentTask(agentName: string): Promise<void> {
    const filePath = safePath(this.agentBaseDir, agentName, "current-task.md");
    await writeFile(filePath, "");
    logger.debug(SCOPE, `Cleared current task for ${agentName}`);
  }

  async appendDecision(agentName: string, decision: string): Promise<void> {
    const filePath = safePath(this.agentBaseDir, agentName, "decisions.md");
    const timestamp = new Date().toISOString();
    const entry = `\n## ${timestamp}\n${decision}\n`;
    await appendFile(filePath, entry);
    logger.debug(SCOPE, `Recorded decision for ${agentName}`);
  }

  async getMemoryForPrompt(agentName: string): Promise<string> {
    const agentMemory = await this.read(agentName);
    const sections: string[] = [];

    if (agentMemory.memory.trim()) {
      sections.push(`## Working Memory\n${agentMemory.memory}`);
    }
    if (agentMemory.currentTask.trim()) {
      sections.push(`## Current Task\n${agentMemory.currentTask}`);
    }

    return sections.join("\n\n");
  }

  async readSharedMemory(): Promise<string> {
    const filePath = safePath(this.hivemindDir, "shared-memory.md");
    if (!existsSync(filePath)) return "";
    return readFile(filePath, "utf-8");
  }

  async writeSharedMemory(content: string): Promise<void> {
    const filePath = safePath(this.hivemindDir, "shared-memory.md");
    await writeFile(filePath, content);
    logger.debug(SCOPE, "Updated shared memory");
  }

  async appendSharedMemory(entry: string, author: string): Promise<void> {
    const filePath = safePath(this.hivemindDir, "shared-memory.md");
    const timestamp = new Date().toISOString();
    const formattedEntry = `\n## ${timestamp} — ${author}\n${entry}\n`;
    if (!existsSync(filePath)) {
      await writeFile(filePath, `# Company Wiki\n\nShared knowledge across all agents.\n${formattedEntry}`);
    } else {
      await appendFile(filePath, formattedEntry);
    }
    logger.debug(SCOPE, `${author} appended to shared memory`);
  }

  private async readFile(filePath: string): Promise<string> {
    if (!existsSync(filePath)) return "";
    return readFile(filePath, "utf-8");
  }

  private async pruneMemory(filePath: string): Promise<void> {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    if (lines.length <= MAX_MEMORY_LINES) return;

    const pruned = lines.slice(lines.length - MAX_MEMORY_LINES).join("\n");
    await writeFile(filePath, pruned);
    logger.info(SCOPE, `Pruned memory file to ${MAX_MEMORY_LINES} lines: ${filePath}`);
  }
}
