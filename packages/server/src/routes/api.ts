import { Router, type Request, type Response } from "express";
import type { Orchestrator } from "../orchestrator/Orchestrator.js";
import type { ProjectManager } from "../projects/ProjectManager.js";
import type { MemoryManager } from "../memory/MemoryManager.js";
import { logger } from "../utils/logger.js";

const SCOPE = "API";

function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

interface ApiDeps {
  orchestrator: Orchestrator;
  projectManager: ProjectManager;
  memoryManager: MemoryManager | null;
}

export function createApiRouter(deps: ApiDeps): Router {
  const router = Router();
  const { orchestrator, projectManager } = deps;

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
      const { name, displayName } = req.body as { name?: string; displayName?: string };
      if (!name || typeof name !== "string") {
        res.status(400).json({ error: "name is required" });
        return;
      }
      if (!/^[a-z0-9-]+$/.test(name)) {
        res.status(400).json({ error: "name must be lowercase alphanumeric with hyphens" });
        return;
      }
      const project = await projectManager.init(name, displayName);
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

  return router;
}
