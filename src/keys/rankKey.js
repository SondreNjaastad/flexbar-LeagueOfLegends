/**
 * Rank Key Implementation
 * Displays the summoner's rank, division, and LP
 * 
 * Multiple Rank Keys Support:
 * - When multiple rank keys are configured, the first key defaults to Solo/Duo queue
 * - The second key automatically defaults to Flex queue (if available)
 * - Additional keys cycle through remaining available queues
 * - Users can still manually cycle through queues by clicking the keys
 */

const { Canvas, loadImage } = require('skia-canvas');
const logger = require('../utils/logger');
const { client, initializeClient } = require('../lol');
const canvasUtils = require('./canvasUtils');

// Import rank icons
const {
  iron,
  bronze,
  silver,
  gold,
  platinum,
  emerald,
  diamond,
  master,
  grandmaster,
  challanger
} = require('./rankIcons');

// Map rank names to their corresponding base64 icons
const RANK_ICONS = {
  'IRON': iron,
  'BRONZE': bronze,
  'SILVER': silver,
  'GOLD': gold,
  'PLATINUM': platinum,
  'EMERALD': emerald,
  'DIAMOND': diamond,
  'MASTER': master,
  'GRANDMASTER': grandmaster,
  'CHALLENGER': challanger
};

// Queue type display names
const QUEUE_NAMES = {
  'RANKED_SOLO_5x5': 'Solo/Duo',
  'RANKED_FLEX_SR': 'Flex',
  'RANKED_FLEX_TT': 'Flex 3v3'
};

// Available queue types in priority order
const QUEUE_PRIORITY = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR', 'RANKED_FLEX_TT'];

// Store current queue selection per key
const keyQueueSelections = {};

/**
 * Loads a rank icon from base64 data
 */
async function loadRankIcon(tier) {
  try {
    const iconData = RANK_ICONS[tier];
    if (!iconData) {
      logger.warn(`No icon found for tier: ${tier}`);
      return null;
    }
    
    return await loadImage(iconData);
  } catch (error) {
    logger.error(`Failed to load rank icon for ${tier}:`, error);
    return null;
  }
}

/**
 * Gets the best ranked entry to display
 */
function getBestRankedEntry(rankedData) {
  if (!rankedData || !rankedData.queueMap) {
    return null;
  }

  // Priority order: Solo/Duo > Flex > others
  const priorityQueues = ['RANKED_SOLO_5x5', 'RANKED_FLEX_SR', 'RANKED_FLEX_TT'];
  
  for (const queueType of priorityQueues) {
    const entry = rankedData.queueMap[queueType];
    if (entry && entry.tier && entry.tier !== 'UNRANKED') {
      return { ...entry, queueType };
    }
  }

  // Fallback to any ranked entry
  for (const [queueType, entry] of Object.entries(rankedData.queueMap)) {
    if (entry && entry.tier && entry.tier !== 'UNRANKED') {
      return { ...entry, queueType };
    }
  }

  return null;
}

/**
 * Formats rank display text
 */
function formatRankText(entry) {
  if (!entry || !entry.tier) {
    return 'Unranked';
  }

  const tier = entry.tier;
  const division = entry.division || '';
  const lp = entry.leaguePoints || 0;
  const queueName = QUEUE_NAMES[entry.queueType] || entry.queueType;

  // For Master, Grandmaster, and Challenger, don't show division
  if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
    return `${tier} ${lp} LP`;
  }

  // For other ranks, add clear separation between division and LP
  return `${tier} ${division} • ${lp} LP`;
}

/**
 * Gets available ranked queues from data
 */
function getAvailableQueues(rankedData) {
  if (!rankedData || !rankedData.queueMap) {
    return [];
  }

  return QUEUE_PRIORITY.filter(queueType => {
    const entry = rankedData.queueMap[queueType];
    return entry && entry.tier && entry.tier !== 'UNRANKED';
  });
}

/**
 * Determines the best default queue for a rank key based on existing keys
 */
