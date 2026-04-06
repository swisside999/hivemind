import { Router, type Request, type Response } from "express";
import type { Orchestrator } from "../orchestrator/Orchestrator.js";
import type { ProjectManager } from "../projects/ProjectManager.js";
import type { MemoryManager } from "../memory/MemoryManager.js";
import type { TicketManager } from "../tickets/TicketManager.js";
import { logger } from "../utils/logger.js";

const SCOPE = "API";

// --- Runtime Settings ---

export interface RuntimeSettings {
  defaultModel: "sonnet" | "opus" | "haiku";
  autoCommit: boolean;
  logLevel: "debug" | "info" | "warn" | "error";
  intelligentModelSelection: boolean;
}

const runtimeSettings: RuntimeSettings = {
  defaultModel: "sonnet",
  autoCommit: true,
  logLevel: "info",
  intelligentModelSelection: false,
};

const VALID_MODELS = new Set(["sonnet", "opus", "haiku"]);
const VALID_LOG_LEVELS = new Set(["debug", "info", "warn", "error"]);

export function getRuntimeSettings(): RuntimeSettings {
  return { ...runtimeSettings };
}

export function updateRuntimeSettings(patch: Partial<RuntimeSettings>): RuntimeSettings {
  if (patch.defaultModel !== undefined) {
    if (!VALID_MODELS.has(patch.defaultModel)) {
      throw new Error(`Invalid model: ${patch.defaultModel}`);
    }
    runtimeSettings.defaultModel = patch.defaultModel;
  }
  if (patch.autoCommit !== undefined) {
    if (typeof patch.autoCommit !== "boolean") {
      throw new Error("autoCommit must be a boolean");
    }
    runtimeSettings.autoCommit = patch.autoCommit;
  }
  if (patch.logLevel !== undefined) {
    if (!VALID_LOG_LEVELS.has(patch.logLevel)) {
      throw new Error(`Invalid log level: ${patch.logLevel}`);
    }
    runtimeSettings.logLevel = patch.logLevel;
  }
  if (patch.intelligentModelSelection !== undefined) {
    if (typeof patch.intelligentModelSelection !== "boolean") {
      throw new Error("intelligentModelSelection must be a boolean");
    }
    runtimeSettings.intelligentModelSelection = patch.intelligentModelSelection;
  }
  return { ...runtimeSettings };
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

interface ApiDeps {
  orchestrator: Orchestrator;
  projectManager: ProjectManager;
  memoryManager: MemoryManager | null;
  ticketManager: TicketManager | null;
}

export function createApiRouter(deps: ApiDeps): Router {
  const router = Router();
  const { orchestrator, projectManager, ticketManager } = deps;

  // --- Projects ---

  router.get("/projects", async (_req: Request, res: Response) => {
    try {
      const projects = await projectManager.list();
      res.json({ projects });
    } catch (err) {
      logger.error(SCOPE, "Failed to list projects", err);
      res.status(500).json({ error: "Failed to list projects" });
    }
  });

  router.post("/projects", async (req: Request, res: Response) => {
    try {
      const { name, displayName, workingDirectory } = req.body as { name?: string; displayName?: string; workingDirectory?: string };
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "name is required" });
        return;
      }
      if (!/^[a-z0-9-]+$/.test(name)) {
        res.status(400).json({ error: "name must be lowercase alphanumeric with hyphens" });
        return;
      }
      const project = await projectManager.init(name, displayName, workingDirectory);
      res.status(201).json({ project });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create project";
      logger.error(SCOPE, message, err);
      res.status(400).json({ error: message });
    }
  });

  router.get("/projects/:name", async (req: Request, res: Response) => {
    try {
      const project = await projectManager.load(param(req, "name"));
      res.json({ project });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Project not found";
      res.status(404).json({ error: message });
    }
  });

  router.delete("/projects/:name", async (req: Request, res: Response) => {
    try {
      await projectManager.delete(param(req, "name"));
      res.json({ deleted: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete project";
      res.status(400).json({ error: message });
    }
  });

  // --- Agents ---

  router.get("/agents", (_req: Request, res: Response) => {
    const configs = orchestrator.agentManager.getAllConfigs();
    const states = orchestrator.agentManager.getAgentStates();
    res.json({ agents: configs.map((c, i) => ({ ...c, state: states[i] })) });
  });

  router.get("/agents/:name", (req: Request, res: Response) => {
    const config = orchestrator.agentManager.getConfig(param(req, "name"));
    if (!config) {
      res.status(404).json({ error: `Agent not found: ${param(req, "name")}` });
      return;
    }
    res.json({ agent: config });
  });

  // --- Messages ---

  router.post("/messages", async (req: Request, res: Response) => {
    try {
      const { agent, message } = req.body as { agent?: string; message?: string };
      if (!agent || !message) {
        res.status(400).json({ error: "agent and message are required" });
        return;
      }
      const response = await orchestrator.sendUserMessage(agent, message);
      res.json({ response });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      logger.error(SCOPE, message, err);
      res.status(500).json({ error: message });
    }
  });

  router.get("/messages", (_req: Request, res: Response) => {
    const log = orchestrator.messageBus.getLog();
    res.json({ messages: log });
  });

  // --- Escalations ---

  router.get("/escalations", (_req: Request, res: Response) => {
    const pending = orchestrator.escalationManager.getPending();
    res.json({ escalations: pending });
  });

  router.post("/escalations/:id/resolve", (req: Request, res: Response) => {
    const { resolution } = req.body as { resolution?: string };
    if (!resolution) {
      res.status(400).json({ error: "resolution is required" });
      return;
    }
    const escalation = orchestrator.resolveEscalation(param(req, "id"), resolution);
    if (!escalation) {
      res.status(404).json({ error: "Escalation not found" });
      return;
    }
    res.json({ escalation });
  });

  // --- State ---

  router.get("/state", (_req: Request, res: Response) => {
    res.json(orchestrator.getState());
  });

  // --- Tickets ---

  router.get("/tickets", (req: Request, res: Response) => {
    if (!ticketManager) {
      res.status(503).json({ error: "Ticket system not available" });
      return;
    }
    const { status, assignedTo } = req.query as { status?: string; assignedTo?: string };
    const tickets = ticketManager.getFiltered(
      status as Parameters<typeof ticketManager.getFiltered>[0],
      assignedTo
    );
    res.json({ tickets });
  });

  router.post("/tickets", (req: Request, res: Response) => {
    if (!ticketManager) {
      res.status(503).json({ error: "Ticket system not available" });
      return;
    }
    const { title, description, priority, assignedTo } = req.body as {
      title?: string;
      description?: string;
      priority?: string;
      assignedTo?: string;
    };
    if (!title || typeof title !== "string") {
      res.status(400).json({ error: "title is required" });
      return;
    }
    const ticket = ticketManager.create({
      title,
      description,
      priority: (priority as Parameters<typeof ticketManager.create>[0]["priority"]) ?? "normal",
      createdBy: "user",
      assignedTo: assignedTo ?? "ceo",
    });
    res.status(201).json({ ticket });
  });

  router.get("/tickets/:id", (req: Request, res: Response) => {
    if (!ticketManager) {
      res.status(503).json({ error: "Ticket system not available" });
      return;
    }
    const ticket = ticketManager.getById(param(req, "id"));
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const children = ticketManager.getChildren(ticket.id);
    res.json({ ticket, children });
  });

  router.patch("/tickets/:id", (req: Request, res: Response) => {
    if (!ticketManager) {
      res.status(503).json({ error: "Ticket system not available" });
      return;
    }
    const ticketId = param(req, "id");
    const ticket = ticketManager.getById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const { status, assignedTo, priority } = req.body as {
      status?: string;
      assignedTo?: string;
      priority?: string;
    };
    if (status) {
      ticketManager.updateStatus(
        ticketId,
        status as Parameters<typeof ticketManager.updateStatus>[1],
        "user"
      );
    }
    if (assignedTo) {
      ticketManager.assign(ticketId, assignedTo, "user");
    }
    if (priority) {
      ticketManager.updatePriority(
        ticketId,
        priority as Parameters<typeof ticketManager.updatePriority>[1],
        "user"
      );
    }
    const updated = ticketManager.getById(ticketId);
    res.json({ ticket: updated });
  });

  router.post("/tickets/:id/comment", (req: Request, res: Response) => {
    if (!ticketManager) {
      res.status(503).json({ error: "Ticket system not available" });
      return;
    }
    const ticketId = param(req, "id");
    const { comment } = req.body as { comment?: string };
    if (!comment) {
      res.status(400).json({ error: "comment is required" });
      return;
    }
    const ticket = ticketManager.addComment(ticketId, "user", comment);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    res.json({ ticket });
  });

  // --- Shared Memory ---

  router.get("/shared-memory", async (_req: Request, res: Response) => {
    if (!deps.memoryManager) {
      res.json({ content: "" });
      return;
    }
    const content = await deps.memoryManager.readSharedMemory();
    res.json({ content });
  });

  router.put("/shared-memory", async (req: Request, res: Response) => {
    if (!deps.memoryManager) {
      res.status(503).json({ error: "No project loaded" });
      return;
    }
    const { content } = req.body as { content?: string };
    if (content === undefined) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    await deps.memoryManager.writeSharedMemory(content);
    if (deps.orchestrator) {
      deps.orchestrator.setSharedMemory(content);
    }
    res.json({ ok: true });
  });

  // --- Usage ---

  router.get("/usage", (_req: Request, res: Response) => {
    res.json({ usage: orchestrator.getUsageStats() });
  });

  // --- Settings ---

  router.get("/settings", (_req: Request, res: Response) => {
    res.json({ settings: getRuntimeSettings() });
  });

  router.patch("/settings", (req: Request, res: Response) => {
    try {
      const patch = req.body as Partial<RuntimeSettings>;
      const updated = updateRuntimeSettings(patch);
      res.json({ settings: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid settings";
      res.status(400).json({ error: message });
    }
  });

  // --- Export ---

  router.get("/export/messages", (_req: Request, res: Response) => {
    const log = orchestrator.messageBus.getLog();
    const filename = `hivemind-messages-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json({ exportedAt: new Date().toISOString(), messages: log });
  });

  router.get("/export/tickets", (_req: Request, res: Response) => {
    if (!ticketManager) {
      res.status(503).json({ error: "Ticket system not available" });
      return;
    }
    const allTickets = ticketManager.getAll();
    const filename = `hivemind-tickets-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json({ exportedAt: new Date().toISOString(), tickets: allTickets });
  });

  return router;
}
