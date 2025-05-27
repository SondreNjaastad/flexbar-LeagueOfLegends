const fs = require('fs');
const path = require('path');

/**
 * Centralized Logger Utility
 * 
 * Provides consistent logging across all plugin components
 * with configurable levels and output formatting.
 */
class Logger {
  constructor(options = {}) {
    this.options = {
      level: process.env.LOG_LEVEL || 'info',
      enableConsole: true,
      enableFile: false,
      fileOptions: {
        path: path.join(process.cwd(), 'logs'),
        filename: 'plugin.log',
        maxSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5
      },
      ...options
    };

    // Log levels (higher number = more verbose)
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
      trace: 4
    };

    this.currentLevel = this.levels[this.options.level] || this.levels.info;
    
    // Initialize file logging if enabled
    if (this.options.enableFile) {
      this.initFileLogging();
    }
  }

  /**
   * Initialize file logging
   */
  initFileLogging() {
    try {
      // Ensure log directory exists
      if (!fs.existsSync(this.options.fileOptions.path)) {
        fs.mkdirSync(this.options.fileOptions.path, { recursive: true });
      }
      
      this.logFilePath = path.join(
        this.options.fileOptions.path, 
        this.options.fileOptions.filename
      );
      
    } catch (error) {
      console.error('Failed to initialize file logging:', error);
      this.options.enableFile = false;
    }
  }

  /**
   * Format log message
   */
  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    
    // Handle different argument types
    let formattedArgs = '';
    if (args.length > 0) {
      formattedArgs = ' ' + args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
    }

    return `[${timestamp}] ${levelStr} ${message}${formattedArgs}`;
  }

  /**
   * Write to log file
   */
  writeToFile(formattedMessage) {
    if (!this.options.enableFile || !this.logFilePath) {
      return;
    }

    try {
      // Check file size and rotate if necessary
      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath);
        if (stats.size > this.options.fileOptions.maxSize) {
          this.rotateLogFile();
        }
      }

      // Append to log file
      fs.appendFileSync(this.logFilePath, formattedMessage + '\n', 'utf8');
      
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Rotate log file when it gets too large
   */
  rotateLogFile() {
    try {
      const { path: logPath, filename, maxFiles } = this.options.fileOptions;
      const baseName = filename.replace(/\.[^/.]+$/, '');
      const extension = path.extname(filename);

      // Shift existing log files
      for (let i = maxFiles - 1; i > 0; i--) {
        const oldFile = path.join(logPath, `${baseName}.${i}${extension}`);
        const newFile = path.join(logPath, `${baseName}.${i + 1}${extension}`);
        
        if (fs.existsSync(oldFile)) {
          if (i === maxFiles - 1) {
            fs.unlinkSync(oldFile); // Remove oldest
          } else {
            fs.renameSync(oldFile, newFile);
          }
        }
      }

      // Move current log to .1
      const currentLog = path.join(logPath, filename);
      const firstBackup = path.join(logPath, `${baseName}.1${extension}`);
      
      if (fs.existsSync(currentLog)) {
        fs.renameSync(currentLog, firstBackup);
      }

    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  /**
   * Log a message at specified level
   */
  log(level, message, ...args) {
    const levelNum = this.levels[level];
    
    // Check if this level should be logged
    if (levelNum === undefined || levelNum > this.currentLevel) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, ...args);

    // Console output
    if (this.options.enableConsole) {
      switch (level) {
        case 'error':
          console.error(formattedMessage);
          break;
        case 'warn':
          console.warn(formattedMessage);
          break;
        case 'debug':
        case 'trace':
          console.debug(formattedMessage);
          break;
        default:
          console.log(formattedMessage);
      }
    }

    // File output
    this.writeToFile(formattedMessage);
  }

  /**
   * Error level logging
   */
  error(message, ...args) {
    this.log('error', message, ...args);
  }

  /**
   * Warning level logging
   */
  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  /**
   * Info level logging
   */
  info(message, ...args) {
    this.log('info', message, ...args);
  }

  /**
   * Debug level logging
   */
  debug(message, ...args) {
    this.log('debug', message, ...args);
  }

  /**
   * Trace level logging
   */
  trace(message, ...args) {
    this.log('trace', message, ...args);
  }

  /**
   * Set log level
   */
  setLevel(level) {
    if (this.levels[level] !== undefined) {
      this.currentLevel = this.levels[level];
      this.options.level = level;
      this.info(`Log level set to: ${level}`);
    } else {
      this.warn(`Invalid log level: ${level}. Valid levels:`, Object.keys(this.levels));
    }
  }

  /**
   * Get current log level
   */
  getLevel() {
    return this.options.level;
  }

  /**
   * Enable/disable console logging
   */
  setConsoleLogging(enabled) {
    this.options.enableConsole = enabled;
    this.info(`Console logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable/disable file logging
   */
  setFileLogging(enabled) {
    this.options.enableFile = enabled;
    if (enabled && !this.logFilePath) {
      this.initFileLogging();
    }
    this.info(`File logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get logger configuration
   */
  getConfig() {
    return {
      level: this.options.level,
      enableConsole: this.options.enableConsole,
      enableFile: this.options.enableFile,
      logFilePath: this.logFilePath || null
    };
  }
}

// Create and export singleton instance
const logger = new Logger({
  level: process.env.NODE_ENV === 'development' ? 'warn' : 'info',
  enableFile: process.env.ENABLE_FILE_LOGGING === 'true'
});

module.exports = logger; 