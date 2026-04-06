#!/usr/bin/env node

import { resolve } from "node:path";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { validateClaudeCli } from "../utils/claudeCli.js";
import { ProjectManager } from "../projects/ProjectManager.js";
import { Orchestrator } from "../orchestrator/Orchestrator.js";

const SCOPE = "CLI";

const HELP = `
hivemind — Orchestrate Claude Code agents as a virtual company

Usage:
  hivemind init <name> [--display-name <name>]   Create a new project
  hivemind start [--port <port>]                  Start the server + GUI
  hivemind start --headless                       Start without GUI
  hivemind ask <message>                          Send a message to the CEO
  hivemind agents                                 List all agents
  hivemind agent <name> --status                  View an agent's status
  hivemind projects                               List all projects
  hivemind help                                   Show this help

Environment:
  HIVEMIND_PORT          Server port (default: 3100)
  HIVEMIND_PROJECTS_DIR  Projects directory
  HIVEMIND_LOG_LEVEL     Log level: debug|info|warn|error
`.trim();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help") {
    console.log(HELP);
    return;
  }

  switch (command) {
    case "init":
      await handleInit(args.slice(1));
      break;
    case "start":
      await handleStart(args.slice(1));
      break;
    case "ask":
      await handleAsk(args.slice(1));
      break;
    case "agents":
      await handleAgents();
      break;
    case "agent":
      await handleAgent(args.slice(1));
      break;
    case "projects":
      await handleProjects();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

async function handleInit(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("Usage: hivemind init <project-name>");
    process.exit(1);
  }

  const displayNameIdx = args.indexOf("--display-name");
  const displayName = displayNameIdx !== -1 ? args[displayNameIdx + 1] : undefined;

  const pm = new ProjectManager();
  const project = await pm.init(name, displayName);
  console.log(`Created project: ${project.name}`);
  console.log(`  Agents: ${project.agents.join(", ")}`);
  console.log(`  Directory: ${project.workingDirectory}`);
}

async function handleStart(args: string[]): Promise<void> {
  const headless = args.includes("--headless");
  const portIdx = args.indexOf("--port");
  if (portIdx !== -1 && args[portIdx + 1]) {
    config.port = parseInt(args[portIdx + 1], 10);
  }

  // Dynamic import to avoid loading express at CLI parse time
  const { default: express } = await import("express");
  const { createServer } = await import("node:http");
  const { createApiRouter } = await import("../routes/api.js");
  const { createWebSocketServer } = await import("../routes/ws.js");

  const cliInfo = validateClaudeCli();
  console.log(`Claude CLI: ${cliInfo.version}`);

  const pm = new ProjectManager();
  const projects = await pm.list();

  let workingDir = process.cwd();
  let orchestrator: Orchestrator;

  if (projects.length > 0) {
    const projectConfig = await pm.load(projects[0].name);
    workingDir = projectConfig.workingDirectory;
    orchestrator = new Orchestrator(workingDir);
    await orchestrator.initialize(pm.getAgentDir(projects[0].name));
    console.log(`Loaded project: ${projects[0].name}`);
  } else {
    orchestrator = new Orchestrator(workingDir);
    console.log("No projects found. Create one with: hivemind init <name>");
  }

  const app = express();
  app.use(express.json());
  app.use((_, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  const { MemoryManager } = await import("../memory/MemoryManager.js");
  app.use("/api", createApiRouter({ orchestrator, projectManager: pm, memoryManager: null }));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  const server = createServer(app);
  createWebSocketServer(server, orchestrator);

  server.listen(config.port, () => {
    console.log(`Hivemind server: http://localhost:${config.port}`);
    if (!headless) {
      console.log(`Open the GUI at http://localhost:5173`);
    }
  });

  process.on("SIGINT", () => {
    orchestrator.shutdown();
    server.close();
    process.exit(0);
  });
}

async function handleAsk(args: string[]): Promise<void> {
  const message = args.join(" ");
  if (!message) {
    console.error("Usage: hivemind ask <message>");
    process.exit(1);
  }

  try {
    const res = await fetch(`http://localhost:${config.port}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: "ceo", message }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error(`Error: ${err.error}`);
      process.exit(1);
    }

    const data = await res.json() as { response: string };
    console.log(data.response);
  } catch {
    console.error("Failed to connect. Is the server running? (hivemind start)");
    process.exit(1);
  }
}

async function handleAgents(): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${config.port}/api/agents`);
    const data = await res.json() as { agents: Array<{ name: string; displayName: string; role: string; status?: string }> };

    console.log("Agents:");
    for (const agent of data.agents) {
      console.log(`  ${agent.displayName} (${agent.name}) — ${agent.role}`);
    }
  } catch {
    console.error("Failed to connect. Is the server running?");
    process.exit(1);
  }
}

async function handleAgent(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("Usage: hivemind agent <name> --status");
    process.exit(1);
  }

  try {
    const res = await fetch(`http://localhost:${config.port}/api/agents/${encodeURIComponent(name)}`);
    if (!res.ok) {
      console.error(`Agent not found: ${name}`);
      process.exit(1);
    }

    const data = await res.json() as { agent: Record<string, unknown> };
    console.log(JSON.stringify(data.agent, null, 2));
  } catch {
    console.error("Failed to connect. Is the server running?");
    process.exit(1);
  }
}

async function handleProjects(): Promise<void> {
  const pm = new ProjectManager();
  const projects = await pm.list();

  if (projects.length === 0) {
    console.log("No projects. Create one with: hivemind init <name>");
    return;
  }

  console.log("Projects:");
  for (const project of projects) {
    console.log(`  ${project.displayName} (${project.name}) — ${project.agentCount} agents`);
  }
}

main().catch((err) => {
  logger.error(SCOPE, "Fatal error", err);
  process.exit(1);
});