function getDefaultQueueForKey(keyId, availableQueues) {
  if (availableQueues.length === 0) {
    return null;
  }

  // Get all currently active rank keys with their queue assignments
  const activeRankKeys = Object.keys(keyQueueSelections).filter(id => 
    keyQueueSelections[id] && availableQueues.includes(keyQueueSelections[id])
  );

  // If this is the first rank key or only one queue available, use priority order
  if (activeRankKeys.length === 0 || availableQueues.length === 1) {
    return availableQueues[0]; // Solo/Duo first by priority
  }

  // Check what queues are already taken
  const usedQueues = activeRankKeys.map(id => keyQueueSelections[id]);
  
  // If Solo/Duo is taken and Flex is available, assign Flex
  if (usedQueues.includes('RANKED_SOLO_5x5') && availableQueues.includes('RANKED_FLEX_SR')) {
    logger.info(`Assigning Flex queue to rank key ${keyId} (Solo/Duo already in use)`);
    return 'RANKED_FLEX_SR';
  }
  
  // If Flex is taken and Solo/Duo is available, assign Solo/Duo
  if (usedQueues.includes('RANKED_FLEX_SR') && availableQueues.includes('RANKED_SOLO_5x5')) {
    logger.info(`Assigning Solo/Duo queue to rank key ${keyId} (Flex already in use)`);
    return 'RANKED_SOLO_5x5';
  }

  // Find the first unused queue in priority order
  for (const queueType of QUEUE_PRIORITY) {
    if (availableQueues.includes(queueType) && !usedQueues.includes(queueType)) {
      return queueType;
    }
  }

  // Fallback to first available queue if all are taken
  return availableQueues[0];
}

/**
 * Gets the current selected queue for a key, or the best available queue
 */
function getCurrentQueue(keyId, rankedData) {
  const availableQueues = getAvailableQueues(rankedData);
  
  if (availableQueues.length === 0) {
    return null;
  }

  // If no selection stored or selection is invalid, determine the default queue
  if (!keyQueueSelections[keyId] || !availableQueues.includes(keyQueueSelections[keyId])) {
    keyQueueSelections[keyId] = getDefaultQueueForKey(keyId, availableQueues);
  }

  return keyQueueSelections[keyId];
}

/**
 * Cycles to the next available queue for a key
 */
function cycleToNextQueue(keyId, rankedData) {
  const availableQueues = getAvailableQueues(rankedData);
  
  if (availableQueues.length <= 1) {
    return getCurrentQueue(keyId, rankedData); // No cycling needed
  }

  const currentQueue = getCurrentQueue(keyId, rankedData);
  const currentIndex = availableQueues.indexOf(currentQueue);
  const nextIndex = (currentIndex + 1) % availableQueues.length;
  
  keyQueueSelections[keyId] = availableQueues[nextIndex];
  logger.info(`Cycled rank key ${keyId} to queue: ${keyQueueSelections[keyId]}`);
  
  return keyQueueSelections[keyId];
}

/**
 * Gets the ranked entry for a specific queue
 */
function getRankedEntryForQueue(rankedData, queueType) {
  if (!rankedData || !rankedData.queueMap || !queueType) {
    return null;
  }

  const entry = rankedData.queueMap[queueType];
  if (entry && entry.tier && entry.tier !== 'UNRANKED') {
    return { ...entry, queueType };
  }

  return null;
}

/**
 * Renders the rank key canvas
 */
