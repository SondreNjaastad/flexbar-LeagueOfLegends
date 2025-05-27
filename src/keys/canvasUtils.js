/**
 * Canvas Utilities for Key Rendering
 * Provides common canvas rendering operations used across different key types
 */

const { Canvas, loadImage } = require('skia-canvas');
const { truncateText, roundedRect } = require('../utils');
const logger = require('../utils/logger');
const { client } = require('../lol');
const path = require('path');
const fs = require('fs');

/**
 * Creates a standard key background
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {string} backgroundColor - Background color
 * @param {boolean} addGradient - Whether to add a gradient overlay
 */
function drawKeyBackground(ctx, width, height, backgroundColor = '#1E2328', addGradient = true) {
  // Set background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  
  // Add subtle gradient overlay if requested
  if (addGradient) {
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }
}

/**
 * Draws a rounded rectangle
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Width of the rectangle
 * @param {number} height - Height of the rectangle
 * @param {number} radius - Corner radius
 * @param {boolean} fill - Whether to fill the rectangle
 * @param {boolean} stroke - Whether to stroke the rectangle
 */
function drawRoundedRect(ctx, x, y, width, height, radius, fill = true, stroke = false) {
  if (width < 2 * radius) radius = width / 2;
  if (height < 2 * radius) radius = height / 2;
  
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

/**
 * Draws an icon with optional rounded corners
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Image} icon - Image to draw
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} size - Size (width/height)
 * @param {number} cornerRadius - Corner radius (0 for square)
 */
function drawIcon(ctx, icon, x, y, size, cornerRadius = 0) {
  if (cornerRadius > 0) {
    ctx.save();
    roundedRect(ctx, x, y, size, size, cornerRadius);
    ctx.clip();
    ctx.drawImage(icon, x, y, size, size);
    ctx.restore();
  } else {
    ctx.drawImage(icon, x, y, size, size);
  }
}

/**
 * Draws an icon border
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} size - Size (width/height)
 * @param {number} cornerRadius - Corner radius
 * @param {string} borderColor - Border color
 * @param {number} borderWidth - Border width
 */
function drawIconBorder(ctx, x, y, size, cornerRadius, borderColor = '#C89B3C', borderWidth = 2) {
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  roundedRect(ctx, x, y, size, size, cornerRadius);
  ctx.stroke();
}

/**
 * Draws text with truncation
 * @param {CanvasRenderingContext2D} ctx - Canvas context 
 * @param {string} text - Text to draw
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} maxWidth - Maximum width before truncation
 * @param {string} font - Font specification
 * @param {string} color - Text color
 */
function drawText(ctx, text, x, y, maxWidth, font = '16px Arial', color = '#FFFFFF') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  const displayText = truncateText(ctx, text, maxWidth);
  ctx.fillText(displayText, x, y);
  
  return displayText;
}

/**
 * Draws a progress bar
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Width of the progress bar
 * @param {number} height - Height of the progress bar
 * @param {number} progress - Progress value between 0 and 1
 * @param {string} backgroundColor - Background color
 * @param {string} fillColor - Fill color
 * @param {number} cornerRadius - Corner radius
 */
function drawProgressBar(ctx, x, y, width, height, progress, backgroundColor = 'rgba(255, 255, 255, 0.2)', fillColor = '#C89B3C', cornerRadius = 3) {
  // Background of progress bar
  ctx.fillStyle = backgroundColor;
  roundedRect(ctx, x, y, width, height, cornerRadius);
  ctx.fill();
  
  // Actual progress
  if (progress > 0) {
    ctx.fillStyle = fillColor;
    roundedRect(ctx, x, y, width * progress, height, cornerRadius);
    ctx.fill();
  }
}

/**
 * Loads a cached image from Data Dragon
 * @param {string} path - Data Dragon path
 * @returns {Promise<Image>} - Loaded image
 */
async function loadCachedImage(path) {
  try {
    const buffer = await client.getCachedDataDragonResource(path);
    return await loadImage(buffer);
  } catch (error) {
    logger.error(`Failed to load image from ${path}:`, error);
    throw error;
  }
}

/**
 * Loads a local image from the assets directory
 * @param {string} filename - Image filename
 * @returns {Promise<Image>} - Loaded image
 */
