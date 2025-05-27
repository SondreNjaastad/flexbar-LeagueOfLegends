const logger = require('../utils/logger');
const keys = require('../keys'); // Import existing key implementations

/**
 * Key Handlers - Process LoL data updates and coordinate key rendering
 * 
 * This class acts as the business logic layer between the LoL Data Service
 * and the Key Service. It decides what should be rendered based on the
 * incoming data and current state, using the existing key implementations.
 */
class KeyHandlers {
  constructor(keyService) {
    this.keyService = keyService;
    
    // Handler registry - maps data types to handler functions
    this.handlers = new Map([
      ['summoner', this.handleSummonerData.bind(this)],
      ['gameflow', this.handleGameflowData.bind(this)],
      ['champselect', this.handleChampSelectData.bind(this)],
      ['ranked', this.handleRankedData.bind(this)],
      ['wallet', this.handleWalletData.bind(this)],
      ['livegame', this.handleLiveGameData.bind(this)]
    ]);

    // Current game state tracking
    this.currentGamePhase = null;
    this.isInGame = false;
    
    // Persistent key tracking for live updates
    this.activeKeys = new Map(); // keyId -> true
    this.keyData = new Map(); // keyUid -> key object
    
    // Key type mapping for CID-based initialization
    this.keyInitializers = new Map([
      ['com.sondrenjaastad.leagueoflegends.wallet', keys.initializeWalletKey],
      ['com.sondrenjaastad.leagueoflegends.summoner', keys.initializeSummonerKey],
      ['com.sondrenjaastad.leagueoflegends.rank', keys.initializeRankKey],
      ['com.sondrenjaastad.leagueoflegends.gamestats', keys.initializeGameStatsKey],
      ['com.sondrenjaastad.leagueoflegends.teamkills', keys.initializeTeamKillsKey],
      ['com.sondrenjaastad.leagueoflegends.kda', keys.initializeKDAKey],
      ['com.sondrenjaastad.leagueoflegends.wardscore', keys.initializeWardScoreKey]
    ]);
  }

  /**
   * Initialize a key based on its CID when it's first registered
   */
  async initializeKey(serialNumber, key, isLeagueConnected) {
    try {
      // Register the key in our persistent tracking
      const keyId = `${serialNumber}-${key.uid}`;
      this.activeKeys.set(keyId, true);
      this.keyData.set(key.uid, key);
      
      const initializer = this.keyInitializers.get(key.cid);
      
      if (!initializer) {
        logger.warn(`No initializer found for key type: ${key.cid}`);
        return;
      }

      // Create a compatible key manager object for the old key functions
      const keyManager = this.createKeyManagerAdapter();
      
      if (isLeagueConnected) {
        logger.debug(`Initializing key ${key.cid} for device ${serialNumber}`);
        await initializer(serialNumber, keyManager, key);
      } else {
        // Show offline state for disconnected keys
        logger.debug(`Showing offline state for key ${key.cid} on device ${serialNumber}`);
        await this.showOfflineState(serialNumber, key);
      }
      
    } catch (error) {
      logger.error(`Failed to initialize key ${key.cid}:`, error);
      // Fallback to basic text display
      this.showErrorState(serialNumber, key, error.message);
    }
  }

  /**
   * Handle key interactions (when user presses a key)
   */
  async handleKeyInteraction(serialNumber, key) {
    try {
      const keyManager = this.createKeyManagerAdapter();
      
      // Special handling for rank key interactions (cycling queues)
      if (key.cid === 'com.sondrenjaastad.leagueoflegends.rank') {
        await keys.handleRankKeyInteraction(serialNumber, keyManager, key);
        return;
      }
      
      // For other keys, just re-initialize them
      const initializer = this.keyInitializers.get(key.cid);
      if (initializer) {
        await initializer(serialNumber, keyManager, key);
      }
      
    } catch (error) {
      logger.error(`Failed to handle key interaction for ${key.cid}:`, error);
    }
  }

