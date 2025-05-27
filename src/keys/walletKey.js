/**
 * Wallet Key Implementation
 * Displays the summoner's RP and BE currencies
 */

const { Canvas, loadImage } = require('skia-canvas');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { client, initializeClient } = require('../lol');
const canvasUtils = require('./canvasUtils');

const beIcon = "data:image/png;base64,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";
const rpIcon = "data:image/png;base64,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";

// Asset paths
const assetsPath = path.join(process.cwd(), 'assets');

/**
 * Get the RP icon as base64 data
 * @returns {string} Base64 encoded RP icon
 */
function getRpIcon() {
  return rpIcon;
}

/**
 * Get the BE icon as base64 data  
 * @returns {string} Base64 encoded BE icon
 */
function getBeIcon() {
  return beIcon;
}

/**
 * Creates a simplified wallet key canvas for testing
 * @param {object} config - Configuration object
 * @returns {Promise<Canvas>} - Canvas object
 */
async function createSimpleWalletKeyCanvas(config) {
  const {
    width = 360,
    height = 60,
    rp = 0,
    be = 0,
    backgroundColor = '#1E2328'
  } = config;

  try {
    // Create canvas
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');

    // Simple background (no gradient)
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Simple text layout - just text, no icons
    const sectionWidth = width / 2;
    
    // RP (left section)
    canvasUtils.drawText(
      ctx,
      `RP: ${rp.toLocaleString()}`,
      10,
      20,
      sectionWidth - 20,
      'bold 12px Arial',
      '#F1895B'
    );

    // BE (right section)
    canvasUtils.drawText(
      ctx,
      `BE: ${be.toLocaleString()}`,
      sectionWidth + 10,
      20,
      sectionWidth - 20,
      'bold 12px Arial',
      '#0ACBE6'
    );

    return canvas;
  } catch (error) {
    logger.error('Failed to create simple wallet key canvas:', error);
    return canvasUtils.createFallbackCanvas(width, height, 'Wallet Unavailable');
  }
}

/**
 * Creates a wallet key canvas with currency info
 * @param {object} config - Configuration object
 * @returns {Promise<Canvas>} - Canvas object
 */
async function createWalletKeyCanvas(config) {
  const {
    width = 360,
    height = 60, // Maximum height of 60 pixels
    rp = 0,
    be = 0,
    backgroundColor = '#0A1428', // Same as summoner key
    accentColor = '#C89B3C', // Same as summoner key
    useSimpleVersion = false // Add flag to test simple version
  } = config;

  // Use simple version if requested
  if (useSimpleVersion) {
    logger.debug('Using simple wallet key canvas version');
    return createSimpleWalletKeyCanvas(config);
  }

  try {
    // Create canvas
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');

    // Use the same background as summoner key
    canvasUtils.drawKeyBackground(ctx, width, height, backgroundColor);

    // Layout constants - optimized for 60px height with minimal margins
    const padding = 10; // Reduced padding for less icon margins
    const iconSize = 28; // Large icons
    const fontSize = 18; // Bigger text for better readability
    const fontString = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    const sectionWidth = width / 2;
    
    // Calculate center positions for 60px height
    const centerY = height / 2;
    const iconY = centerY - (iconSize / 2); // Center the icons
    const textY = centerY - 12; // Adjust for proper text baseline centering (18px font needs ~7px offset)

    // Load currency icons
    let rpIconImage = null;
    let beIconImage = null;
    
    try {
      rpIconImage = await loadImage(getRpIcon());
    } catch (error) {
      logger.error('Error loading RP icon:', error);
    }
    
    try {
      beIconImage = await loadImage(getBeIcon());
    } catch (error) {
      logger.error('Error loading BE icon:', error);
    }

    // RP Section (left side) - following summoner key layout pattern
    const rpIconX = padding + 4;
    const rpTextX = rpIconX + iconSize + padding;
    const rpTextWidth = sectionWidth - rpTextX - padding;
    
    if (rpIconImage) {
      // Draw RP icon without border
      canvasUtils.drawIcon(ctx, rpIconImage, rpIconX, iconY, iconSize, 4);
      
      // Draw RP value (properly centered)
      canvasUtils.drawText(
        ctx,
        rp.toLocaleString(),
        rpTextX,
        textY,
        rpTextWidth,
        fontString,
        '#FFFFFF'
      );
    } else {
      // Fallback RP text
      canvasUtils.drawText(
        ctx,
        `RP: ${rp.toLocaleString()}`,
        rpIconX,
        textY,
        sectionWidth - (padding * 2),
        fontString,
        '#FFFFFF'
      );
    }

    // BE Section (right side) - same layout pattern
    const beIconX = sectionWidth + padding;
    const beTextX = beIconX + iconSize + padding;
    const beTextWidth = sectionWidth - (iconSize + padding * 2);
    
    if (beIconImage) {
      // Draw BE icon without border
      canvasUtils.drawIcon(ctx, beIconImage, beIconX, iconY, iconSize, 4);
      
      // Draw BE value (properly centered)
      canvasUtils.drawText(
        ctx,
        be.toLocaleString(),
        beTextX,
        textY,
        beTextWidth,
        fontString,
        '#FFFFFF'
      );
    } else {
      // Fallback BE text
      canvasUtils.drawText(
        ctx,
        `BE: ${be.toLocaleString()}`,
        beIconX,
        textY,
        sectionWidth - (padding * 2),
        fontString,
        '#FFFFFF'
      );
    }

    // Add a subtle divider line between currencies (similar to progress bar styling)
    const dividerX = width / 2;
    const dividerY = padding + 2;
    const dividerHeight = height - (padding * 2) - 4;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; // Same opacity as progress bar background
    ctx.fillRect(dividerX, dividerY, 1, dividerHeight);

    return canvas;
  } catch (error) {
    logger.error('Failed to create wallet key canvas:', error);
    return canvasUtils.createFallbackCanvas(width, height, 'Wallet Unavailable');
  }
}

