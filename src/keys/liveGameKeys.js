/**
 * Live Game Keys Implementation
 * Displays live match statistics: Team Kills, KDA, Ward Score, Minion Count
 */

const { Canvas } = require('skia-canvas');
const logger = require('../utils/logger');
const { client, initializeClient } = require('../lol');
const canvasUtils = require('./canvasUtils');

// Live client API base URL (always port 2999)
const LIVE_CLIENT_BASE = 'https://127.0.0.1:2999';

// Global timer for live game key updates
let liveGameUpdateTimer = null;
let lastGameStateCheck = 0;
let cachedGameState = null;

/**
 * Get current summoner's riot ID for live client queries
 */
async function getCurrentSummonerRiotId() {
  try {
    await initializeClient();
    const summoner = await client.get('/lol-summoner/v1/current-summoner');
    
    if (summoner && summoner.gameName && summoner.tagLine) {
      const riotId = `${summoner.gameName}#${summoner.tagLine}`;
      return riotId;
    }
    return null;
  } catch (error) {
    logger.error('Failed to get current summoner riot ID:', error);
    return null;
  }
}

/**
 * Get player scores from live client API
 */
async function getPlayerScores(riotId) {
  try {
    await initializeClient();
    const endpoint = `/liveclientdata/playerscores?riotId=${encodeURIComponent(riotId)}`;
    const result = await client.getLiveClientData(endpoint);
    return result;
  } catch (error) {
    logger.debug(`Failed to get player scores: ${error.message}`);
    return null;
  }
}

/**
 * Get all players from live client API
 */
async function getPlayerList() {
  try {
    await initializeClient();
    return await client.getLiveClientData('/liveclientdata/playerlist');
  } catch (error) {
    logger.debug(`Failed to get player list: ${error.message}`);
    return null;
  }
}

/**
 * Calculate team kills from player list
 */
function calculateTeamKills(playerList) {
  if (!playerList || !Array.isArray(playerList)) {
    return { ORDER: 0, CHAOS: 0 };
  }

  const teamKills = { ORDER: 0, CHAOS: 0 };
  
  playerList.forEach(player => {
    if (player.team && player.scores && typeof player.scores.kills === 'number') {
      teamKills[player.team] = (teamKills[player.team] || 0) + player.scores.kills;
    }
  });

  return teamKills;
}

/**
 * Find current player's team from player list
 */
function findPlayerTeam(playerList, riotId) {
  if (!playerList || !Array.isArray(playerList) || !riotId) {
    return null;
  }

  const player = playerList.find(p => p.riotId === riotId);
  return player ? player.team : null;
}

/**
 * Create a simple key canvas with statistics
 */
async function createStatKeyCanvas(config) {
  const {
    width = 360,
    height = 60,
    title = '',
    value = '',
    subtitle = '',
    backgroundColor = '#0A1428',
    primaryColor = '#CDBE91',
    secondaryColor = '#A09B8C'
  } = config;

  try {
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw background
    canvasUtils.drawKeyBackground(ctx, width, height, backgroundColor);

    const padding = 12;
    const centerY = height / 2;

    // Title (upper left)
    ctx.fillStyle = secondaryColor;
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, padding, centerY - 10);

    // Main value (center, large)
    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(value, width / 2, centerY);

    // Subtitle (lower right)
    if (subtitle) {
      ctx.fillStyle = secondaryColor;
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(subtitle, width - padding, centerY + 12);
    }

    return canvas;
  } catch (error) {
    logger.error('Failed to create stat key canvas:', error);
    return canvasUtils.createFallbackCanvas(width, height, 'Error');
  }
}

/**
 * Create a team kills canvas with LoL-style team colors and layout
 */
