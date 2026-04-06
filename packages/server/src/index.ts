import { createServer } from "node:http";
import { resolve } from "node:path";
import express from "express";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { validateClaudeCli } from "./utils/claudeCli.js";
import { Orchestrator } from "./orchestrator/Orchestrator.js";
import { ProjectManager } from "./projects/ProjectManager.js";
import { MemoryManager } from "./memory/MemoryManager.js";
import { TicketManager } from "./tickets/TicketManager.js";
import { createApiRouter } from "./routes/api.js";
import { createWebSocketServer } from "./routes/ws.js";

const SCOPE = "Server";

async function main(): Promise<void> {
  logger.setLevel(config.logLevel);
  logger.info(SCOPE, "Starting Hivemind server...");

  const cliInfo = validateClaudeCli();
  logger.info(SCOPE, `Using Claude CLI: ${cliInfo.version}`);

  const projectManager = new ProjectManager();

  const projects = await projectManager.list();
  let activeProjectDir: string | null = null;
  let memoryManager: MemoryManager | null = null;
  let ticketManager: TicketManager | null = null;

  if (projects.length > 0) {
    const projectConfig = await projectManager.load(projects[0].name);
    activeProjectDir = projectConfig.workingDirectory;
    const agentDir = projectManager.getAgentDir(projects[0].name);
    memoryManager = new MemoryManager(agentDir);
    ticketManager = new TicketManager(resolve(projectManager.getProjectDir(projects[0].name), ".hivemind"));
    await ticketManager.load();
    logger.info(SCOPE, `Loaded project: ${projects[0].name}`);
  }

  const workingDir = activeProjectDir ?? process.cwd();
  const orchestrator = new Orchestrator(workingDir);

  if (activeProjectDir) {
    const agentDir = projectManager.getAgentDir(projectManager.getActiveProject()!);
    await orchestrator.initialize(agentDir);
    if (ticketManager) {
      orchestrator.connectTicketManager(ticketManager);
    }
    if (memoryManager) {
      const sharedMem = await memoryManager.readSharedMemory();
      orchestrator.setSharedMemory(sharedMem);
    }
  }

  const app = express();
  app.use(express.json());

  const allowedOrigins = [`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:${config.port}`];
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  app.use("/api", createApiRouter({ orchestrator, projectManager, memoryManager, ticketManager }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: "0.1.0" });
  });

  const server = createServer(app);
  createWebSocketServer(server, orchestrator, ticketManager);

  server.listen(config.port, "127.0.0.1", () => {
    logger.info(SCOPE, `Hivemind server running on http://127.0.0.1:${config.port}`);
    logger.info(SCOPE, `WebSocket available on ws://127.0.0.1:${config.port}`);
  });

  const shutdown = (): void => {
    logger.info(SCOPE, "Shutting down...");
    orchestrator.shutdown();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  logger.error(SCOPE, "Fatal error", err);
  process.exit(1);
});