async function loadLocalAsset(filename) {
  try {
    // Try multiple possible paths for the assets
    const possiblePaths = [
      // Development path
      path.join(__dirname, '..', 'assets', filename),
      // Production path (plugin root)
      path.join(process.cwd(), 'assets', filename),
      // Production path (plugin directory structure)
      path.join(process.cwd(), '..', 'assets', filename)
    ];
    
    let buffer = null;
    let loadedPath = null;
    
    // Try each path until we find one that works
    for (const assetPath of possiblePaths) {
      try {
        logger.debug(`Trying to load asset from: ${assetPath}`);
        buffer = await fs.promises.readFile(assetPath);
        loadedPath = assetPath;
        break;
      } catch (err) {
        logger.debug(`Failed to load from ${assetPath}: ${err.message}`);
        // Continue to next path
      }
    }
    
    if (!buffer) {
      throw new Error(`Could not find asset ${filename} in any of the expected locations`);
    }
    
    logger.info(`Successfully loaded asset ${filename} from ${loadedPath}`);
    return await loadImage(buffer);
  } catch (error) {
    logger.error(`Failed to load local asset ${filename}:`, error);
    throw error;
  }
}

/**
 * Creates a data URL from a canvas
 * @param {Canvas} canvas - Canvas to convert
 * @returns {Promise<string>} - Data URL
 */
async function canvasToDataURL(canvas) {
  try {
    return canvas.toDataURL();
  } catch (error) {
    logger.error('Failed to convert canvas to data URL:', error);
    throw error;
  }
}

/**
 * Creates a fallback canvas with error message
 * @param {number} width - Canvas width
 * @param {number} height - Canvas height
 * @param {string} message - Error message
 * @returns {Canvas} - Fallback canvas
 */
function createFallbackCanvas(width, height, message = 'Error Loading') {
  const canvas = new Canvas(width, height);
  const ctx = canvas.getContext('2d');
  
  // Draw background
  ctx.fillStyle = '#1E2328';
  ctx.fillRect(0, 0, width, height);
  
  // Draw error message
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '16px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, width/2, height/2);
  
  return canvas;
}

/**
 * Creates a League of Legends themed offline state canvas
 * @param {object} config - Configuration object
 * @returns {Promise<Canvas>} - Canvas object
 */
async function createOfflineStateCanvas(config) {
  const {
    width = 360,
    height = 60,
    keyType = 'generic', // summoner, wallet, rank, etc.
    backgroundColor = '#2C1810', // Dark brown/bronze color
    accentColor = '#8B4513', // Bronze accent
    textColor = '#D4AF37' // Gold text
  } = config;

  try {
    // Create canvas
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw background with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, backgroundColor);
    gradient.addColorStop(1, '#1a0f08'); // Darker at bottom
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Add subtle border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);

    // Layout
    const padding = 8;
    const iconSize = height - (padding * 2);
    const iconX = padding;
    const iconY = padding;
    const textX = iconX + iconSize + padding * 2;
    const availableTextWidth = width - textX - padding;

    // Draw offline icon (circle with slash through)
    const iconCenterX = iconX + iconSize / 2;
    const iconCenterY = iconY + iconSize / 2;
    const iconRadius = iconSize / 3;

    // Draw the disconnected icon
    ctx.strokeStyle = '#8B0000'; // Dark red
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(iconCenterX, iconCenterY, iconRadius, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw diagonal slash
    ctx.beginPath();
    ctx.moveTo(iconCenterX - iconRadius * 0.7, iconCenterY - iconRadius * 0.7);
    ctx.lineTo(iconCenterX + iconRadius * 0.7, iconCenterY + iconRadius * 0.7);
    ctx.stroke();

    // Main text
    ctx.fillStyle = textColor;
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    const mainText = 'League Offline';
    ctx.fillText(mainText, textX, iconY + 2);

    // Subtitle based on key type
    let subtitle = '';
    switch (keyType) {
      case 'summoner':
        subtitle = 'Summoner info unavailable';
        break;
      case 'wallet':
        subtitle = 'Currency data unavailable';
        break;
      case 'rank':
        subtitle = 'Rank data unavailable';
        break;
      case 'gamestats':
      case 'teamkills':
      case 'kda':
      case 'wardscore':
        subtitle = 'Live game data unavailable';
        break;
      default:
        subtitle = 'Waiting for League client...';
    }

    // Draw subtitle
    ctx.fillStyle = '#A0A0A0'; // Gray text
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    ctx.fillText(subtitle, textX, iconY + 22);

    // Add subtle shine effect
    const shineGradient = ctx.createLinearGradient(0, 0, 0, height / 3);
    shineGradient.addColorStop(0, 'rgba(212, 175, 55, 0.1)'); // Gold shine
    shineGradient.addColorStop(1, 'rgba(212, 175, 55, 0)');
    ctx.fillStyle = shineGradient;
    ctx.fillRect(0, 0, width, height / 3);

    return canvas;
  } catch (error) {
    logger.error('Failed to create offline state canvas:', error);
    return createFallbackCanvas(width, height, 'League Offline');
  }
}

module.exports = {
  drawKeyBackground,
  drawIcon,
  drawIconBorder,
  drawText,
  drawProgressBar,
  loadCachedImage,
  loadLocalAsset,
  canvasToDataURL,
  createFallbackCanvas,
  drawRoundedRect,
  createOfflineStateCanvas
}; 