async function createTeamKillsCanvas(config) {
  const {
    width = 360,
    height = 60,
    orderKills = 0,
    chaosKills = 0,
    playerTeam = null,
    backgroundColor = '#0A1428'
  } = config;

  try {
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw background
    canvasUtils.drawKeyBackground(ctx, width, height, backgroundColor);

    const padding = 12;
    const centerX = width / 2;
    const centerY = height / 2;

    // Team colors (authentic LoL colors)
    const blueTeamColor = '#199bdd'; // Blue side (ORDER)
    const redTeamColor = '#db4647'; // Red side (CHAOS) - LoL uses gold/red
    const vsColor = '#b9b28c';

    // Main score layout - "X vs Y" format
    const scoreY = centerY + 2;
    const numberSpacing = 25;

    // Blue team kills (left)
    ctx.fillStyle = blueTeamColor;
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(orderKills.toString(), centerX - numberSpacing, scoreY);

    // "vs" text
    ctx.fillStyle = vsColor;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('vs', centerX, scoreY);

    // Red team kills (right)
    ctx.fillStyle = redTeamColor;
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(chaosKills.toString(), centerX + numberSpacing, scoreY);

    return canvas;
  } catch (error) {
    logger.error('Failed to create team kills canvas:', error);
    return canvasUtils.createFallbackCanvas(width, height, 'Error');
  }
}

/**
 * Create a KDA canvas with kill/death/assist stats
 */