async function renderRankKey(key, rankedData, keyId = null) {
  try {
    const width = key.width || 360;
    const height = 60; // Fixed height for consistency
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');

    // Apply background using canvasUtils for consistency
    const backgroundColor = key.style?.backgroundColor || '#0A1428';
    canvasUtils.drawKeyBackground(ctx, width, height, backgroundColor);

    // Get the current selected queue for this key, or use the best available
    let selectedQueue = null;
    let bestEntry = null;
    
    if (keyId) {
      selectedQueue = getCurrentQueue(keyId, rankedData);
      bestEntry = getRankedEntryForQueue(rankedData, selectedQueue);
    }
    
    // Fallback to best entry if no specific queue selected
    if (!bestEntry) {
      bestEntry = getBestRankedEntry(rankedData);
    }
    
    if (!bestEntry) {
      // Show unranked state
      ctx.fillStyle = '#CDBE91';
      ctx.font = 'bold 18px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Unranked', width / 2, height / 2);
      return canvas;
    }

    // Load rank icon (using the same pattern as wallet key)
    const rankIcon = await loadRankIcon(bestEntry.tier);

    // Layout calculations
    const padding = 6;
    const iconSize = 80; // Increased from 48 to 72 (1.5x larger)
    const iconX = padding;
    const iconY = ((height - iconSize) / 2) - 7;

    // Draw rank icon using canvasUtils.drawIcon like wallet key
    if (rankIcon) {
      canvasUtils.drawIcon(ctx, rankIcon, iconX, iconY, iconSize, 4);
    } else {
      // Fallback: draw colored circle if icon fails to load
      ctx.fillStyle = '#666666';
      ctx.beginPath();
      ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, 2 * Math.PI);
      ctx.fill();
    }

    // Text positioning
    const textX = iconX + iconSize + 12;
    const availableTextWidth = width - textX - padding;

    // Split the rank text into tier+division and LP
    const tier = bestEntry.tier;
    const division = bestEntry.division || '';
    const lp = bestEntry.leaguePoints || 0;
    const wins = bestEntry.wins || 0;
    const losses = bestEntry.losses || 0;
    
    // For Master, Grandmaster, and Challenger, don't show division
    let tierText;
    if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
      tierText = tier;
    } else {
      tierText = `${tier} ${division}`;
    }

    // Queue name
    const queueName = QUEUE_NAMES[bestEntry.queueType] || bestEntry.queueType;

    // Left side: Tier and Queue (stacked vertically)
    ctx.fillStyle = '#CDBE91';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    const leftTextY1 = height / 2 - 6; // Upper text (tier)
    const leftTextY2 = height / 2 + 9; // Lower text (queue)
    
    ctx.fillText(tierText, textX, leftTextY1);
    
    // Queue type (smaller text below tier)
    ctx.fillStyle = '#A09B8C';
    ctx.font = '12px Arial';
    ctx.fillText(queueName, textX, leftTextY2);

    // Right side: LP and Win/Loss (stacked vertically)
    const rightTextX = width - padding - 15; // Add more space from right edge
    
    // LP (upper right) - much bigger text
    ctx.fillStyle = '#CDBE91';
    ctx.font = 'bold 20px Arial'; // Increased from 14px to 20px
    ctx.textAlign = 'right';
    ctx.fillText(`${lp} LP`, rightTextX, leftTextY1);
    
    // Win/Loss record (lower right, if available)
    if (wins !== undefined && losses !== undefined) {
      ctx.fillStyle = '#A09B8C';
      ctx.font = '11px Arial';
      ctx.fillText(`${wins}W ${losses}L`, rightTextX, leftTextY2);
    }

    return canvas;

  } catch (error) {
    logger.error('Error rendering rank key:', error);
    
    // Fallback canvas
    const canvas = new Canvas(key.width || 360, 60);
    const ctx = canvas.getContext('2d');
    const backgroundColor = key.style?.backgroundColor || '#0A1428';
    canvasUtils.drawKeyBackground(ctx, canvas.width, canvas.height, backgroundColor);
    
    ctx.fillStyle = '#FF6B6B';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Rank Error', canvas.width / 2, canvas.height / 2);

    return canvas;
  }
}

/**
 * Main rank key update function
 */
async function updateRankKey(key, rankedData) {
  try {
    logger.info('Updating rank key with data:', rankedData ? 'Available' : 'Unavailable');
    
    if (!rankedData) {
      logger.info('No ranked data available');
      return;
    }

    const canvas = await renderRankKey(key, rankedData);
    
    // Convert canvas to data URL
    const dataUrl = await canvasUtils.canvasToDataURL(canvas);
    
    return dataUrl;
    
  } catch (error) {
    logger.error('Failed to update rank key:', error);
    return null;
  }
}

