const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

/**
 * State Manager - Centralized state management with persistence
 * 
 * Manages:
 * - Key states and configurations
 * - Connection states
 * - User preferences
 * - Cache data
 */
class StateManager {
  constructor(options = {}) {
    this.options = {
      persistenceFile: path.join(process.cwd(), 'plugin-state.json'),
      autoSaveInterval: 30000, // 30 seconds
      maxCacheAge: 300000, // 5 minutes
      ...options
    };

    // State storage
    this.state = {
      keys: new Map(), // keyUid -> keyState
      connections: new Map(), // service -> connectionState
      preferences: new Map(), // key -> value
      cache: new Map(), // key -> { data, timestamp }
      metadata: {
        lastSave: null,
        version: '1.0.0',
        created: Date.now()
      }
    };

    // Persistence
    this.autoSaveTimer = null;
    this.isDirty = false;
    this.isInitialized = false;
  }

  /**
   * Initialize the state manager
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('StateManager already initialized');
      return;
    }

    logger.info('Initializing State Manager...');
    
    try {
      // Load existing state
      await this.loadState();
      
      // Start auto-save
      this.startAutoSave();
      
      this.isInitialized = true;
      logger.info('State Manager initialized successfully');
      
    } catch (error) {
      logger.warn('Failed to load existing state, starting fresh:', error.message);
      this.isInitialized = true;
      this.startAutoSave();
    }
  }

  /**
   * Load state from persistence file
   */
  async loadState() {
    try {
      const data = await fs.readFile(this.options.persistenceFile, 'utf8');
      const savedState = JSON.parse(data);
      
      // Validate and restore state
      if (savedState.metadata && savedState.metadata.version) {
        // Convert saved data back to Maps
        if (savedState.keys) {
          this.state.keys = new Map(Object.entries(savedState.keys));
        }
        if (savedState.connections) {
          this.state.connections = new Map(Object.entries(savedState.connections));
        }
        if (savedState.preferences) {
          this.state.preferences = new Map(Object.entries(savedState.preferences));
        }
        if (savedState.cache) {
          // Validate cache entries and remove expired ones
          const now = Date.now();
          const validCache = Object.entries(savedState.cache).filter(([key, value]) => {
            return value.timestamp && (now - value.timestamp) < this.options.maxCacheAge;
          });
          this.state.cache = new Map(validCache);
        }
        if (savedState.metadata) {
          this.state.metadata = { ...this.state.metadata, ...savedState.metadata };
        }
        
        logger.info(`Loaded state from ${this.options.persistenceFile}`);
        logger.debug(`Loaded ${this.state.keys.size} key states, ${this.state.cache.size} cache entries`);
      }
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info('No existing state file found, starting fresh');
      } else {
        throw error;
      }
    }
  }

  /**
   * Save state to persistence file
   */
  async saveState() {
    if (!this.isDirty) {
      return;
    }

    try {
      // Convert Maps to plain objects for serialization
      const serializable = {
        keys: Object.fromEntries(this.state.keys),
        connections: Object.fromEntries(this.state.connections),
        preferences: Object.fromEntries(this.state.preferences),
        cache: Object.fromEntries(this.state.cache),
        metadata: {
          ...this.state.metadata,
          lastSave: Date.now()
        }
      };

      // Ensure directory exists
      const dir = path.dirname(this.options.persistenceFile);
      await fs.mkdir(dir, { recursive: true });

      // Write with atomic operation (write to temp file then rename)
      const tempFile = `${this.options.persistenceFile}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(serializable, null, 2), 'utf8');
      await fs.rename(tempFile, this.options.persistenceFile);

      this.isDirty = false;
      this.state.metadata.lastSave = Date.now();
      
      logger.debug(`State saved to ${this.options.persistenceFile}`);
      
    } catch (error) {
      logger.error('Failed to save state:', error);
      throw error;
    }
  }

  /**
   * Start auto-save timer
   */
  startAutoSave() {
    if (this.autoSaveTimer) {
      return;
    }

    this.autoSaveTimer = setInterval(async () => {
      try {
        await this.saveState();
      } catch (error) {
        logger.error('Auto-save failed:', error);
      }
    }, this.options.autoSaveInterval);

    logger.debug('Auto-save started');
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      logger.debug('Auto-save stopped');
    }
  }

  /**
   * Mark state as dirty (needs saving)
   */
  markDirty() {
    this.isDirty = true;
  }

  // --- Key State Management ---

  /**
   * Update key state
   */
  updateKeyState(keyUid, data) {
    const currentState = this.state.keys.get(keyUid) || {};
    const newState = {
      ...currentState,
      ...data,
      lastUpdate: Date.now()
    };

    this.state.keys.set(keyUid, newState);
    this.markDirty();
    
    logger.debug(`Updated state for key ${keyUid}`);
    return newState;
  }

  /**
   * Get key state
   */
  getKeyState(keyUid) {
    return this.state.keys.get(keyUid) || null;
  }

  /**
   * Remove key state
   */
  removeKeyState(keyUid) {
    const removed = this.state.keys.delete(keyUid);
    if (removed) {
      this.markDirty();
      logger.debug(`Removed state for key ${keyUid}`);
    }
    return removed;
  }

  /**
   * Get all key states
   */
  getAllKeyStates() {
    return new Map(this.state.keys);
  }

  // --- Connection State Management ---

  /**
   * Update connection state
   */
  updateConnectionState(service, connectionData) {
    const currentState = this.state.connections.get(service) || {};
    const newState = {
      ...currentState,
      ...connectionData,
      lastUpdate: Date.now()
    };

    this.state.connections.set(service, newState);
    this.markDirty();
    
    logger.debug(`Updated connection state for ${service}`);
    return newState;
  }

  /**
   * Get connection state
   */
  getConnectionState(service) {
    return this.state.connections.get(service) || null;
  }

  /**
   * Get all connection states
   */
  getAllConnectionStates() {
    return new Map(this.state.connections);
  }

  // --- Preference Management ---

  /**
   * Set preference
   */
  setPreference(key, value) {
    this.state.preferences.set(key, value);
    this.markDirty();
    logger.debug(`Set preference: ${key} = ${value}`);
  }

  /**
   * Get preference
   */
  getPreference(key, defaultValue = null) {
    return this.state.preferences.get(key) || defaultValue;
  }

  /**
   * Remove preference
   */
  removePreference(key) {
    const removed = this.state.preferences.delete(key);
    if (removed) {
      this.markDirty();
      logger.debug(`Removed preference: ${key}`);
    }
    return removed;
  }

  /**
   * Get all preferences
   */
  getAllPreferences() {
    return new Map(this.state.preferences);
  }

  // --- Cache Management ---

  /**
   * Set cache entry
   */
  setCache(key, data, ttl = null) {
    const timestamp = Date.now();
    const expiry = ttl ? timestamp + ttl : null;
    
    this.state.cache.set(key, {
      data,
      timestamp,
      expiry
    });
    
    this.markDirty();
    logger.debug(`Cached data for key: ${key}`);
  }

  /**
   * Get cache entry
   */
  getCache(key) {
    const entry = this.state.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check expiry
    if (entry.expiry && Date.now() > entry.expiry) {
      this.state.cache.delete(key);
      this.markDirty();
      logger.debug(`Cache entry expired: ${key}`);
      return null;
    }

    return entry.data;
  }

  /**
   * Remove cache entry
   */
  removeCache(key) {
    const removed = this.state.cache.delete(key);
    if (removed) {
      this.markDirty();
      logger.debug(`Removed cache entry: ${key}`);
    }
    return removed;
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache() {
    const now = Date.now();
    let removed = 0;

    this.state.cache.forEach((entry, key) => {
      if (entry.expiry && now > entry.expiry) {
        this.state.cache.delete(key);
        removed++;
      }
    });

    if (removed > 0) {
      this.markDirty();
      logger.debug(`Cleared ${removed} expired cache entries`);
    }

    return removed;
  }

  /**
   * Clear all cache
   */
  clearAllCache() {
    const size = this.state.cache.size;
    this.state.cache.clear();
    
    if (size > 0) {
      this.markDirty();
      logger.debug(`Cleared all cache (${size} entries)`);
    }
    
    return size;
  }

  // --- Data Aggregation ---

  /**
   * Get summary of current state
   */
  getStateSummary() {
    return {
      keys: {
        total: this.state.keys.size,
        active: Array.from(this.state.keys.values()).filter(k => k.active).length
      },
      connections: {
        total: this.state.connections.size,
        connected: Array.from(this.state.connections.values()).filter(c => c.connected).length
      },
      preferences: {
        total: this.state.preferences.size
      },
      cache: {
        total: this.state.cache.size,
        expired: Array.from(this.state.cache.values()).filter(e => 
          e.expiry && Date.now() > e.expiry
        ).length
      },
      metadata: this.state.metadata
    };
  }

  /**
   * Get status information
   */
  getStatus() {
    const summary = this.getStateSummary();
    
    return {
      initialized: this.isInitialized,
      dirty: this.isDirty,
      autoSaveActive: !!this.autoSaveTimer,
      persistenceFile: this.options.persistenceFile,
      ...summary
    };
  }

  // --- Maintenance ---

  /**
   * Clean up old data
   */
  async cleanup() {
    logger.info('Performing state cleanup...');
    
    let cleaned = 0;
    
    // Clear expired cache
    cleaned += this.clearExpiredCache();
    
    // Remove old key states (older than 24 hours with no activity)
    const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
    this.state.keys.forEach((keyState, keyUid) => {
      if (keyState.lastUpdate && keyState.lastUpdate < dayAgo && !keyState.active) {
        this.state.keys.delete(keyUid);
        cleaned++;
      }
    });
    
    // Remove old connection states
    this.state.connections.forEach((connState, service) => {
      if (connState.lastUpdate && connState.lastUpdate < dayAgo && !connState.connected) {
        this.state.connections.delete(service);
        cleaned++;
      }
    });
    
    if (cleaned > 0) {
      this.markDirty();
      logger.info(`Cleaned up ${cleaned} old state entries`);
    }
    
    return cleaned;
  }

  /**
   * Reset all state (for debugging/testing)
   */
  async reset() {
    logger.warn('Resetting all state...');
    
    this.state.keys.clear();
    this.state.connections.clear();
    this.state.preferences.clear();
    this.state.cache.clear();
    this.state.metadata = {
      lastSave: null,
      version: '1.0.0',
      created: Date.now()
    };
    
    this.markDirty();
    await this.saveState();
    
    logger.info('State reset complete');
  }

  /**
   * Force save state now
   */
  async forceSave() {
    this.markDirty();
    await this.saveState();
  }

  /**
   * Shutdown state manager
   */
  async shutdown() {
    logger.info('Shutting down State Manager...');
    
    // Stop auto-save
    this.stopAutoSave();
    
    // Save final state
    try {
      await this.saveState();
      logger.info('Final state saved');
    } catch (error) {
      logger.error('Failed to save final state:', error);
    }
    
    // Clear all state
    this.state.keys.clear();
    this.state.connections.clear();
    this.state.preferences.clear();
    this.state.cache.clear();
    
    this.isInitialized = false;
    this.isDirty = false;
    
    logger.info('State Manager shutdown complete');
  }
}

module.exports = StateManager; 