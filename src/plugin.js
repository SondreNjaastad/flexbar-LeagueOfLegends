const { plugin, logger, pluginPath, resourcesPath } = require("@eniac/flexdesigner");
const PluginCore = require('./PluginCore');

/**
 * FlexDesigner Plugin Integration
 * 
 * This file serves as the bridge between FlexDesigner and our PluginCore.
 * It handles FlexDesigner-specific events and delegates to PluginCore for business logic.
 */

let pluginCore = null;
let isShuttingDown = false;

/**
 * Initialize the plugin core
 */
async function initializePluginCore() {
  try {
    logger.info('=== League of Legends FlexDesigner Plugin Starting ===');
    
    // Create and initialize plugin core
    pluginCore = new PluginCore();
    
    // Pass the plugin instance to PluginCore
    pluginCore.setPlugin(plugin);
    
    await pluginCore.initialize();
    
    logger.info('=== Plugin Core initialized successfully ===');
    
  } catch (error) {
    logger.error('Failed to initialize Plugin Core:', error);
    throw error;
  }
}

/**
 * Handle device status updates from FlexDesigner
 * Called when devices connect/disconnect
 */
function handleDeviceStatus(devices) {
  logger.debug('Device status update received from FlexDesigner');
  
  if (!pluginCore) {
    logger.warn('Plugin core not initialized, ignoring device status');
    return;
  }
  
  try {
    pluginCore.handleDeviceStatus(devices);
  } catch (error) {
    logger.error('Failed to handle device status:', error);
  }
}

/**
 * Handle plugin alive event from FlexDesigner
 * Called when keys are configured for a device
 */
async function handlePluginAlive(payload) {
  logger.debug('Plugin alive event received from FlexDesigner');
  
  if (!pluginCore) {
    logger.warn('Plugin core not initialized, ignoring plugin alive');
    return;
  }
  
  try {
    const { keys = [], serialNumber } = payload;
    
    if (!serialNumber) {
      logger.warn('Plugin alive event missing serialNumber');
      return;
    }
    
    logger.info(`Device ${serialNumber} alive with ${keys.length} keys`);
    
    // Let PluginCore handle the key registration
    await pluginCore.handlePluginAlive({
      serialNumber,
      data: keys // PluginCore expects 'data' property
    });
    
  } catch (error) {
    logger.error('Failed to handle plugin alive:', error);
  }
}

/**
 * Handle plugin data event from FlexDesigner
 * Called when user interacts with keys
 */
async function handlePluginData(payload) {
  logger.debug('Plugin data event received from FlexDesigner');
  
  if (!pluginCore) {
    logger.warn('Plugin core not initialized, ignoring plugin data');
    return { status: "error", message: "Plugin not initialized" };
  }
  
  try {
    // Delegate to PluginCore
    const result = await pluginCore.handlePluginData(payload);
    return result || { status: "handled", message: "Processed by PluginCore" };
    
  } catch (error) {
    logger.error('Failed to handle plugin data:', error);
    return { status: "error", message: error.message };
  }
}

/**
 * Graceful shutdown handler
 */
async function shutdown() {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }
  
  isShuttingDown = true;
  logger.info('Shutting down FlexDesigner plugin...');
  
  try {
    if (pluginCore) {
      await pluginCore.shutdown();
      pluginCore = null;
    }
    
    logger.info('Plugin shutdown complete');
    
  } catch (error) {
    logger.error('Error during plugin shutdown:', error);
  }
}

// Register FlexDesigner event handlers
plugin.on('device.status', handleDeviceStatus);
plugin.on('plugin.alive', handlePluginAlive);
plugin.on('plugin.data', handlePluginData);

// Handle process shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('beforeExit', shutdown);

// Initialize and start the plugin
initializePluginCore()
  .then(() => {
    // Start the FlexDesigner plugin (this is critical!)
    plugin.start();
    logger.info('FlexDesigner plugin started successfully');
  })
  .catch((error) => {
    logger.error('Failed to start plugin:', error);
    process.exit(1);
  });

// Export for potential external use
module.exports = {
  pluginCore,
  shutdown
}; 