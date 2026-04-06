type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, scope: string, message: string): string {
  return `[${formatTimestamp()}] [${level.toUpperCase()}] [${scope}] ${message}`;
}

export const logger = {
  setLevel(level: LogLevel): void {
    currentLevel = level;
  },

  debug(scope: string, message: string): void {
    if (shouldLog("debug")) {
      console.debug(formatMessage("debug", scope, message));
    }
  },

  info(scope: string, message: string): void {
    if (shouldLog("info")) {
      console.log(formatMessage("info", scope, message));
    }
  },

  warn(scope: string, message: string): void {
    if (shouldLog("warn")) {
      console.warn(formatMessage("warn", scope, message));
    }
  },

  error(scope: string, message: string, error?: unknown): void {
    if (shouldLog("error")) {
      console.error(formatMessage("error", scope, message));
      if (error instanceof Error) {
        console.error(`  Stack: ${error.stack}`);
      }
    }
  },
};
