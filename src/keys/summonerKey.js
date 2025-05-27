/**
 * Summoner Key Implementation
 * Displays the current summoner name, tag, and profile icon
 */

const { Canvas } = require('skia-canvas');
const logger = require('../utils/logger');
const { client, initializeClient } = require('../lol');
const canvasUtils = require('./canvasUtils');

/**
 * Creates a summoner key canvas with summoner info
 * @param {object} config - Configuration object
 * @returns {Promise<Canvas>} - Canvas object
 */
async function createSummonerKeyCanvas(config) {
  const {
    width = 360,
    height = 60,
    gameName = 'Loading...',
    tagLine = '',
    profileIconId = null,
    summonerLevel = 0,
    xpSinceLastLevel = 0,
    xpUntilNextLevel = 0,
    percentCompleteForNextLevel = 0,
    backgroundColor = '#0A1428', // League of Legends dark blue
    accentColor = '#C89B3C'  // League of Legends gold
  } = config;

  try {
    // Create canvas
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw background
    canvasUtils.drawKeyBackground(ctx, width, height, backgroundColor);

    // Layout
    const padding = 8;
    const iconSize = height - (padding * 2);
    const iconX = padding;
    const iconY = padding;
    const textX = iconX + iconSize + padding * 2;
    const availableTextWidth = width - textX - padding;

    // Draw summoner icon if available
    if (profileIconId) {
      try {
        // Load icon
        const iconPath = `img/profileicon/${profileIconId}.png`;
        const icon = await canvasUtils.loadCachedImage(iconPath);
        
        // Draw icon
        canvasUtils.drawIcon(ctx, icon, iconX, iconY, iconSize, 8);
        
        // Add border
        canvasUtils.drawIconBorder(ctx, iconX, iconY, iconSize, 8, accentColor, 2);
      } catch (error) {
        logger.error('Failed to load summoner icon:', error);
      }
    }

    // Draw summoner name with tag
    const nameWithTag = tagLine ? `${gameName} #${tagLine}` : gameName;
    canvasUtils.drawText(
      ctx, 
      nameWithTag, 
      textX, 
      iconY - 3, 
      availableTextWidth,
      'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      '#FFFFFF'
    );

    // XP Progress bar
    if (xpUntilNextLevel > 0) {
      const progressBarY = iconY + 21;
      const progressBarHeight = 6;
      const progressBarWidth = availableTextWidth;
      
      // Calculate progress
      const progress = percentCompleteForNextLevel > 0 
        ? percentCompleteForNextLevel / 100 
        : xpSinceLastLevel / (xpSinceLastLevel + xpUntilNextLevel);
      
      // Draw progress bar
      canvasUtils.drawProgressBar(
        ctx,
        textX,
        progressBarY,
        progressBarWidth,
        progressBarHeight,
        progress,
        'rgba(255, 255, 255, 0.2)',
        accentColor,
        3
      );
      
      // XP Progress text with level
      const levelText = summonerLevel ? `Level ${summonerLevel} • ` : '';
      const progressText = `${levelText}XP: ${xpSinceLastLevel}/${xpSinceLastLevel + xpUntilNextLevel}`;
      
      canvasUtils.drawText(
        ctx,
        progressText,
        textX,
        progressBarY + progressBarHeight + 3,
        availableTextWidth,
        '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        '#FFFFFF'
      );
    } else if (summonerLevel) {
      // If no XP data but level is available, just show the level
      const levelY = iconY + 33;
      canvasUtils.drawText(
        ctx,
        `Level ${summonerLevel}`,
        textX,
        levelY,
        availableTextWidth,
        '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        '#FFFFFF'
      );
    }

    return canvas;
  } catch (error) {
    logger.error('Failed to create summoner key canvas:', error);
    return canvasUtils.createFallbackCanvas(width, height, 'Error Loading');
  }
}

/**
 * Initialize a summoner name key
 * @param {string} serialNumber Device serial number
 * @param {object} keyManager Key manager instance
 * @param {object} key Key data
 * @param {object} summonerData Optional summoner data from API
 */
