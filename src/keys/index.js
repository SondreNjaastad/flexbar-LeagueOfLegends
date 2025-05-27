/**
 * Key Implementations Index
 * Exports all key implementations for easy importing
 */

const logger = require('../utils/logger');
const summonerKey = require('./summonerKey');
const rankKey = require('./rankKey');
const walletKey = require('./walletKey');
const liveGameKeys = require('./liveGameKeys');

/**
 * Game Stats Key stub implementation
 * @param {string} serialNumber Device serial number
 * @param {object} keyManager Key manager instance
 * @param {object} key Key data
 */
async function initializeGameStatsKey(serialNumber, keyManager, key) {
  const keyUid = key.uid;
  logger.info(`Game stats key not implemented for ${serialNumber}-${keyUid}, showing placeholder`);
  
  const safeKey = {
    uid: keyUid,
    width: key.width,
    title: 'Game Stats Coming Soon',
    style: {
      ...(key.style || {}),
      showImage: false,
      showTitle: true
    }
  };
  keyManager.simpleTextDraw(serialNumber, safeKey);
}

/**
 * Game Stats update handler stub
 */
function handleGameStatsUpdate(keyManager, data) {
  // Stub - not implemented
}

/**
 * Game flow update handler stub  
 */
function handleGameflowUpdate(keyManager, data) {
  // Stub - not implemented
}

module.exports = {
  // Summoner Key
  initializeSummonerKey: summonerKey.initializeSummonerKey,
  handleSummonerUpdate: summonerKey.handleSummonerUpdate,
  
  // Rank Key
  initializeRankKey: rankKey.initializeRankKey,
  handleRankedUpdate: rankKey.handleRankedUpdate,
  handleRankKeyInteraction: rankKey.handleRankKeyInteraction,
  
  // Wallet Key
  initializeWalletKey: walletKey.initializeWalletKey,
  handleWalletUpdate: walletKey.handleWalletUpdate,
  
  // Game Stats Key (stub - returns placeholder)
  initializeGameStatsKey: async function(serialNumber, keyManager, key) {
    const keyUid = key.uid;
    logger.info(`Game stats key not implemented for ${serialNumber}-${keyUid}, showing placeholder`);
    
    const safeKey = {
      uid: keyUid,
      width: key.width,
      title: 'Game Stats Coming Soon',
      style: {
        ...(key.style || {}),
        showImage: false,
        showTitle: true
      }
    };
    keyManager.simpleTextDraw(serialNumber, safeKey);
  },
  
  // Live Game Keys
  initializeTeamKillsKey: liveGameKeys.initializeTeamKillsKey,
  initializeKDAKey: liveGameKeys.initializeKDAKey,
  initializeWardScoreKey: liveGameKeys.initializeWardScoreKey,
  handleLiveGameUpdate: liveGameKeys.handleLiveGameUpdate
}; 