/**
 * Initialize rank key (compatibility function for plugin.js)
 */
async function initializeRankKey(serialNumber, keyManager, key, rankedData = null) {
  const keyUid = key.uid;
  const keyId = `${serialNumber}-${keyUid}`;
  logger.info('Initializing rank key:', keyId);

  try {
    await initializeClient();
    
    // Check if client is available for API calls
    if (!client.isAvailable()) {
      logger.info(`League client not available for rank key ${keyId}, showing offline state`);
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
    
    // Get ranked data if not provided
    const ranked = rankedData || await client.get('/lol-ranked/v1/current-ranked-stats');
    
    // Store key data
    keyManager.keyData[keyUid] = key;
    keyManager.activeKeys[keyId] = true;
    
    // Create and display the rank key with keyId for queue selection
    const canvas = await renderRankKey(key, ranked, keyId);
    
    // Convert canvas to data URL
    const dataUrl = await canvasUtils.canvasToDataURL(canvas);
    
    if (dataUrl) {
      // Create safe key object for drawing
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
    
    keyManager.simpleDraw(serialNumber, safeKey, dataUrl);
    } else {
      throw new Error('Failed to create rank key data URL');
    }
    
  } catch (error) {
    logger.error('Error initializing rank key:', error);
    
    // Fallback to text display
    const safeKey = {
      uid: keyUid,
      title: 'Rank Unavailable',
      style: {
        showImage: false,
        showTitle: true
      }
    };
    
    keyManager.simpleTextDraw(serialNumber, safeKey);
  }
}

/**
 * Handle ranked data updates (compatibility function)
 */
function handleRankedUpdate(keyManager, data) {
  // Find and update all active rank keys
  Object.keys(keyManager.activeKeys).forEach(keyId => {
    const [serialNumber, keyUid] = keyId.split('-');
    const key = keyManager.keyData[keyUid];
    
    if (key && key.cid === 'com.sondrenjaastad.leagueoflegends.rank') {
      logger.debug(`Updating rank key: ${keyId}`);
      initializeRankKey(serialNumber, keyManager, key, data);
    }
  });
}

/**
 * Handle rank key interaction (cycling through queues)
 */
async function handleRankKeyInteraction(serialNumber, keyManager, key, rankedData = null) {
  const keyUid = key.uid;
  const keyId = `${serialNumber}-${keyUid}`;
  logger.info('Handling rank key interaction (queue cycle):', keyId);

  try {
    await initializeClient();
    
    // Get ranked data if not provided
    const ranked = rankedData || await client.get('/lol-ranked/v1/current-ranked-stats');
    
    // Cycle to next queue
    const newQueue = cycleToNextQueue(keyId, ranked);
    logger.info(`Rank key ${keyId} cycled to queue: ${newQueue}`);
    
    // Re-render with new queue selection
    const canvas = await renderRankKey(key, ranked, keyId);
    
    // Convert canvas to data URL
    const dataUrl = await canvasUtils.canvasToDataURL(canvas);
    
    if (dataUrl) {
      // Create safe key object for drawing
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
      
      logger.debug(`Attempting to redraw rank key ${keyId} after queue cycle`);
      keyManager.simpleDraw(serialNumber, safeKey, dataUrl);
      logger.info('Rank key updated after queue cycle');
    } else {
      throw new Error('Failed to create rank key data URL after queue cycle');
    }
    
  } catch (error) {
    logger.error('Error handling rank key interaction:', error);
  }
}

module.exports = {
  updateRankKey,
  initializeRankKey,
  handleRankedUpdate,
  getBestRankedEntry,
  formatRankText,
  getCurrentQueue,
  getDefaultQueueForKey,
  cycleToNextQueue,
  getRankedEntryForQueue,
  handleRankKeyInteraction
}; 