const logger = require('./utils/logger');
const LoLDataService = require('./services/LoLDataService');
const KeyService = require('./services/KeyService');
const KeyHandlers = require('./handlers/KeyHandlers');
const { setLoLDataService } = require('./lol'); // Import legacy client compatibility

/**
 * Plugin Core - Main plugin coordinator
 * 
 * Coordinates all services and handles the overall plugin lifecycle.
 * Implements the separation of concerns architecture where:
 * - LoL Data Service handles all League client communication
 * - Key Service manages all key rendering and state
 * - Key Handlers process data updates and decide what to render
 */
class PluginCore {
  constructor() {
    this.isInitialized = false;
    this.isShuttingDown = false;
    
    // Services
    this.lolDataService = null;
    this.keyService = null;
    this.keyHandlers = null;
    
    // Plugin instance (set by integration layer)
    this.plugin = null;
    
    // Current state
    this.currentConnectionState = 'disconnected';
    this.registeredKeys = new Map(); // serialNumber -> keys[]
    
    // Bind methods to preserve context
    this.handleDataUpdate = this.handleDataUpdate.bind(this);
    this.handleConnectionChange = this.handleConnectionChange.bind(this);
    this.handleGameStateChange = this.handleGameStateChange.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handlePluginData = this.handlePluginData.bind(this);
    this.handleDeviceStatus = this.handleDeviceStatus.bind(this);
  }

  /**
   * Set the plugin instance (called from plugin integration layer)
   */
  setPlugin(pluginInstance) {
    this.plugin = pluginInstance;
    logger.debug('Plugin instance set in PluginCore');
    
    // Also pass to KeyService if it's already initialized
    if (this.keyService) {
      this.keyService.setPlugin(this.plugin);
    }
  }

  /**
   * Initialize the plugin core and all services
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('PluginCore already initialized');
      return;
    }

    logger.info('Initializing Plugin Core...');
    
    try {
      // Check environment
      const isDebugMode = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
      logger.info(`Plugin starting in ${isDebugMode ? 'DEBUG' : 'PRODUCTION'} mode`);
      
      // Initialize services first (but don't connect yet)
      await this.initializeServicesPreConnection();
      
      // Setup event listeners BEFORE connecting to services
      this.setupEventListeners();
      
      // Now complete service initialization (which may emit events)
      await this.completeServiceInitialization();
      
      // Setup plugin event handlers
      this.setupPluginEventHandlers();
      
      this.isInitialized = true;
      logger.info('Plugin Core initialized successfully');
      
    } catch (error) {
      logger.error('Failed to initialize Plugin Core:', error);
      throw error;
    }
  }

  /**
   * Initialize services without connecting (to set up event emitters)
   */
  async initializeServicesPreConnection() {
    logger.info('Pre-initializing services...');
    
    // Create services but don't initialize yet
    this.lolDataService = new LoLDataService();
    this.keyService = new KeyService();
    this.keyHandlers = new KeyHandlers(this.keyService);
    
    // Set plugin instance if available
    if (this.plugin) {
      this.keyService.setPlugin(this.plugin);
    }
    
    logger.info('Services pre-initialized');
  }

  /**
   * Complete service initialization (may emit events)
   */
  async completeServiceInitialization() {
    logger.info('Completing service initialization...');
    
    // Now initialize services (this may emit connectionChanged events)
    await this.lolDataService.initialize();
    await this.keyService.initialize();
    
    // Set up legacy client compatibility for existing key implementations
    setLoLDataService(this.lolDataService);
    logger.debug('Legacy client compatibility layer configured');
    
    logger.info('All services initialized');
  }

  /**
   * Setup event listeners between services
   */
  setupEventListeners() {
    logger.info('Setting up event listeners...');
    
    // LoL Data Service events
    this.lolDataService.on('connectionChanged', this.handleConnectionChange);
    this.lolDataService.on('dataUpdated', this.handleDataUpdate);
    this.lolDataService.on('gameStateChanged', this.handleGameStateChange);
    this.lolDataService.on('error', this.handleError);
    
    // Key Service events
    this.keyService.on('keyRendered', (event) => {
      logger.debug(`Key rendered: ${event.serialNumber}-${event.keyUid}`);
    });
    
    this.keyService.on('keyRenderError', (event) => {
      logger.warn(`Key render error: ${event.serialNumber}-${event.keyUid}:`, event.error.message);
    });
    
    this.keyService.on('deviceConnected', (event) => {
      logger.info(`Device connected: ${event.serialNumber}`);
      this.handleDeviceConnection(event.serialNumber);
    });
    
    this.keyService.on('deviceDisconnected', (event) => {
      logger.info(`Device disconnected: ${event.serialNumber}`);
      this.registeredKeys.delete(event.serialNumber);
      
      // Clean up key tracking in KeyHandlers
      if (this.keyHandlers) {
        this.keyHandlers.cleanupKeysForDevice(event.serialNumber);
      }
    });
    
    logger.info('Event listeners setup complete');
  }