/**
 * Saves a canvas to a PNG file for debugging purposes
 * @param {Canvas} canvas - The canvas to save
 * @param {string} filename - The filename to save to
 * @returns {Promise<void>}
 */
async function saveCanvasToFile(canvas, filename) {
  try {
    // Create debug directory if it doesn't exist
    const debugDir = path.join(process.cwd(), 'debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir);
    }
    
    const filePath = path.join(debugDir, filename);
    const pngData = await canvas.toBuffer('image/png');
    fs.writeFileSync(filePath, pngData);
    logger.info(`Debug wallet key image saved to: ${filePath}`);
  } catch (error) {
    logger.error('Error saving debug wallet key image:', error);
  }
}

/**
 * Initialize a wallet display key (RP/BE)
 * @param {string} serialNumber Device serial number
 * @param {object} keyManager Key manager instance
 * @param {object} key Key data
 * @param {object} walletData Wallet data from API
 */
async function initializeWalletKey(serialNumber, keyManager, key) {
  const keyUid = key.uid;
  const keyId = `${serialNumber}-${keyUid}`;

  try {
    await initializeClient();
    
    // Check if client is available for API calls
    if (!client.isAvailable()) {
      logger.info(`League client not available for wallet key ${keyId}, showing offline state`);
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
    
    // Get wallet data if not provided using the getWallet method
    const wallet = await client.getWallet();
    
    if (!wallet) {
      throw new Error('No wallet data available');
    }
    
    // Initialize key data
    key.data = key.data || {};
    
    // Store key data
    keyManager.keyData[keyUid] = key;
    keyManager.activeKeys[keyId] = true;
    
    // Get currency info from wallet - checking all possible property names
    // The API returns different property names depending on the endpoint
    let rp = 0;
    let be = 0;
    
    // Check all possible RP property names
    if (wallet.rp !== undefined) rp = wallet.rp;
    else if (wallet.RP !== undefined) rp = wallet.RP;
    
    // Check all possible BE property names
    if (wallet.ip !== undefined) be = wallet.ip;
    else if (wallet.IP !== undefined) be = wallet.IP;
    else if (wallet.lol_blue_essence !== undefined) be = wallet.lol_blue_essence;
    
    logger.info(`Extracted wallet values - RP: ${rp}, BE: ${be}`);
    
    try {
      // Try to create a fancy canvas with the wallet data
      const canvas = await createWalletKeyCanvas({
        width: key.width || 360,
        height: 60,
        rp: rp,
        be: be,
        backgroundColor: key.style.backgroundColor || '#0A1428',
        useSimpleVersion: false
      });
      
      // Convert canvas to base64 for drawing
      const buttonDataUrl = await canvasUtils.canvasToDataURL(canvas);
      
      if (buttonDataUrl) {
        // Create a safe copy of the key object with all required properties
        const safeKey = {
          uid: keyUid,
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
          const textKey = {
            uid: keyUid,
            title: `RP: ${rp.toLocaleString()} | BE: ${be.toLocaleString()}`,
            style: {
              ...(key.style || {}),
              showImage: false,
              showTitle: true,
              showIcon: false,
              showEmoji: false
            }
          };
          keyManager.simpleTextDraw(serialNumber, textKey);
        }
      } else {
        logger.error(`Failed to create wallet key display for ${keyId}: buttonDataUrl is null or empty`);
        
        // Create a safe key object for text drawing
        const textKey = {
          uid: keyUid,
          title: `RP: ${rp.toLocaleString()} | BE: ${be.toLocaleString()}`,
          style: {
            ...(key.style || {}),
            showImage: false,
            showTitle: true
          }
        };
        keyManager.simpleTextDraw(serialNumber, textKey);
      }
      
    } catch (error) {
      logger.error('Error creating wallet canvas, falling back to simple text:', error);
      
      // Fallback to text
      const safeKey = {
        uid: keyUid,
        title: 'Wallet Unavailable',
        style: {
          showImage: false,
          showTitle: true
        }
      };
      
      keyManager.simpleTextDraw(serialNumber, safeKey);
    }
    
  } catch (error) {
    logger.error('Error initializing wallet key:', error);
    
    // Fallback to text
    const safeKey = {
      uid: keyUid,
      title: 'Wallet Unavailable',
      style: {
        showImage: false,
        showTitle: true
      }
    };
    
    keyManager.simpleTextDraw(serialNumber, safeKey);
  }
}

/**
 * Handle wallet updates (RP/BE)
 * @param {object} keyManager Key manager instance
 * @param {object} data Wallet data from API
 */
function handleWalletUpdate(keyManager, data) {
  // Update wallet keys when wallet data changes
  Object.keys(keyManager.activeKeys).forEach(keyId => {
    const [serialNumber, keyUid] = keyId.split('-');
    const key = keyManager.keyData[keyUid];
    
    if (key && key.cid === 'com.sondrenjaastad.leagueoflegends.wallet') {
      initializeWalletKey(serialNumber, keyManager, key);
    }
  });
}

module.exports = {
  initializeWalletKey,
  handleWalletUpdate
}; 