  /**
   * Create an adapter object that mimics the old keyManager interface
   */
  createKeyManagerAdapter() {
    const self = this; // Capture reference to KeyHandlers instance
    
    return {
      // Simple text drawing method
      simpleTextDraw: (serialNumber, keyData) => {
        self.keyService.updateKey(serialNumber, keyData.uid, {}, {
          title: keyData.title,
          backgroundColor: keyData.style?.backgroundColor,
          showTitle: true,
          showImage: false
        });
      },
      
      // Complex drawing method (for images, etc.)
      simpleDraw: (serialNumber, keyData, imageData = null) => {
        const renderOptions = {
          title: keyData.title,
          showTitle: keyData.style?.showTitle !== false,
          showImage: !!imageData,
          backgroundColor: keyData.style?.backgroundColor
        };
        
        // Pass the image data to KeyService for proper rendering
        const dataWithImage = imageData ? { imageData } : {};
        
        self.keyService.updateKey(serialNumber, keyData.uid, dataWithImage, renderOptions);
      },
      
      // Active keys tracking (now connected to persistent storage)
      get activeKeys() {
        // Convert Map to object for compatibility
        const keys = {};
        for (const [keyId, value] of self.activeKeys) {
          keys[keyId] = value;
        }
        return keys;
      },
      
      get keyData() {
        // Convert Map to object for compatibility
        const keys = {};
        for (const [keyUid, keyObject] of self.keyData) {
          keys[keyUid] = keyObject;
        }
        return keys;
      },
      
      // Allow setting key data (for backward compatibility)
      set keyData(value) {
        // Handle when old code tries to set keyData[keyUid] = key
        if (typeof value === 'object') {
          Object.keys(value).forEach(keyUid => {
            self.keyData.set(keyUid, value[keyUid]);
          });
        }
      },
      
      set activeKeys(value) {
        // Handle when old code tries to set activeKeys[keyId] = true
        if (typeof value === 'object') {
          Object.keys(value).forEach(keyId => {
            self.activeKeys.set(keyId, value[keyId]);
          });
        }
      }
    };
  }

  /**
   * Show offline state for a key using beautiful canvas rendering
   */
  async showOfflineState(serialNumber, key) {
    try {
      const canvasUtils = require('../keys/canvasUtils');
      
      // Determine key type from CID for appropriate subtitle
      let keyType = 'generic';
      if (key.cid) {
        if (key.cid.includes('summoner')) keyType = 'summoner';
        else if (key.cid.includes('wallet')) keyType = 'wallet';
        else if (key.cid.includes('rank')) keyType = 'rank';
        else if (key.cid.includes('gamestats')) keyType = 'gamestats';
        else if (key.cid.includes('teamkills')) keyType = 'teamkills';
        else if (key.cid.includes('kda')) keyType = 'kda';
        else if (key.cid.includes('wardscore')) keyType = 'wardscore';
      }
      
      // Create beautiful offline canvas
      const canvas = await canvasUtils.createOfflineStateCanvas({
        width: key.width || 360,
        height: 60,
        keyType: keyType
      });
      
      // Convert to data URL
      const offlineImageData = await canvasUtils.canvasToDataURL(canvas);
      
      if (offlineImageData) {
        // Use canvas-based rendering
        this.keyService.updateKey(serialNumber, key.uid, { imageData: offlineImageData }, {
          showImage: true,
          showTitle: false
        });
      } else {
        // Fallback to text if canvas fails
        this.keyService.updateKey(serialNumber, key.uid, {}, {
          title: 'League Offline',
          backgroundColor: '#8B0000',
          showTitle: true,
          showImage: false
        });
      }
      
    } catch (error) {
      logger.error(`Failed to create offline canvas for key ${key.uid}:`, error);
      
      // Fallback to text rendering
      this.keyService.updateKey(serialNumber, key.uid, {}, {
        title: 'League Offline',
        backgroundColor: '#8B0000',
        showTitle: true,
        showImage: false
      });
    }
  }

  /**
   * Show error state for a key
   */
  showErrorState(serialNumber, key, errorMessage) {
    this.keyService.updateKey(serialNumber, key.uid, {}, {
      title: 'Error',
      backgroundColor: '#FF4500',
      showTitle: true,
      showImage: false
    });
  }

  /**
   * Handle data updates from LoL Data Service
   */
  async handleDataUpdate(type, data, previousData, timestamp) {
    logger.debug(`Processing data update: ${type}`);
    
    try {
      const handler = this.handlers.get(type);
      if (handler) {
        await handler(data, previousData, timestamp);
      } else {
        logger.warn(`No handler found for data type: ${type}`);
      }
      
    } catch (error) {
      logger.error(`Error handling ${type} data:`, error);
    }
  }