async function createKDACanvas(config) {
  const {
    width = 360,
    height = 60,
    kills = 0,
    deaths = 0,
    assists = 0,
    backgroundColor = '#0A1428',
    primaryColor = '#CDBE91',
    secondaryColor = '#A09B8C'
  } = config;

  try {
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw background
    canvasUtils.drawKeyBackground(ctx, width, height, backgroundColor);

    const padding = 12;
    const centerY = height / 2;

    // KDA format: "K/D/A"
    const kdaText = `${kills}/${deaths}/${assists}`;
    
    // Title (upper left)
    ctx.fillStyle = secondaryColor;
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('KDA', padding, centerY - 10);

    // Main KDA value (center, large)
    ctx.fillStyle = primaryColor;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(kdaText, width / 2, centerY);

    // Calculate and show KDA ratio (lower right)
    const kdaRatio = deaths > 0 ? ((kills + assists) / deaths).toFixed(1) : (kills + assists).toFixed(1);
    ctx.fillStyle = secondaryColor;
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${kdaRatio} KDA`, width - padding, centerY + 12);

    return canvas;
  } catch (error) {
    logger.error('Failed to create KDA canvas:', error);
    return canvasUtils.createFallbackCanvas(width, height, 'Error');
  }
}

/**
 * Check if currently in an active game
 */
async function isInActiveGame() {
  try {
    // Use cached result if it's less than 2 seconds old
    const now = Date.now();
    if (cachedGameState !== null && (now - lastGameStateCheck) < 2000) {
      return cachedGameState;
    }

    await initializeClient();
    const gameFlow = await client.get('/lol-gameflow/v1/gameflow-phase');
    const isInGame = gameFlow === 'InProgress';
    
    // Cache the result
    cachedGameState = isInGame;
    lastGameStateCheck = now;
    
    return isInGame;
  } catch (error) {
    logger.debug(`Failed to get game flow phase: ${error.message}`);
    // Don't update cache on error, use previous cached value if available
    return cachedGameState !== null ? cachedGameState : false;
  }
}

/**
 * Create a "not in game" canvas for live client keys
 */
async function createNotInGameCanvas(config) {
  const {
    width = 360,
    height = 60,
    title = 'Live Stats',
    backgroundColor = '#0A1428'
  } = config;

  try {
    const canvas = new Canvas(width, height);
    const ctx = canvas.getContext('2d');

    // Draw background
    canvasUtils.drawKeyBackground(ctx, width, height, backgroundColor);

    const centerX = width / 2;
    const centerY = height / 2;

    // Title
    ctx.fillStyle = '#A09B8C';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(title.toUpperCase(), centerX, 8);

    // Main "not in game" message
    ctx.fillStyle = '#5A5A5A';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Not In Game', centerX, centerY);

    // Subtitle
    ctx.fillStyle = '#404040';
    ctx.font = '9px Arial';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Start a match to see live stats', centerX, height - 8);

    return canvas;
  } catch (error) {
    logger.error('Failed to create not in game canvas:', error);
    return canvasUtils.createFallbackCanvas(width, height, 'Error');
  }
}

// ============================================
// TEAM KILLS KEY
// ============================================

/**
 * Initialize Team Kills key
 */
async function initializeTeamKillsKey(serialNumber, keyManager, key) {
  const keyUid = key.uid;
  const keyId = `${serialNumber}-${keyUid}`;

  try {
    await initializeClient();
    
    // Check if client is available for API calls
    if (!client.isAvailable()) {
      logger.info(`League client not available for team kills key ${keyId}, showing offline state`);
      const safeKey = {
        uid: keyUid,
        width: key.width,
        title: 'League Offline',
        style: {
          ...(key.style || {}),
          showImage: false,
          showTitle: true,
          backgroundColor: '#8B0000' // Dark red background
        }
      };
      keyManager.simpleTextDraw(serialNumber, safeKey);
      return;
    }
    
    // Store key data
    keyManager.keyData[keyUid] = key;
    keyManager.activeKeys[keyId] = true;

    // Check if we're in an active game first
    const inActiveGame = await isInActiveGame();
    
    let canvas;
    if (!inActiveGame) {
      // Not in active game - show "not in game" state
      canvas = await createNotInGameCanvas({
        width: key.width || 360,
        height: key.height || 60,
        title: 'Team Kills',
        backgroundColor: key.style?.backgroundColor || '#0A1428'
      });
    } else {
      // In active game - get live data
      const playerList = await getPlayerList();
      const teamKills = calculateTeamKills(playerList);
      
      const riotId = await getCurrentSummonerRiotId();
      const playerTeam = findPlayerTeam(playerList, riotId);

      if (playerList && teamKills) {
        canvas = await createTeamKillsCanvas({
          width: key.width || 360,
          height: key.height || 60,
          orderKills: teamKills.ORDER,
          chaosKills: teamKills.CHAOS,
          playerTeam: playerTeam,
          backgroundColor: key.style?.backgroundColor || '#0A1428'
        });
      } else {
        // API call failed - show not in game state
        canvas = await createNotInGameCanvas({
          width: key.width || 360,
          height: key.height || 60,
          title: 'Team Kills',
          backgroundColor: key.style?.backgroundColor || '#0A1428'
        });
      }
    }

    // Convert to data URL and display
    const dataUrl = await canvasUtils.canvasToDataURL(canvas);
    if (dataUrl) {
      const safeKey = {
        uid: keyUid,
        width: key.width,
        height: key.height,
        style: { 
          ...(key.style || {}),
          showImage: true,
          showTitle: false,
          showIcon: false,
          showEmoji: false
        }
      };
      
      keyManager.simpleDraw(serialNumber, safeKey, dataUrl);
      
      // If we're in an active game, ensure the update timer is running
      if (inActiveGame) {
        startLiveGameUpdateTimer(keyManager);
      }
    }
    
  } catch (error) {
    logger.error('Error initializing team kills key:', error);
    
    const safeKey = {
      uid: keyUid,
      title: 'Team Kills Unavailable',
      style: { showImage: false, showTitle: true }
    };
    keyManager.simpleTextDraw(serialNumber, safeKey);
  }
}

// ============================================
// KDA KEY
// ============================================

/**
 * Initialize KDA key
 */
async function initializeKDAKey(serialNumber, keyManager, key) {
  const keyUid = key.uid;
  const keyId = `${serialNumber}-${keyUid}`;

  try {
    await initializeClient();
    
    // Check if client is available for API calls
    if (!client.isAvailable()) {
      logger.info(`League client not available for KDA key ${keyId}, showing offline state`);
      const safeKey = {
        uid: keyUid,
        width: key.width,
        title: 'League Offline',
        style: {
          ...(key.style || {}),
          showImage: false,
          showTitle: true,
          backgroundColor: '#8B0000' // Dark red background
        }
      };
      keyManager.simpleTextDraw(serialNumber, safeKey);
      return;
    }
    
    // Store key data
    keyManager.keyData[keyUid] = key;
    keyManager.activeKeys[keyId] = true;

    // Check if we're in an active game first
    const inActiveGame = await isInActiveGame();
    
    let canvas;
    if (!inActiveGame) {
      // Not in active game - show "not in game" state
      canvas = await createNotInGameCanvas({
        width: key.width || 360,
        height: key.height || 60,
        title: 'KDA',
        backgroundColor: key.style?.backgroundColor || '#0A1428'
      });
    } else {
      // In active game - get live data
      const riotId = await getCurrentSummonerRiotId();
      
      if (riotId) {
        const scores = await getPlayerScores(riotId);
        if (scores) {
          const { kills = 0, deaths = 0, assists = 0 } = scores;
          const displayText = `${kills}/${deaths}/${assists}`;
          
          // Calculate KDA ratio
          const kda = deaths === 0 ? (kills + assists) : ((kills + assists) / deaths);
          const subtitle = `KDA: ${kda.toFixed(2)}`;

          // Create canvas with live data
          canvas = await createKDACanvas({
            width: key.width || 360,
            height: key.height || 60,
            kills,
            deaths,
            assists,
            backgroundColor: key.style?.backgroundColor || '#0A1428'
          });
        } else {
          // API call failed
          canvas = await createNotInGameCanvas({
            width: key.width || 360,
            height: key.height || 60,
            title: 'KDA',
            backgroundColor: key.style?.backgroundColor || '#0A1428'
          });
        }
      } else {
        // No summoner ID
        canvas = await createNotInGameCanvas({
          width: key.width || 360,
          height: key.height || 60,
          title: 'KDA',
          backgroundColor: key.style?.backgroundColor || '#0A1428'
        });
      }
    }

    // Convert to data URL and display
    const dataUrl = await canvasUtils.canvasToDataURL(canvas);
    if (dataUrl) {
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
      
      // If we're in an active game, ensure the update timer is running
      if (inActiveGame) {
        startLiveGameUpdateTimer(keyManager);
      }
    }
    
  } catch (error) {
    logger.error('Error initializing KDA key:', error);
    
    const safeKey = {
      uid: keyUid,
      title: 'KDA Unavailable',
      style: { showImage: false, showTitle: true }
    };
    keyManager.simpleTextDraw(serialNumber, safeKey);
  }
}

// ============================================
// WARD SCORE KEY
// ============================================

/**
 * Initialize Ward Score key
 */
async function initializeWardScoreKey(serialNumber, keyManager, key) {
  const keyUid = key.uid;
  const keyId = `${serialNumber}-${keyUid}`;

  try {
    await initializeClient();
    
    // Check if client is available for API calls
    if (!client.isAvailable()) {
      logger.info(`League client not available for ward score key ${keyId}, showing offline state`);
      const safeKey = {
        uid: keyUid,
        width: key.width,
        title: 'League Offline',
        style: {
          ...(key.style || {}),
          showImage: false,
          showTitle: true,
          backgroundColor: '#8B0000' // Dark red background
        }
      };
      keyManager.simpleTextDraw(serialNumber, safeKey);
      return;
    }
    
    // Store key data
    keyManager.keyData[keyUid] = key;
    keyManager.activeKeys[keyId] = true;

    // Check if we're in an active game first
    const inActiveGame = await isInActiveGame();
    
    let canvas;
    if (!inActiveGame) {
      // Not in active game - show "not in game" state
      canvas = await createNotInGameCanvas({
        width: key.width || 360,
        height: key.height || 60,
        title: 'Ward Score',
        backgroundColor: key.style?.backgroundColor || '#0A1428'
      });
    } else {
      // In active game - get live data
      const riotId = await getCurrentSummonerRiotId();
      
      if (riotId) {
        const scores = await getPlayerScores(riotId);
        if (scores && typeof scores.wardScore === 'number') {
          const displayText = Math.round(scores.wardScore).toString();
          const subtitle = 'Vision Score';

          // Create canvas with live data
          canvas = await createStatKeyCanvas({
            width: key.width || 360,
            title: 'Ward Score',
            value: displayText,
            subtitle: subtitle,
            backgroundColor: key.style?.backgroundColor || '#0A1428'
          });
        } else {
          // API call failed or no ward score data
          canvas = await createNotInGameCanvas({
            width: key.width || 360,
            height: key.height || 60,
            title: 'Ward Score',
            backgroundColor: key.style?.backgroundColor || '#0A1428'
          });
        }
      } else {
        // No summoner ID
        canvas = await createNotInGameCanvas({
          width: key.width || 360,
          height: key.height || 60,
          title: 'Ward Score',
          backgroundColor: key.style?.backgroundColor || '#0A1428'
        });
      }
    }

    // Convert to data URL and display
    const dataUrl = await canvasUtils.canvasToDataURL(canvas);
    if (dataUrl) {
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
      
      // If we're in an active game, ensure the update timer is running
      if (inActiveGame) {
        startLiveGameUpdateTimer(keyManager);
      }
    }
    
  } catch (error) {
    logger.error('Error initializing ward score key:', error);
    
    const safeKey = {
      uid: keyUid,
      title: 'Ward Score Unavailable',
      style: { showImage: false, showTitle: true }
    };
    keyManager.simpleTextDraw(serialNumber, safeKey);
  }
}

// ============================================
// UPDATE HANDLERS
// ============================================

/**
 * Handle live game data updates
 */
async function handleLiveGameUpdate(keyManager, endpoint, data) {
  logger.debug('Live game update handler called');
  
  // Check if we're in an active game
  const inActiveGame = await isInActiveGame();
  
  if (inActiveGame) {
    logger.debug('In active game - starting live game update timer');
    // Start the timer if not already running
    startLiveGameUpdateTimer(keyManager);
  } else {
    logger.debug('Not in active game - stopping live game updates');
    stopLiveGameUpdateTimer();
    // Clear cache when exiting game
    clearGameStateCache();
    // Update all keys to show "not in game" state
    updateAllLiveGameKeysToNotInGame(keyManager);
  }
}

/**
 * Start the live game update timer
 */
function startLiveGameUpdateTimer(keyManager) {
  if (liveGameUpdateTimer) {
    logger.debug('Live game update timer already running');
    return; // Already running
  }
  
  logger.info('Starting live game updates (3s interval)');
  liveGameUpdateTimer = setInterval(async () => {
    try {
      // Check if we're still in game
      const inGame = await isInActiveGame();
      if (!inGame) {
        logger.debug('No longer in game - stopping updates');
        stopLiveGameUpdateTimer();
        // Update all keys to show "not in game" state
        updateAllLiveGameKeysToNotInGame(keyManager);
        return;
      }
      
      // Debug: Check how many keys we have to update
      const keyCount = Object.keys(keyManager.activeKeys).length;
      logger.debug(`Updating live game data for ${keyCount} active keys`);
      
      // Update live game data efficiently
      await updateLiveGameData(keyManager);
    } catch (error) {
      logger.error('Error in live game update timer:', error);
    }
  }, 3000); // Update every 3 seconds when in game
}

/**
 * Stop the live game update timer
 */
function stopLiveGameUpdateTimer() {
  if (liveGameUpdateTimer) {
    clearInterval(liveGameUpdateTimer);
    liveGameUpdateTimer = null;
    logger.info('Stopped live game updates');
  }
}

/**
 * Update all active live game keys
 */
function updateAllLiveGameKeys(keyManager) {
  Object.keys(keyManager.activeKeys).forEach(keyId => {
    const [serialNumber, keyUid] = keyId.split('-');
    const key = keyManager.keyData[keyUid];
    
    if (!key) return;
    
    // Update live game keys
    if (key.cid === 'com.sondrenjaastad.leagueoflegends.teamkills') {
      initializeTeamKillsKey(serialNumber, keyManager, key);
    } else if (key.cid === 'com.sondrenjaastad.leagueoflegends.kda') {
      initializeKDAKey(serialNumber, keyManager, key);
    } else if (key.cid === 'com.sondrenjaastad.leagueoflegends.wardscore') {
      initializeWardScoreKey(serialNumber, keyManager, key);
    }
  });
}

/**
 * Update all live game keys to show "not in game" state
 */
function updateAllLiveGameKeysToNotInGame(keyManager) {
  Object.keys(keyManager.activeKeys).forEach(keyId => {
    const [serialNumber, keyUid] = keyId.split('-');
    const key = keyManager.keyData[keyUid];
    
    if (!key) return;
    
    // Update live game keys to show "not in game" state
    if (key.cid === 'com.sondrenjaastad.leagueoflegends.teamkills') {
      initializeTeamKillsKey(serialNumber, keyManager, key);
    } else if (key.cid === 'com.sondrenjaastad.leagueoflegends.kda') {
      initializeKDAKey(serialNumber, keyManager, key);
    } else if (key.cid === 'com.sondrenjaastad.leagueoflegends.wardscore') {
      initializeWardScoreKey(serialNumber, keyManager, key);
    }
  });
}

/**
 * Efficiently update live game data for all keys
 */
async function updateLiveGameData(keyManager) {
  try {
    // Get all live data in one batch to avoid repeated API calls
    const [riotId, playerList] = await Promise.all([
      getCurrentSummonerRiotId(),
      getPlayerList()
    ]);

    if (!riotId || !playerList) {
      logger.debug('Failed to get basic live game data, skipping update');
      return;
    }

    // Calculate team kills once
    const teamKills = calculateTeamKills(playerList);
    const playerTeam = findPlayerTeam(playerList, riotId);

    // Get player scores (this might fail, so handle separately)
    let playerScores = null;
    try {
      playerScores = await getPlayerScores(riotId);
    } catch (error) {
      logger.debug('Failed to get player scores, continuing with team data');
    }

    // Find current player data
    const currentPlayer = playerList.find(p => p.riotId === riotId);

    // Update all active keys efficiently - use for...of to properly await async operations
    const keyIds = Object.keys(keyManager.activeKeys);
    
    for (const keyId of keyIds) {
      const [serialNumber, keyUid] = keyId.split('-');
      const key = keyManager.keyData[keyUid];
      
      if (!key) continue;

      try {
        let canvas = null;

        if (key.cid === 'com.sondrenjaastad.leagueoflegends.teamkills') {
          canvas = await createTeamKillsCanvas({
            width: key.width || 360,
            height: key.height || 60,
            orderKills: teamKills.ORDER,
            chaosKills: teamKills.CHAOS,
            playerTeam: playerTeam,
            backgroundColor: key.style?.backgroundColor || '#0A1428'
          });
        } else if (key.cid === 'com.sondrenjaastad.leagueoflegends.kda') {
          if (currentPlayer && currentPlayer.scores) {
            const { kills = 0, deaths = 0, assists = 0 } = currentPlayer.scores;
            canvas = await createKDACanvas({
              width: key.width || 360,
              height: key.height || 60,
              kills,
              deaths,
              assists,
              backgroundColor: key.style?.backgroundColor || '#0A1428'
            });
          }
        } else if (key.cid === 'com.sondrenjaastad.leagueoflegends.wardscore') {
          if (playerScores && typeof playerScores.wardScore === 'number') {
            canvas = await createStatKeyCanvas({
              width: key.width || 360,
              title: 'Ward Score',
              value: Math.round(playerScores.wardScore).toString(),
              subtitle: 'Vision Score',
              backgroundColor: key.style?.backgroundColor || '#0A1428'
            });
          }
        }

        // Update the key if we have new canvas data
        if (canvas) {
          const dataUrl = await canvasUtils.canvasToDataURL(canvas);
          if (dataUrl) {
            const safeKey = {
              uid: keyUid,
              width: key.width,
              height: key.height,
              style: { 
                ...(key.style || {}),
                showImage: true,
                showTitle: false,
                showIcon: false,
                showEmoji: false
              }
            };
            
            keyManager.simpleDraw(serialNumber, safeKey, dataUrl);
            logger.debug(`Updated live game key ${key.cid} with new data`);
          }
        }
      } catch (error) {
        logger.debug(`Failed to update live game key ${key.cid}:`, error.message);
      }
    }

    logger.debug(`Live game data update completed for ${keyIds.length} keys`);

  } catch (error) {
    logger.error('Failed to update live game data:', error);
  }
}

/**
 * Clear the game state cache (useful when game state changes)
 */
function clearGameStateCache() {
  cachedGameState = null;
  lastGameStateCheck = 0;
}

/**
 * Manually trigger live game updates (for testing/debugging)
 */
async function triggerLiveGameUpdate(keyManager) {
  logger.info('Manually triggering live game updates');
  
  try {
    const inActiveGame = await isInActiveGame();
    
    if (inActiveGame) {
      logger.info('In game - starting live updates');
      startLiveGameUpdateTimer(keyManager);
      // Also do an immediate update
      await updateLiveGameData(keyManager);
    } else {
      logger.info('Not in game - showing offline state');
      updateAllLiveGameKeysToNotInGame(keyManager);
    }
  } catch (error) {
    logger.error('Error manually triggering live game update:', error);
  }
}

module.exports = {
  initializeTeamKillsKey,
  initializeKDAKey,
  initializeWardScoreKey,
  handleLiveGameUpdate,
  getPlayerScores,
  getPlayerList,
  calculateTeamKills,
  isInActiveGame,
  createNotInGameCanvas,
  triggerLiveGameUpdate
}; 