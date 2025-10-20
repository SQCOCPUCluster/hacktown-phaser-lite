// Centralized logging utility for Convex backend
// Provides log level control and structured logging

export type LogLevel = "debug" | "info" | "warn" | "error" | "none";

// Set this to control which logs are shown
// "debug" = show everything
// "info" = show info, warn, error (hide debug)
// "warn" = show only warnings and errors
// "error" = show only errors
// "none" = hide all logs
const CURRENT_LOG_LEVEL: LogLevel = "info";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL];
}

export const logger = {
  debug: (...args: any[]) => {
    if (shouldLog("debug")) {
      console.log("🔍", ...args);
    }
  },

  info: (...args: any[]) => {
    if (shouldLog("info")) {
      console.log("ℹ️", ...args);
    }
  },

  warn: (...args: any[]) => {
    if (shouldLog("warn")) {
      console.warn("⚠️", ...args);
    }
  },

  error: (...args: any[]) => {
    if (shouldLog("error")) {
      console.error("❌", ...args);
    }
  },

  // Specialized loggers for different systems
  tick: (...args: any[]) => {
    if (shouldLog("debug")) {
      console.log("🔄", ...args);
    }
  },

  spawn: (...args: any[]) => {
    if (shouldLog("info")) {
      console.log("👶", ...args);
    }
  },

  death: (...args: any[]) => {
    if (shouldLog("info")) {
      console.log("💀", ...args);
    }
  },

  conversation: (...args: any[]) => {
    if (shouldLog("debug")) {
      console.log("💬", ...args);
    }
  },

  protagonist: (...args: any[]) => {
    if (shouldLog("info")) {
      console.log("⭐", ...args);
    }
  },

  event: (...args: any[]) => {
    if (shouldLog("info")) {
      console.log("🎭", ...args);
    }
  },

  ai: (...args: any[]) => {
    if (shouldLog("debug")) {
      console.log("🧠", ...args);
    }
  },

  crisis: (...args: any[]) => {
    if (shouldLog("warn")) {
      console.log("🚨", ...args);
    }
  },
};
