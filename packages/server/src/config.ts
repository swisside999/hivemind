import { resolve } from "node:path";

export interface HivemindConfig {
  port: number;
  wsPort: number;
  projectsDir: string;
  templatesDir: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

const ROOT_DIR = resolve(import.meta.dirname, "..", "..", "..");

export const config: HivemindConfig = {
  port: parseInt(process.env.HIVEMIND_PORT ?? "3100", 10),
  wsPort: parseInt(process.env.HIVEMIND_WS_PORT ?? "3101", 10),
  projectsDir: resolve(process.env.HIVEMIND_PROJECTS_DIR ?? resolve(ROOT_DIR, "projects")),
  templatesDir: resolve(import.meta.dirname, "..", "templates"),
  logLevel: (process.env.HIVEMIND_LOG_LEVEL as HivemindConfig["logLevel"]) ?? "info",
};