  /**
   * Handle game state changes
   */
  async handleGameStateChange(phase, previous, timestamp) {
    logger.info(`Handling game state change: ${previous} -> ${phase}`);
    
    this.currentGamePhase = phase;
    this.isInGame = phase === 'InProgress';
    
    // Create adapter for existing key implementations
    const keyManager = this.createKeyManagerAdapter();
    
    // Specifically handle live game updates based on game state
    if (this.isInGame && previous !== 'InProgress') {
      // Entering game - start live game updates
      logger.info('Entering game - starting live game data updates');
      keys.handleLiveGameUpdate(keyManager, '/liveclientdata/playerlist', null);
    } else if (!this.isInGame && previous === 'InProgress') {
      // Exiting game - stop live game updates
      logger.info('Exiting game - stopping live game data updates');
      keys.handleLiveGameUpdate(keyManager, '/liveclientdata/playerlist', null);
    }
  }

  /**
   * Handle summoner data updates
   */
  async handleSummonerData(data, previousData, timestamp) {
    if (!data) {
      logger.debug('No summoner data available');
      return;
    }

    logger.debug('Processing summoner data update');
    
    // Use the existing summoner key handler
    const keyManager = this.createKeyManagerAdapter();
    keys.handleSummonerUpdate(keyManager, data);
  }

  /**
   * Handle gameflow data updates
   */
  async handleGameflowData(data, previousData, timestamp) {
    if (!data) {
      logger.debug('No gameflow data available');
      return;
    }

    logger.debug(`Processing gameflow data update: ${data}`);
    
    // Update game state tracking
    if (data !== this.currentGamePhase) {
      await this.handleGameStateChange(data, this.currentGamePhase, timestamp);
    }
  }

  /**
   * Handle champion select data updates
   */
  async handleChampSelectData(data, previousData, timestamp) {
    logger.debug('Processing champion select data update');
    // Champion select handling would be implemented here
  }

  /**
   * Handle ranked data updates
   */
  async handleRankedData(data, previousData, timestamp) {
    if (!data) {
      logger.debug('No ranked data available');
      return;
    }

    logger.debug('Processing ranked data update');
    
    // Use the existing rank key handler
    const keyManager = this.createKeyManagerAdapter();
    keys.handleRankedUpdate(keyManager, data);
  }

  /**
   * Handle wallet data updates
   */
  async handleWalletData(data, previousData, timestamp) {
    if (!data) {
      logger.debug('No wallet data available');
      return;
    }

    logger.debug('Processing wallet data update');
    
    // Use the existing wallet key handler
    const keyManager = this.createKeyManagerAdapter();
    keys.handleWalletUpdate(keyManager, data);
  }

  /**
   * Handle live game data updates
   */
  async handleLiveGameData(data, previousData, timestamp) {
    logger.debug('Processing live game data update');
    
    // Only process if we're in game
    if (!this.isInGame) {
      return;
    }

    // Use the existing live game key handler
    const keyManager = this.createKeyManagerAdapter();
    keys.handleLiveGameUpdate(keyManager, '/liveclientdata/playerlist', data);
  }

  /**
   * Clean up keys for a disconnected device
   */
  cleanupKeysForDevice(serialNumber) {
    // Remove all keys for this device from tracking
    const keysToRemove = [];
    
    for (const [keyId] of this.activeKeys) {
      if (keyId.startsWith(`${serialNumber}-`)) {
        keysToRemove.push(keyId);
      }
    }
    
    keysToRemove.forEach(keyId => {
      this.activeKeys.delete(keyId);
      
      // Also remove from keyData if no other devices are using this key UID
      const keyUid = keyId.split('-')[1];
      let otherDevicesUsingKey = false;
      
      for (const [otherKeyId] of this.activeKeys) {
        if (otherKeyId.endsWith(`-${keyUid}`) && otherKeyId !== keyId) {
          otherDevicesUsingKey = true;
          break;
        }
      }
      
      if (!otherDevicesUsingKey) {
        this.keyData.delete(keyUid);
      }
    });
    
    logger.debug(`Cleaned up ${keysToRemove.length} keys for device ${serialNumber}`);
  }
}

module.exports = KeyHandlers; 