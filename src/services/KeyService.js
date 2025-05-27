const EventEmitter = require('events');
const logger = require('../utils/logger');
const StateManager = require('./StateManager');

/**
 * Key Service - Manages all key rendering and state
 * 
 * Events:
 * - 'keyRendered': { serialNumber: string, keyUid: string, success: boolean }
 * - 'keyError': { serialNumber: string, keyUid: string, error: Error }
 * - 'deviceConnected': { serialNumber: string }
 * - 'deviceDisconnected': { serialNumber: string }
 */
class KeyService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      throttleInterval: 100, // Minimum ms between renders for same key
      maxRetries: 3,
      retryDelay: 1000,
      cleanupDelay: 5000,
      ...options
    };

    // State management
    this.stateManager = new StateManager();
    
    // Key tracking
    this.activeKeys = new Map(); // serialNumber-keyUid -> keyData
    this.renderQueue = new Map(); // serialNumber-keyUid -> renderTask
    this.lastRenderTime = new Map(); // serialNumber-keyUid -> timestamp
    this.errorCounts = new Map(); // serialNumber-keyUid -> count
    
    // Device tracking
    this.connectedDevices = new Set();
    
    // Cleanup intervals
    this.cleanupInterval = null;
    
    // Plugin instance will be set by the integration layer
    this.plugin = null;
    
    this.startCleanupInterval();
  }

  /**
   * Set the plugin instance (called from plugin integration layer)
   */
  setPlugin(pluginInstance) {
    this.plugin = pluginInstance;
    logger.debug('Plugin instance set in KeyService');
  }

  /**
   * Initialize the key service
   */
  async initialize() {
    logger.info('Initializing Key Service...');
    await this.stateManager.initialize();
    logger.info('Key Service initialized');
  }

  /**
   * Handle device status updates
   */
  handleDeviceStatus(devices) {
    logger.debug(`Handling device status update with ${Array.isArray(devices) ? devices.length : 'non-array'} devices`);
    
    const currentDevices = new Set();
    
    if (Array.isArray(devices)) {
      devices.forEach(device => {
        // FlexDesigner sends device objects with serialNumber
        // Devices in the array are considered connected
        let serialNumber = device.serialNumber;
        
        if (serialNumber) {
          // Ensure serialNumber is a string
          serialNumber = String(serialNumber);
          currentDevices.add(serialNumber);
          
          // Emit connected event for new devices
          if (!this.connectedDevices.has(serialNumber)) {
            this.emit('deviceConnected', { serialNumber });
            logger.info(`Device connected: ${serialNumber}`);
          }
        } else {
          logger.warn('Device in status update missing serialNumber:', device);
        }
      });
    } else {
      logger.warn('Device status update is not an array:', typeof devices);
    }
    
    // Check for disconnected devices
    this.connectedDevices.forEach(serialNumber => {
      if (!currentDevices.has(serialNumber)) {
        this.handleDeviceDisconnection(serialNumber);
      }
    });
    
    // Update connected devices set
    this.connectedDevices = currentDevices;
    
    logger.debug(`Connected devices: [${Array.from(currentDevices).join(', ')}]`);
  }

  /**
   * Handle device disconnection
   */
  handleDeviceDisconnection(serialNumber) {
    logger.info(`Device disconnected: ${serialNumber}`);
    
    // Remove all keys for this device
    const keysToRemove = [];
    this.activeKeys.forEach((keyData, keyId) => {
      if (keyId.startsWith(`${serialNumber}-`)) {
        keysToRemove.push(keyId);
      }
    });
    
    keysToRemove.forEach(keyId => {
      this.removeKey(keyId);
    });
    
    this.emit('deviceDisconnected', { serialNumber });
  }

  /**
   * Register keys for rendering
   */
  registerKeys(serialNumber, keys) {
    // Ensure serialNumber is a string
    serialNumber = String(serialNumber);
    
    logger.debug(`Attempting to register ${keys.length} keys for device ${serialNumber}`);
    logger.debug(`Device connected status: ${this.isDeviceConnected(serialNumber)}`);
    logger.debug(`Connected devices: [${Array.from(this.connectedDevices).join(', ')}]`);
    
    // If device is trying to register keys, it must be connected
    // This handles race conditions where plugin.alive comes before device.status
    if (!this.isDeviceConnected(serialNumber)) {
      logger.info(`Device ${serialNumber} not marked as connected, but registering keys - marking as connected`);
      this.connectedDevices.add(serialNumber);
      this.emit('deviceConnected', { serialNumber });
    }

    keys.forEach(key => {
      const keyId = `${serialNumber}-${key.uid}`;
      
      // Store key configuration
      this.activeKeys.set(keyId, {
        serialNumber,
        keyUid: key.uid,
        config: { ...key },
        state: 'inactive',
        lastUpdate: null,
        retryCount: 0
      });
      
      logger.debug(`Registered key: ${keyId}`);
    });
    
    logger.info(`Successfully registered ${keys.length} keys for device ${serialNumber}`);
  }

  /**
   * Update key with new data and render
   */
  async updateKey(serialNumber, keyUid, data, renderOptions = {}) {
    const keyId = `${serialNumber}-${keyUid}`;
    
    if (!this.isDeviceConnected(serialNumber)) {
      logger.debug(`Skipping update for disconnected device: ${serialNumber}`);
      return false;
    }

    const keyData = this.activeKeys.get(keyId);
    if (!keyData) {
      logger.warn(`Key not registered: ${keyId}`);
      return false;
    }

    // Check throttling
    if (this.isThrottled(keyId)) {
      logger.debug(`Throttling render for key: ${keyId}`);
      return false;
    }

    try {
      // Update state
      this.stateManager.updateKeyState(keyUid, data);
      
      // Prepare render data
      const renderData = this.prepareRenderData(keyData, data, renderOptions);
      
      // Queue render
      await this.queueRender(keyId, renderData);
      
      // Update key data
      keyData.state = 'active';
      keyData.lastUpdate = Date.now();
      keyData.retryCount = 0;
      
      // Reset error count on success
      this.errorCounts.delete(keyId);
      
      return true;
      
    } catch (error) {
      logger.error(`Failed to update key ${keyId}:`, error);
      await this.handleKeyError(keyId, error);
      return false;
    }
  }

  /**
   * Render connection state on all active keys
   */
  async renderConnectionState(connectionState) {
    const stateMessage = {
      'connected': 'League Connected',
      'disconnected': 'League Offline',
      'reconnecting': 'Reconnecting...'
    }[connectionState] || 'Status Unknown';
    
    logger.info(`KeyService rendering connection state: ${connectionState} for ${this.activeKeys.size} keys`);
    
    if (this.activeKeys.size === 0) {
      logger.warn('No active keys found to update with connection state');
      return;
    }

    // For offline state, use beautiful canvas rendering
    if (connectionState === 'disconnected') {
      await this.renderOfflineStateForAllKeys();
      return;
    }

    // For other states, use the existing text-based rendering
    for (const [keyId, keyData] of this.activeKeys) {
      const [serialNumber, keyUid] = keyId.split('-');
      
      if (keyData.state === 'active') {
        const stateOptions = this.getConnectionStateRenderOptions(connectionState);
        const renderData = this.prepareRenderData(keyData, null, stateOptions);
        
        await this.queueRender(keyId, renderData);
      }
    }
  }

  /**
   * Render beautiful offline state for all active keys
   */
  async renderOfflineStateForAllKeys() {
    const canvasUtils = require('../keys/canvasUtils');
    
    for (const [keyId, keyData] of this.activeKeys) {
      const [serialNumber, keyUid] = keyId.split('-');
      
      if (keyData.state === 'active') {
        try {
          // Determine key type from configuration
          let keyType = 'generic';
          const config = keyData.config;
          if (config && config.cid) {
            if (config.cid.includes('summoner')) keyType = 'summoner';
            else if (config.cid.includes('wallet')) keyType = 'wallet';
            else if (config.cid.includes('rank')) keyType = 'rank';
            else if (config.cid.includes('gamestats')) keyType = 'gamestats';
            else if (config.cid.includes('teamkills')) keyType = 'teamkills';
            else if (config.cid.includes('kda')) keyType = 'kda';
            else if (config.cid.includes('wardscore')) keyType = 'wardscore';
          }
          
          // Create beautiful offline canvas
          const canvas = await canvasUtils.createOfflineStateCanvas({
            width: config?.width || 360,
            height: 60,
            keyType: keyType
          });
          
          // Convert to data URL
          const offlineImageData = await canvasUtils.canvasToDataURL(canvas);
          
          if (offlineImageData) {
            // Use canvas-based rendering
            const renderData = this.prepareRenderData(keyData, { imageData: offlineImageData }, {
              showImage: true,
              showTitle: false
            });
            
            await this.queueRender(keyId, renderData);
          } else {
            // Fallback to text if canvas fails
            const stateOptions = this.getConnectionStateRenderOptions('disconnected');
            const renderData = this.prepareRenderData(keyData, null, stateOptions);
            await this.queueRender(keyId, renderData);
          }
          
        } catch (error) {
          logger.error(`Failed to create offline canvas for key ${keyId}:`, error);
          
          // Fallback to text rendering
          const stateOptions = this.getConnectionStateRenderOptions('disconnected');
          const renderData = this.prepareRenderData(keyData, null, stateOptions);
          await this.queueRender(keyId, renderData);
        }
      }
    }
  }

  /**
   * Get render options for connection states
   */
  getConnectionStateRenderOptions(connectionState) {
    switch (connectionState) {
      case 'disconnected':
        return {
          title: 'League Offline',
          backgroundColor: '#8B0000',
          showImage: false,
          showTitle: true
        };
      case 'reconnecting':
        return {
          title: 'Reconnecting...',
          backgroundColor: '#FF8C00',
          showImage: false,
          showTitle: true
        };
      case 'connected':
        return {
          title: 'League Connected',
          backgroundColor: '#006400',
          showImage: false,
          showTitle: true
        };
      default:
        return {
          title: 'Status Unknown',
          backgroundColor: '#696969',
          showImage: false,
          showTitle: true
        };
    }
  }

  /**
   * Queue a render operation
   */
  async queueRender(keyId, renderData) {
    // Cancel existing render for this key
    if (this.renderQueue.has(keyId)) {
      clearTimeout(this.renderQueue.get(keyId).timeout);
    }

    // Create render task
    const renderTask = {
      keyId,
      renderData,
      timestamp: Date.now(),
      timeout: null,
      promise: null
    };

    // Execute render immediately or after throttle delay
    const delay = this.getThrottleDelay(keyId);
    
    if (delay > 0) {
      renderTask.timeout = setTimeout(() => {
        this.executeRender(renderTask);
      }, delay);
    } else {
      await this.executeRender(renderTask);
    }

    this.renderQueue.set(keyId, renderTask);
  }

  /**
   * Execute the actual render operation
   */
  async executeRender(renderTask) {
    const { keyId, renderData } = renderTask;
    const [serialNumber, keyUid] = keyId.split('-');

    try {
      // Update render timestamp
      this.lastRenderTime.set(keyId, Date.now());
      
      // Execute render - we'll need the plugin instance for this
      if (!this.plugin) {
        throw new Error('Plugin instance not available for rendering');
      }
      
      // Check if we have base64 image data to render
      if (renderData.image && renderData.image.startsWith('data:image/png;base64,')) {
        // Extract the base64 data (remove the data:image/png;base64, prefix)
        const base64Data = renderData.image;
        
        // Create a clean render object without the image property for the draw call
        const cleanRenderData = { ...renderData };
        delete cleanRenderData.image;
        
        // Call plugin.draw with the 4-parameter format for base64 images
        await this.plugin.draw(serialNumber, cleanRenderData, 'base64', base64Data);
      } else {
        // Call plugin.draw with the standard 2-parameter format for text/icon rendering
        await this.plugin.draw(serialNumber, renderData);
      }
      
      logger.debug(`Successfully rendered key: ${keyId}`);
      
      this.emit('keyRendered', {
        serialNumber,
        keyUid,
        success: true,
        timestamp: Date.now()
      });
      
    } catch (error) {
      logger.error(`Render failed for key ${keyId}:`, error);
      
      this.emit('keyError', {
        serialNumber,
        keyUid,
        error,
        timestamp: Date.now()
      });
      
      throw error;
    } finally {
      // Remove from queue
      this.renderQueue.delete(keyId);
    }
  }

  /**
   * Prepare render data from key configuration and update data
   */
  prepareRenderData(keyData, data, renderOptions = {}) {
    const config = keyData.config;
    
    // Start with base configuration
    const renderData = {
      uid: config.uid,
      title: config.title || 'League of Legends',
      width: config.width || 72,
      style: {
        showTitle: true,
        showImage: false,
        showIcon: false,
        showEmoji: false,
        backgroundColor: '#1E3A8A',
        ...config.style
      }
    };

    // Apply data-specific updates
    if (data) {
      this.applyDataToRenderData(renderData, data, config);
    }

    // Apply render options (override everything else)
    if (renderOptions.title !== undefined) renderData.title = renderOptions.title;
    if (renderOptions.backgroundColor !== undefined) renderData.style.backgroundColor = renderOptions.backgroundColor;
    if (renderOptions.showImage !== undefined) renderData.style.showImage = renderOptions.showImage;
    if (renderOptions.showTitle !== undefined) renderData.style.showTitle = renderOptions.showTitle;

    return renderData;
  }

  /**
   * Apply data updates to render data based on key type
   */
  applyDataToRenderData(renderData, data, config) {
    // Handle image data from canvas-based keys
    if (data.imageData) {
      renderData.image = data.imageData;
      renderData.style.showImage = true;
      renderData.style.showTitle = false; // Usually hide title when showing canvas images
    }
    
    // Handle connection state
    if (data.connectionState) {
      const stateOptions = this.getConnectionStateRenderOptions(data.connectionState);
      Object.assign(renderData, stateOptions);
      Object.assign(renderData.style, stateOptions);
    }
  }

  /**
   * Handle key rendering errors
   */
  async handleKeyError(keyId, error) {
    const errorCount = (this.errorCounts.get(keyId) || 0) + 1;
    this.errorCounts.set(keyId, errorCount);
    
    const keyData = this.activeKeys.get(keyId);
    if (!keyData) return;

    // Check if error indicates key is no longer alive
    if (error.message.includes('not alive') || error.message.includes('not connected')) {
      logger.warn(`Key ${keyId} no longer alive, marking for cleanup`);
      keyData.state = 'dead';
      return;
    }

    // Retry logic
    if (errorCount <= this.options.maxRetries) {
      logger.info(`Retrying render for key ${keyId} (attempt ${errorCount}/${this.options.maxRetries})`);
      
      setTimeout(async () => {
        try {
          const cachedState = this.stateManager.getKeyState(keyData.keyUid);
          if (cachedState) {
            await this.updateKey(keyData.serialNumber, keyData.keyUid, cachedState);
          }
        } catch (retryError) {
          logger.error(`Retry failed for key ${keyId}:`, retryError);
        }
      }, this.options.retryDelay * errorCount);
      
    } else {
      logger.error(`Max retries exceeded for key ${keyId}, marking as failed`);
      keyData.state = 'failed';
    }
  }

  /**
   * Check if a key render is throttled
   */
  isThrottled(keyId) {
    const lastRender = this.lastRenderTime.get(keyId);
    if (!lastRender) return false;
    
    return (Date.now() - lastRender) < this.options.throttleInterval;
  }

  /**
   * Get throttle delay for a key
   */
  getThrottleDelay(keyId) {
    const lastRender = this.lastRenderTime.get(keyId);
    if (!lastRender) return 0;
    
    const timeSinceLastRender = Date.now() - lastRender;
    const remainingThrottle = this.options.throttleInterval - timeSinceLastRender;
    
    return Math.max(0, remainingThrottle);
  }

  /**
   * Check if device is connected
   */
  isDeviceConnected(serialNumber) {
    // Ensure serialNumber is a string for comparison
    serialNumber = String(serialNumber);
    const isConnected = this.connectedDevices.has(serialNumber);
    logger.debug(`Device ${serialNumber} connected check: ${isConnected}`);
    return isConnected;
  }

  /**
   * Remove a key
   */
  removeKey(keyId) {
    // Cancel any queued renders
    if (this.renderQueue.has(keyId)) {
      clearTimeout(this.renderQueue.get(keyId).timeout);
      this.renderQueue.delete(keyId);
    }
    
    // Remove from tracking
    this.activeKeys.delete(keyId);
    this.lastRenderTime.delete(keyId);
    this.errorCounts.delete(keyId);
    
    logger.debug(`Removed key: ${keyId}`);
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.options.cleanupDelay);
  }

  /**
   * Perform periodic cleanup
   */
  performCleanup() {
    const now = Date.now();
    const keysToRemove = [];
    
    // Clean up dead or failed keys
    this.activeKeys.forEach((keyData, keyId) => {
      if (keyData.state === 'dead' || keyData.state === 'failed') {
        keysToRemove.push(keyId);
      }
    });
    
    keysToRemove.forEach(keyId => {
      logger.debug(`Cleaning up key: ${keyId}`);
      this.removeKey(keyId);
    });
    
    // Clean up old render timestamps
    this.lastRenderTime.forEach((timestamp, keyId) => {
      if (!this.activeKeys.has(keyId) || (now - timestamp) > 300000) { // 5 minutes
        this.lastRenderTime.delete(keyId);
      }
    });
    
    // Clean up old error counts
    this.errorCounts.forEach((count, keyId) => {
      if (!this.activeKeys.has(keyId)) {
        this.errorCounts.delete(keyId);
      }
    });
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      connectedDevices: Array.from(this.connectedDevices),
      activeKeys: this.activeKeys.size,
      queuedRenders: this.renderQueue.size,
      errorCounts: Array.from(this.errorCounts.entries()),
      stateManager: this.stateManager.getStatus()
    };
  }

  /**
   * Force render all active keys
   */
  async forceRenderAll() {
    logger.info('Force rendering all active keys...');
    
    const promises = [];
    this.activeKeys.forEach((keyData, keyId) => {
      const cachedState = this.stateManager.getKeyState(keyData.keyUid);
      if (cachedState) {
        promises.push(this.updateKey(
          keyData.serialNumber, 
          keyData.keyUid, 
          cachedState
        ));
      }
    });
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    
    logger.info(`Force render complete: ${successful}/${results.length} successful`);
    return { successful, total: results.length };
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    logger.info('Shutting down Key Service...');
    
    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Cancel all queued renders
    this.renderQueue.forEach(renderTask => {
      if (renderTask.timeout) {
        clearTimeout(renderTask.timeout);
      }
    });
    
    // Clear all state
    this.activeKeys.clear();
    this.renderQueue.clear();
    this.lastRenderTime.clear();
    this.errorCounts.clear();
    this.connectedDevices.clear();
    
    // Shutdown state manager
    await this.stateManager.shutdown();
    
    // Remove all listeners
    this.removeAllListeners();
    
    logger.info('Key Service shutdown complete');
  }
}

module.exports = KeyService; 