  /**
   * Setup FlexDesigner plugin event handlers
   */
  setupPluginEventHandlers() {
    logger.info('Setting up plugin event handlers...');
    
    // Note: FlexDesigner event handlers are now set up in plugin.js
    // This method kept for potential internal event setup
    
    logger.info('Plugin event handlers setup complete');
  }

  /**
   * Handle data updates from LoL Data Service
   */
  async handleDataUpdate(event) {
    const { type, data, timestamp, previousData } = event;
    
    logger.debug(`Data update received: ${type}`);
    
    try {
      // Let key handlers process the data update
      await this.keyHandlers.handleDataUpdate(type, data, previousData, timestamp);
      
    } catch (error) {
      logger.error(`Failed to handle data update for ${type}:`, error);
    }
  }

  /**
   * Handle connection state changes from LoL Data Service
   */
  async handleConnectionChange(event) {
    const { connected, reason, timestamp } = event;
    const newState = connected ? 'connected' : 'disconnected';
    
    logger.debug(`PluginCore received connection change event: connected=${connected}, reason=${reason}`);
    logger.debug(`Current state: ${this.currentConnectionState}, New state: ${newState}`);
    
    // Only act if state actually changed
    if (this.currentConnectionState !== newState) {
      logger.info(`Connection state changed: ${this.currentConnectionState} -> ${newState} (${reason})`);
      this.currentConnectionState = newState;
      
      if (connected) {
        logger.info('League connected - re-initializing all keys with proper content');
        await this.reinitializeAllKeys();
      } else {
        logger.debug(`Updating all keys to reflect connection state: ${newState}`);
        try {
          await this.keyService.renderConnectionState(newState);
          logger.debug(`Successfully updated all keys with connection state: ${newState}`);
        } catch (error) {
          logger.error(`Failed to update keys with connection state: ${error.message}`);
        }
      }
    } else {
      logger.debug(`Connection state unchanged: ${newState}`);
    }
  }

  /**
   * Handle game state changes
   */
  async handleGameStateChange(event) {
    const { phase, previous, timestamp } = event;
    
    logger.info(`Game state changed: ${previous || 'unknown'} -> ${phase}`);
    
    try {
      // Let key handlers process the game state change
      await this.keyHandlers.handleGameStateChange(phase, previous, timestamp);
      
    } catch (error) {
      logger.error('Failed to handle game state change:', error);
    }
  }

  /**
   * Handle errors from services
   */
  handleError(event) {
    const { message, code, recoverable, endpoint } = event;
    
    if (recoverable) {
      logger.warn(`Recoverable error (${code}): ${message}`);
    } else {
      logger.error(`Non-recoverable error (${code}): ${message}`);
    }
    
    // Could implement error recovery strategies here
  }

  /**
   * Handle device status updates from FlexDesigner
   */
  handleDeviceStatus(devices) {
    logger.debug('Device status update received');
    
    try {
      // Forward to key service
      this.keyService.handleDeviceStatus(devices);
      
    } catch (error) {
      logger.error('Failed to handle device status:', error);
    }
  }

  /**
   * Handle plugin data event (called from plugin.js)
   */
  async handlePluginData(payload) {
    logger.debug('Plugin data event received in PluginCore');
    
    try {
      const { serialNumber, data } = payload;
      
      if (!serialNumber || !data || !data.key) {
        logger.warn('Invalid plugin data payload');
        return { status: "error", message: "Invalid payload" };
      }
      
      const key = data.key;
      
      logger.debug(`Handling interaction for key ${key.cid} (UID: ${key.uid}) on device ${serialNumber}`);
      
      // Handle key interaction using KeyHandlers
      await this.keyHandlers.handleKeyInteraction(serialNumber, key);
      
      return { status: "handled", message: `Handled interaction for key ${key.cid}` };
      
    } catch (error) {
      logger.error('Failed to handle plugin data:', error);
      return { status: "error", message: error.message };
    }
  }

  /**
   * Handle device connection
   */
  async handleDeviceConnection(serialNumber) {
    try {
      // Re-register keys if we have them cached
      const cachedKeys = this.registeredKeys.get(serialNumber);
      if (cachedKeys) {
        this.keyService.registerKeys(serialNumber, cachedKeys);
        await this.keyService.renderConnectionState(this.currentConnectionState);
        logger.info(`Re-registered ${cachedKeys.length} keys for reconnected device ${serialNumber}`);
      }
      
    } catch (error) {
      logger.error(`Failed to handle device connection for ${serialNumber}:`, error);
    }
  }

