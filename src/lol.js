/**
 * Legacy LoL Client Compatibility Layer
 * 
 * This module provides backward compatibility for the existing key implementations
 * that expect the old LCUClient interface. It bridges to the new LoLDataService.
 */

const logger = require('./utils/logger');

// Global reference to the LoLDataService instance
let lolDataService = null;

/**
 * Set the LoLDataService instance for compatibility
 */
function setLoLDataService(dataService) {
  lolDataService = dataService;
  logger.debug('LoL Data Service set for legacy compatibility');
}

/**
 * Legacy client object that mimics the old LCUClient interface
 */
const client = {
  /**
   * Check if the client is available
   */
  isAvailable: () => {
    return lolDataService && lolDataService.isConnected;
  },

  /**
   * Get cached data for an endpoint
   */
  async getCachedData(endpoint) {
    if (!lolDataService || !lolDataService.isConnected) {
      throw new Error('League client not available');
    }
    
    // For compatibility, we'll try to get cached data or make a fresh request
    const cachedData = lolDataService.getCachedData(endpoint);
    if (cachedData) {
      return cachedData;
    }
    
    // If no cached data, log a warning since the old system expected cached data
    logger.warn(`No cached data available for ${endpoint}, this may cause issues with legacy keys`);
    return null;
  },

  /**
   * Get Data Dragon resource (legacy compatibility)
   */
  async getCachedDataDragonResource(resourcePath) {
    const axios = require('axios');
    const path = require('path');
    const fs = require('fs');
    
    try {
      // Get the current version from the LoL Data Service
      const version = lolDataService?.version || '15.10.1';
      
      // Construct full Data Dragon URL
      const fullUrl = resourcePath.includes('ddragon.leagueoflegends.com') 
        ? resourcePath 
        : `https://ddragon.leagueoflegends.com/cdn/${version}/${resourcePath}`;
      
      logger.debug(`Fetching Data Dragon resource: ${fullUrl}`);
      
      // Fetch the resource
      const response = await axios.get(fullUrl, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
      
      if (!response.data || response.data.length === 0) {
        throw new Error('Empty response received from Data Dragon');
      }
      
      const buffer = Buffer.from(response.data);
      logger.debug(`Successfully fetched Data Dragon resource: ${resourcePath}, size: ${buffer.length} bytes`);
      
      return buffer;
      
    } catch (error) {
      logger.error(`Failed to fetch Data Dragon resource ${resourcePath}:`, error.message);
      throw error;
    }
  },

  /**
   * Make a direct request to an endpoint
   */
  async request(endpoint) {
    if (!lolDataService || !lolDataService.axios) {
      throw new Error('League client not available');
    }
    
    try {
      const response = await lolDataService.axios.get(endpoint);
      return response.data;
    } catch (error) {
      logger.error(`Legacy client request failed for ${endpoint}:`, error.message);
      throw error;
    }
  },

  /**
   * GET request (legacy compatibility)
   */
  async get(endpoint) {
    return this.request(endpoint);
  },

  /**
   * Get Live Client Data (for in-game stats)
   */
  async getLiveClientData(endpoint) {
    // Live Client Data API uses a different port and has no auth
    const axios = require('axios');
    const https = require('https');
    
    try {
      const response = await axios.get(`https://127.0.0.1:2999${endpoint}`, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 2000
      });
      return response.data;
    } catch (error) {
      // Only log as debug for expected errors (API not available when not in game)
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        logger.debug(`Live Client Data API not available: ${error.message}`);
      } else {
        logger.debug(`Live Client Data request failed for ${endpoint}:`, error.message);
      }
      throw new Error(`Live Client Data API not available: ${error.message}`);
    }
  },

  /**
   * Get wallet information (legacy compatibility)
   */
  async getWallet() {
    try {
      // Try the inventory endpoint first
      const currencyParams = encodeURIComponent(JSON.stringify(["ip", "rp"]));
      const wallet = await this.get(`/lol-inventory/v1/wallet?currencyTypes=${currencyParams}`);
      
      return {
        rp: wallet.RP || 0,
        ip: wallet.lol_blue_essence || 0,
        mythicEssence: wallet.lol_mythic_essence || 0,
        orangeEssence: wallet.lol_orange_essence || 0
      };
    } catch (error) {
      logger.warn(`Failed to get wallet: ${error.message}`);
      return { rp: 0, ip: 0 };
    }
  }
};

/**
 * Initialize client (legacy compatibility)
 */
async function initializeClient() {
  if (!lolDataService) {
    logger.warn('LoL Data Service not set for legacy client initialization');
    return;
  }
  
  // The new service should already be initialized
  logger.debug('Legacy client initialized (using LoL Data Service)');
}

module.exports = {
  client,
  initializeClient,
  setLoLDataService
}; 