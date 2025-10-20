// Simple frontend logger with log level control
// Set LOG_LEVEL in localStorage to control verbosity:
// localStorage.setItem('LOG_LEVEL', 'info') // hide debug logs
// localStorage.setItem('LOG_LEVEL', 'debug') // show everything

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

function getLogLevel() {
  const stored = localStorage.getItem('LOG_LEVEL');
  return stored || 'info'; // Default to info level
}

function shouldLog(level) {
  const currentLevel = getLogLevel();
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export const logger = {
  debug: (...args) => {
    if (shouldLog('debug')) {
      console.log('🔍', ...args);
    }
  },

  info: (...args) => {
    if (shouldLog('info')) {
      console.log('ℹ️', ...args);
    }
  },

  warn: (...args) => {
    if (shouldLog('warn')) {
      console.warn('⚠️', ...args);
    }
  },

  error: (...args) => {
    if (shouldLog('error')) {
      console.error('❌', ...args);
    }
  },
};