  /**
   * Get overall plugin status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      shuttingDown: this.isShuttingDown,
      connectionState: this.currentConnectionState,
      registeredDevices: Array.from(this.registeredKeys.keys()),
      services: {
        lolDataService: this.lolDataService?.getConnectionStatus() || null,
        keyService: this.keyService?.getStatus() || null
      }
    };
  }

  /**
   * Force refresh all keys
   */
  async forceRefresh() {
    logger.info('Force refreshing all keys...');
    
    try {
      // Force render all keys
      const result = await this.keyService.forceRenderAll();
      logger.info(`Force refresh complete: ${result.successful}/${result.total} keys updated`);
      return result;
      
    } catch (error) {
      logger.error('Failed to force refresh:', error);
      throw error;
    }
  }

  /**
   * Force reconnect to League client
   */
  async forceReconnect() {
    logger.info('Force reconnecting to League client...');
    
    try {
      await this.lolDataService.forceReconnect();
      logger.info('Force reconnect initiated');
      
    } catch (error) {
      logger.error('Failed to force reconnect:', error);
      throw error;
    }
  }

  /**
   * Shutdown the plugin core and all services
   */
  async shutdown() {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Shutting down Plugin Core...');
    
    try {
      // Remove plugin event listeners
      plugin.removeAllListeners();
      
      // Shutdown services in reverse order
      if (this.keyHandlers) {
        // Key handlers don't need explicit shutdown
        this.keyHandlers = null;
      }
      
      if (this.keyService) {
        await this.keyService.shutdown();
        this.keyService = null;
      }
      
      if (this.lolDataService) {
        await this.lolDataService.shutdown();
        this.lolDataService = null;
      }
      
      // Clear state
      this.registeredKeys.clear();
      this.currentConnectionState = 'disconnected';
      this.isInitialized = false;
      this.isShuttingDown = false;
      
      logger.info('Plugin Core shutdown complete');
      
    } catch (error) {
      logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Handle plugin alive event (called from plugin.js)
   */
  async handlePluginAlive(payload) {
    logger.debug('Plugin alive event received in PluginCore');
    
    try {
      const { serialNumber, data } = payload;
      
      if (!serialNumber || !Array.isArray(data)) {
        logger.warn('Invalid plugin alive payload');
        return;
      }
      
      logger.info(`Registering ${data.length} keys for device ${serialNumber}`);
      logger.info(`Current connection state: ${this.currentConnectionState}`);
      
      // Store key configurations
      this.registeredKeys.set(serialNumber, data);
      
      // Register keys with key service
      this.keyService.registerKeys(serialNumber, data);
      
      // Initialize each key based on its type (CID) using existing key implementations
      const isLeagueConnected = this.currentConnectionState === 'connected';
      
      for (const key of data) {
        
        if (key.cid && key.uid !== undefined && key.uid !== null) {
          logger.info(`Initializing key ${key.cid} (UID: ${key.uid}) for device ${serialNumber}`);
          await this.keyHandlers.initializeKey(serialNumber, key, isLeagueConnected);
        } else {
          logger.warn(`Skipping key with missing CID or UID:`, JSON.stringify(key, null, 2));
        }
      }
      
      logger.info(`Successfully initialized ${data.length} keys for device ${serialNumber}`);
      
    } catch (error) {
      logger.error('Failed to handle plugin alive:', error);
    }
  }

  /**
   * Re-initialize all registered keys with their proper content
   * Called when League reconnects to restore canvas-drawn content
   */
  async reinitializeAllKeys() {
    logger.info('Re-initializing all registered keys...');
    
    let totalKeys = 0;
    let successfulKeys = 0;
    
    for (const [serialNumber, keys] of this.registeredKeys) {
      logger.debug(`Re-initializing ${keys.length} keys for device ${serialNumber}`);
      
      for (const key of keys) {
        totalKeys++;
        
        try {
          if (key.cid && key.uid !== undefined && key.uid !== null) {
            logger.debug(`Re-initializing key ${key.cid} (UID: ${key.uid}) for device ${serialNumber}`);
            await this.keyHandlers.initializeKey(serialNumber, key, true); // true = League is connected
            successfulKeys++;
          } else {
            logger.warn(`Skipping key re-initialization - missing CID or UID:`, JSON.stringify(key, null, 2));
          }
        } catch (error) {
          logger.error(`Failed to re-initialize key ${key.cid} (UID: ${key.uid}):`, error);
        }
      }
    }
    
    logger.info(`Key re-initialization complete: ${successfulKeys}/${totalKeys} keys successfully re-initialized`);
  }

  /**
   * Update all keys with a given connection state
   */
  async updateAllKeysWithConnectionState(state) {
    // Implementation of this method is not provided in the original file or the code block
    // This method should be implemented to update all keys with the given connection state
    logger.error('Method updateAllKeysWithConnectionState not implemented');
  }
}

module.exports = PluginCore; 