async function initializeSummonerKey(serialNumber, keyManager, key) {
  const keyUid = key.uid;
  const keyId = `${serialNumber}-${keyUid}`;

  try {
    await initializeClient();
    
    // Check if client is available for API calls
    if (!client.isAvailable()) {
      logger.info(`League client not available for summoner key ${keyId}, showing offline state`);
      const safeKey = {
        uid: keyUid,
        width: key.width, // Preserve original width
        title: 'League Offline',
        style: {
          ...(key.style || {}), // Preserve original style properties
          showImage: false,
          showTitle: true,
          backgroundColor: '#8B0000' // Dark red background
        }
      };
      keyManager.simpleTextDraw(serialNumber, safeKey);
      return;
    }
    
    // Get summoner data if not provided
    const me = await client.get('/lol-summoner/v1/current-summoner');
    
    // Initialize key data
    key.data = key.data || {};
    key.data.counter = parseInt(key.data.rangeMin || '0');
    
    // Set key style - IMPORTANT: Override the incoming style settings
    const originalStyle = { ...key.style };
    
    // Fix any incorrect style properties
    if (originalStyle.fonnt !== undefined && originalStyle.font === undefined) {
      originalStyle.font = originalStyle.fonnt;
      delete originalStyle.fonnt;
    }
    
    key.style = {
      ...originalStyle,  // Keep existing corrected style properties
      showIcon: false,
      showTitle: false,
      showImage: true,  // Force showImage to true
      showEmoji: false
    };
    
    // Store key data
    keyManager.keyData[keyUid] = key;
    keyManager.activeKeys[keyId] = true;

    // Create the canvas with summoner info
    const canvas = await createSummonerKeyCanvas({
      width: key.width || 360,
      gameName: me.gameName,
      tagLine: me.tagLine,
      profileIconId: me.profileIconId,
      summonerLevel: me.summonerLevel,
      xpSinceLastLevel: me.xpSinceLastLevel,
      xpUntilNextLevel: me.xpUntilNextLevel,
      percentCompleteForNextLevel: me.percentCompleteForNextLevel,
      backgroundColor: key.style.backgroundColor || '#0A1428',
      accentColor: key.style.accentColor || '#C89B3C'
    });
    
    // Convert to data URL
    const buttonDataUrl = await canvasUtils.canvasToDataURL(canvas);
    
    if (buttonDataUrl) {
      // Create a safe copy of the key object with all required properties
      const safeKey = {
        uid: keyUid,  // Ensure uid is explicitly set
        width: key.width,
        style: { 
          ...(key.style || {}),
          showImage: true,
          showTitle: false,
          showIcon: false,
          showEmoji: false
        }
      };
      
      // Attempt direct draw first
      try {
        keyManager.simpleDraw(serialNumber, safeKey, buttonDataUrl);
      } catch (drawError) {
        logger.error(`Error during draw call for key ${keyId}:`, drawError);
        
        // Fall back to text display
        safeKey.title = me.gameName + '#' + me.tagLine;
        try {
          keyManager.simpleTextDraw(serialNumber, safeKey);
        } catch (textDrawError) {
          logger.error(`Even text fallback failed for key ${keyId}:`, textDrawError);
        }
      }
    } else {
      logger.error(`Failed to create summoner key display for ${keyId}: buttonDataUrl is null or empty`);
      
      // Create a safe key object for text drawing
      const safeKey = {
        uid: keyUid,
        title: me.gameName + '#' + me.tagLine,
        style: {
          ...(key.style || {}),
          showImage: false,
          showTitle: true
        }
      };
      
      keyManager.simpleTextDraw(serialNumber, safeKey);
    }
  } catch (error) {
    logger.error('Error initializing summoner key:', error);
    
    // CRITICAL FIX: Create a safe key object for error text
    const safeKey = {
      uid: keyUid,
      title: 'Error Loading',
      style: {
        showImage: false,
        showTitle: true
      }
    };
    
    keyManager.simpleTextDraw(serialNumber, safeKey);
  }
}

/**
 * Handle summoner data updates
 * @param {object} keyManager Key manager instance
 * @param {object} data Summoner data from API
 */
function handleSummonerUpdate(keyManager, data) {
  // Update summoner keys when summoner data changes
  Object.keys(keyManager.activeKeys).forEach(keyId => {
    const [serialNumber, keyUid] = keyId.split('-');
    const key = keyManager.keyData[keyUid];
    
    if (key && key.cid === 'com.sondrenjaastad.leagueoflegends.summoner') {
      initializeSummonerKey(serialNumber, keyManager, key);
    }
  });
}

module.exports = {
  initializeSummonerKey,
  handleSummonerUpdate
}; 