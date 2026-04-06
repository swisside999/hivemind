import { readFile, readdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import matter from "gray-matter";
import { logger } from "../utils/logger.js";
import type { AgentConfig, AgentRole, AgentModel } from "./types.js";

const SCOPE = "AgentDefinition";

const VALID_ROLES: Set<string> = new Set([
  "ceo", "cto", "cpo", "coo", "senior-dev", "junior-dev",
  "code-reviewer", "designer", "design-reviewer", "devops", "qa", "custom",
]);

const VALID_MODELS: Set<string> = new Set(["sonnet", "opus", "haiku"]);

interface AgentFrontmatter {
  name: string;
  display_name: string;
  description: string;
  role: string;
  color: string;
  icon_props?: string[];
  reports_to: string | null;
  direct_reports?: string[];
  authority_level: number;
  can_escalate_to_user?: boolean;
  model?: string;
}

function validateFrontmatter(data: Record<string, unknown>, filePath: string): AgentFrontmatter {
  const required = ["name", "display_name", "description", "role", "color", "authority_level"] as const;

  for (const field of required) {
    if (data[field] === undefined || data[field] === null) {
      throw new Error(`Agent definition ${filePath} missing required field: ${field}`);
    }
  }

  const role = String(data.role);
  if (!VALID_ROLES.has(role)) {
    throw new Error(`Agent definition ${filePath} has invalid role: ${role}`);
  }

  const authorityLevel = Number(data.authority_level);
  if (authorityLevel < 1 || authorityLevel > 5) {
    throw new Error(`Agent definition ${filePath} has invalid authority_level: ${authorityLevel} (must be 1-5)`);
  }

  const model = data.model ? String(data.model) : "sonnet";
  if (!VALID_MODELS.has(model)) {
    throw new Error(`Agent definition ${filePath} has invalid model: ${model}`);
  }

  return {
    name: String(data.name),
    display_name: String(data.display_name),
    description: String(data.description),
    role,
    color: String(data.color),
    icon_props: Array.isArray(data.icon_props) ? data.icon_props.map(String) : [],
    reports_to: data.reports_to ? String(data.reports_to) : null,
    direct_reports: Array.isArray(data.direct_reports) ? data.direct_reports.map(String) : [],
    authority_level: authorityLevel,
    can_escalate_to_user: Boolean(data.can_escalate_to_user ?? false),
    model,
  };
}

export function parseAgentDefinition(raw: string, filePath: string): AgentConfig {
  const { data, content } = matter(raw);
  const frontmatter = validateFrontmatter(data, filePath);

  return {
    name: frontmatter.name,
    displayName: frontmatter.display_name,
    description: frontmatter.description,
    role: frontmatter.role as AgentRole,
    color: frontmatter.color,
    iconProps: frontmatter.icon_props ?? [],
    reportsTo: frontmatter.reports_to,
    directReports: frontmatter.direct_reports ?? [],
    authorityLevel: frontmatter.authority_level,
    canEscalateToUser: frontmatter.can_escalate_to_user ?? false,
    model: frontmatter.model as AgentModel,
    systemPrompt: content.trim(),
  };
}

export async function loadAgentDefinition(filePath: string): Promise<AgentConfig> {
  const raw = await readFile(filePath, "utf-8");
  logger.debug(SCOPE, `Loaded agent definition from ${filePath}`);
  return parseAgentDefinition(raw, filePath);
}

export async function loadAllAgentDefinitions(directory: string): Promise<AgentConfig[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const agents: AgentConfig[] = [];

  // Support both flat .md files (templates) and subdirectory layout (projects)
  for (const entry of entries) {
    let filePath: string;
    if (entry.isDirectory()) {
      filePath = resolve(directory, entry.name, "agent.md");
      try {
        await readFile(filePath, "utf-8"); // existence check
      } catch {
        continue;
      }
    } else if (extname(entry.name) === ".md") {
      filePath = resolve(directory, entry.name);
    } else {
      continue;
    }

    try {
      const agentConfig = await loadAgentDefinition(filePath);
      agents.push(agentConfig);
    } catch (err) {
      logger.error(SCOPE, `Failed to load agent definition: ${entry.name}`, err);
    }
  }

  logger.info(SCOPE, `Loaded ${agents.length} agent definitions from ${directory}`);
  return agents;
}
