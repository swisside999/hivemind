import { mkdir, readdir, readFile, writeFile, rm, cp } from "node:fs/promises";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import type { ProjectConfig, ProjectSummary } from "./types.js";

const SCOPE = "ProjectManager";
const HIVEMIND_DIR = ".hivemind";
const CONFIG_FILE = "config.json";

export class ProjectManager {
  private projectsDir: string;
  private templatesDir: string;
  private activeProject: string | null = null;

  constructor(projectsDir?: string, templatesDir?: string) {
    this.projectsDir = projectsDir ?? config.projectsDir;
    this.templatesDir = templatesDir ?? resolve(config.templatesDir, "default-company");
  }

  async init(name: string, displayName?: string, workingDir?: string): Promise<ProjectConfig> {
    const projectDir = resolve(this.projectsDir, name);
    if (existsSync(projectDir)) {
      throw new Error(`Project already exists: ${name}`);
    }

    const hivemindDir = resolve(projectDir, HIVEMIND_DIR);
    const agentsDir = resolve(hivemindDir, "agents");

    await mkdir(agentsDir, { recursive: true });

    const templateFiles = await readdir(this.templatesDir);
    const agentNames: string[] = [];

    for (const file of templateFiles) {
      if (!file.endsWith(".md")) continue;
      const agentName = file.replace(".md", "");
      agentNames.push(agentName);

      const agentDir = resolve(agentsDir, agentName);
      await mkdir(agentDir, { recursive: true });

      await cp(
        resolve(this.templatesDir, file),
        resolve(agentDir, "agent.md")
      );

      await writeFile(resolve(agentDir, "memory.md"), `# ${agentName} — Working Memory\n\nNo memories yet.\n`);
      await writeFile(resolve(agentDir, "current-task.md"), "");
      await writeFile(resolve(agentDir, "decisions.md"), `# ${agentName} — Decision Log\n\n`);
    }

    const projectConfig: ProjectConfig = {
      name,
      displayName: displayName ?? name,
      createdAt: new Date().toISOString(),
      workingDirectory: workingDir ?? projectDir,
      agents: agentNames,
    };

    await writeFile(
      resolve(hivemindDir, CONFIG_FILE),
      JSON.stringify(projectConfig, null, 2)
    );

    await writeFile(
      resolve(hivemindDir, "message-log.jsonl"),
      ""
    );

    logger.info(SCOPE, `Created project: ${name} with ${agentNames.length} agents`);
    return projectConfig;
  }

  async list(): Promise<ProjectSummary[]> {
    if (!existsSync(this.projectsDir)) return [];

    const entries = await readdir(this.projectsDir, { withFileTypes: true });
    const summaries: ProjectSummary[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

      const configPath = resolve(this.projectsDir, entry.name, HIVEMIND_DIR, CONFIG_FILE);
      if (!existsSync(configPath)) continue;

      try {
        const raw = await readFile(configPath, "utf-8");
        const projectConfig = JSON.parse(raw) as ProjectConfig;
        summaries.push({
          name: projectConfig.name,
          displayName: projectConfig.displayName,
          createdAt: projectConfig.createdAt,
          agentCount: projectConfig.agents.length,
          activeAgents: 0,
        });
      } catch (err) {
        logger.warn(SCOPE, `Failed to read project config: ${entry.name}`);
      }
    }

    return summaries;
  }

  async load(name: string): Promise<ProjectConfig> {
    const configPath = resolve(this.projectsDir, name, HIVEMIND_DIR, CONFIG_FILE);
    if (!existsSync(configPath)) {
      throw new Error(`Project not found: ${name}`);
    }

    const raw = await readFile(configPath, "utf-8");
    const projectConfig = JSON.parse(raw) as ProjectConfig;
    this.activeProject = name;
    logger.info(SCOPE, `Loaded project: ${name}`);
    return projectConfig;
  }

  async delete(name: string): Promise<void> {
    const projectDir = resolve(this.projectsDir, name);
    if (!existsSync(projectDir)) {
      throw new Error(`Project not found: ${name}`);
    }

    await rm(projectDir, { recursive: true, force: true });
    if (this.activeProject === name) {
      this.activeProject = null;
    }
    logger.info(SCOPE, `Deleted project: ${name}`);
  }

  getActiveProject(): string | null {
    return this.activeProject;
  }

  getProjectDir(name: string): string {
    return resolve(this.projectsDir, name);
  }

  getAgentDir(projectName: string): string {
    return resolve(this.projectsDir, projectName, HIVEMIND_DIR, "agents");
  }

  getAgentDefinitionDir(projectName: string, agentName: string): string {
    return resolve(this.projectsDir, projectName, HIVEMIND_DIR, "agents", agentName);
  }
}
