const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { exec } = require('child_process');
const axios = require('axios');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

/**
 * LoL Data Service - Handles all League of Legends client communication
 * 
 * Events:
 * - 'connectionChanged': { connected: boolean, reason?: string }
 * - 'dataUpdated': { type: string, data: any, timestamp: number }
 * - 'gameStateChanged': { phase: string, previous?: string }
 * - 'error': { message: string, code?: string, recoverable: boolean }
 */
class LoLDataService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      reconnectDelay: 2000,
      maxReconnectAttempts: 5,
      processMonitorFrequency: 3000,
      endpointConfig: [
        { endpoint: '/lol-summoner/v1/current-summoner', interval: 5000, type: 'summoner' },
        { endpoint: '/lol-gameflow/v1/gameflow-phase', interval: 2000, type: 'gameflow' },
        { endpoint: '/lol-champ-select/v1/session', interval: 1000, type: 'champselect', suppressErrors: true },
        { endpoint: '/lol-ranked/v1/current-ranked-stats', interval: 5000, type: 'ranked' },
        { endpoint: '/lol-inventory/v1/wallet', interval: 10000, type: 'wallet', suppressErrors: true }
      ],
      ...options
    };

    // Connection state
    this.isConnected = false;
    this.isInitialized = false;
    this.connectionAttempts = 0;
    
    // League client details
    this.port = null;
    this.password = null;
    this.baseURL = null;
    this.axios = null;
    this.version = null;
    
    // Monitoring and polling
    this.processMonitor = null;
    this.endpointPollers = new Map();
    this.lastKnownGameState = null;
    
    // Data cache with timestamps
    this.dataCache = new Map();
    
    // Bind methods to preserve context
    this.handleProcessCheck = this.handleProcessCheck.bind(this);
    this.handleEndpointPoll = this.handleEndpointPoll.bind(this);
  }

  /**
   * Initialize the service and start monitoring
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('LoLDataService already initialized');
      return;
    }

    logger.info('Initializing LoL Data Service...');
    
    try {
      // Start process monitoring first
      this.startProcessMonitoring();
      
      // Try to connect if League is running
      await this.attemptConnection();
      
      this.isInitialized = true;
      logger.info('LoL Data Service initialized successfully');
      
    } catch (error) {
      logger.info('League client not running - monitoring for startup');
      this.isInitialized = true;
      // Continue monitoring for League to start
    }
  }

  /**
   * Attempt to connect to League client
   */
  async attemptConnection() {
    try {
      await this.discoverConnection();
      await this.setupAxiosClient();
      await this.validateConnection();
      await this.getLatestVersion();
      
      this.setConnectionState(true, 'Connected successfully');
      this.startEndpointPolling();
      this.connectionAttempts = 0;
      
    } catch (error) {
      this.setConnectionState(false, error.message);
      throw error;
    }
  }

  /**
   * Discover League client connection details
   */
  async discoverConnection() {
    try {
      await this.discoverFromLockfile();
    } catch (error) {
      logger.debug('Lockfile discovery failed, trying process list');
      await this.discoverFromProcessList();
    }
  }

  /**
   * Try to get connection details from lockfile
   */
  async discoverFromLockfile() {
    const lockPath = this.getDefaultLockfilePath();
    
    try {
      const data = await fs.promises.readFile(lockPath, 'utf8');
      const [, , port, password, protocol] = data.trim().split(':');
      
      this.port = port;
      this.password = password;
      this.protocol = protocol || 'https';
      
      logger.debug(`Discovered connection from lockfile: port ${port}`);
    } catch (error) {
      throw new Error('Lockfile not found or unreadable');
    }
  }

  /**
   * Get default lockfile path based on platform
   */
  getDefaultLockfilePath() {
    const platform = process.platform;
    if (platform === 'win32') {
      return path.join(process.env.LOCALAPPDATA, 'Riot Games', 'League of Legends', 'lockfile');
    } else if (platform === 'darwin') {
      return path.join(process.env.HOME, 'Library', 'Application Support', 'Riot Games', 'League of Legends', 'lockfile');
    }
    return path.join(process.env.HOME, '.config', 'leagueclient', 'lockfile');
  }

  /**
   * Discover connection details from process list
   */
  async discoverFromProcessList() {
    const cmd = process.platform === 'win32'
      ? 'wmic PROCESS WHERE name="LeagueClientUx.exe" GET commandline'
      : 'ps -A | grep LeagueClientUx';
    
    try {
      const { stdout } = await execAsync(cmd);
      
      if (!stdout || stdout.trim().length === 0) {
        throw new Error('League client process not found');
      }
      
      const portMatch = stdout.match(/--app-port=(\d+)/);
      const tokenMatch = stdout.match(/--remoting-auth-token=([\w-]+)/);
      
      if (!portMatch || !tokenMatch) {
        throw new Error('League client process found but connection details not available');
      }
      
      this.port = portMatch[1];
      this.password = tokenMatch[1];
      this.protocol = 'https';
      
      logger.debug(`Discovered connection from process list: port ${this.port}`);
      
    } catch (error) {
      if (error.message.includes('League client process')) {
        throw error;
      }
      throw new Error('League client process not found');
    }
  }

  /**
   * Setup axios client for API communication
   */
  async setupAxiosClient() {
    this.baseURL = `${this.protocol}://127.0.0.1:${this.port}`;
    
    this.axios = axios.create({
      baseURL: this.baseURL,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
      auth: { username: 'riot', password: this.password },
      headers: { 'Accept': 'application/json' },
      timeout: 5000
    });
  }

  /**
   * Validate the connection by making a test request
   */
  async validateConnection() {
    try {
      await this.axios.get('/lol-summoner/v1/current-summoner');
    } catch (error) {
      throw new Error('Connection validation failed');
    }
  }

  /**
   * Get latest League version from Data Dragon
   */
  async getLatestVersion() {
    try {
      const response = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json', {
        timeout: 5000
      });
      this.version = response.data[0];
      logger.info(`Retrieved League version: ${this.version}`);
    } catch (error) {
      this.version = '15.10.1'; // Fallback version
      logger.warn(`Failed to get version, using fallback: ${this.version}`);
    }
  }

  /**
   * Start monitoring League process
   */
  startProcessMonitoring() {
    if (this.processMonitor) {
      return;
    }

    logger.info('Starting process monitoring...');
    this.processMonitor = setInterval(this.handleProcessCheck, this.options.processMonitorFrequency);
  }

  /**
   * Handle periodic process checks
   */
  async handleProcessCheck() {
    try {
      const isRunning = await this.isLeagueProcessRunning();
      
      // Handle state changes
      if (isRunning && !this.isConnected) {
        logger.info('League process detected - attempting connection');
        await this.handleReconnection();
      } else if (!isRunning && this.isConnected) {
        logger.info('League process stopped - handling disconnection');
        await this.handleDisconnection();
      }
      
    } catch (error) {
      logger.debug('Process check error:', error.message);
    }
  }

  /**
   * Check if League process is running
   */
  async isLeagueProcessRunning() {
    const cmd = process.platform === 'win32'
      ? 'tasklist /FI "IMAGENAME eq LeagueClientUx.exe" /FO CSV'
      : 'pgrep -f LeagueClientUx';
    
    try {
      const { stdout } = await execAsync(cmd);
      return stdout && stdout.trim().length > 0 && !stdout.includes('No tasks');
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle reconnection when League starts
   */
  async handleReconnection() {
    if (this.connectionAttempts >= this.options.maxReconnectAttempts) {
      logger.warn('Max reconnection attempts reached');
      return;
    }

    this.connectionAttempts++;
    
    try {
      // Add delay for reconnection attempts
      if (this.connectionAttempts > 1) {
        const delay = this.options.reconnectDelay * this.connectionAttempts;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      await this.attemptConnection();
      logger.info('Successfully reconnected to League client');
      
    } catch (error) {
      logger.debug(`Reconnection attempt ${this.connectionAttempts} failed:`, error.message);
      
      // Schedule next attempt if we haven't exceeded max attempts
      if (this.connectionAttempts < this.options.maxReconnectAttempts) {
        setTimeout(() => this.handleReconnection(), this.options.reconnectDelay);
      }
    }
  }

  /**
   * Handle disconnection when League stops
   */
  async handleDisconnection() {
    this.setConnectionState(false, 'League process stopped');
    this.stopEndpointPolling();
    this.resetConnectionDetails();
  }

  /**
   * Start polling all configured endpoints
   */
  startEndpointPolling() {
    logger.info('Starting endpoint polling...');
    
    this.options.endpointConfig.forEach(config => {
      const poller = setInterval(() => {
        this.handleEndpointPoll(config);
      }, config.interval);
      
      this.endpointPollers.set(config.endpoint, poller);
      
      // Immediately poll once
      this.handleEndpointPoll(config);
    });
  }

  /**
   * Handle individual endpoint polling
   */
  async handleEndpointPoll(config) {
    if (!this.isConnected || !this.axios) {
      return;
    }

    try {
      const response = await this.axios.get(config.endpoint);
      const data = response.data;
      const timestamp = Date.now();
      
      // Cache the data
      const cacheKey = config.type;
      const previousData = this.dataCache.get(cacheKey);
      this.dataCache.set(cacheKey, { data, timestamp });
      
      // Emit data update event
      this.emit('dataUpdated', {
        type: config.type,
        endpoint: config.endpoint,
        data,
        timestamp,
        previousData: previousData?.data
      });
      
      // Handle special game state tracking
      if (config.type === 'gameflow') {
        this.handleGameStateChange(data, previousData?.data);
      }
      
    } catch (error) {
      if (!config.suppressErrors) {
        logger.debug(`Error polling ${config.endpoint}:`, error.message);
      }
      
      // Emit error event for non-suppressed errors
      if (!config.suppressErrors) {
        this.emit('error', {
          message: `Failed to poll ${config.endpoint}: ${error.message}`,
          code: 'POLLING_ERROR',
          recoverable: true,
          endpoint: config.endpoint
        });
      }
    }
  }

  /**
   * Handle game state changes
   */
  handleGameStateChange(currentState, previousState) {
    if (currentState !== previousState) {
      this.lastKnownGameState = currentState;
      
      this.emit('gameStateChanged', {
        phase: currentState,
        previous: previousState,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Stop polling all endpoints
   */
  stopEndpointPolling() {
    logger.info('Stopping endpoint polling...');
    
    this.endpointPollers.forEach((poller, endpoint) => {
      clearInterval(poller);
    });
    
    this.endpointPollers.clear();
  }

  /**
   * Set connection state and emit event
   */
  setConnectionState(connected, reason = '') {
    const wasConnected = this.isConnected;
    this.isConnected = connected;
    
    if (wasConnected !== connected) {
      logger.info(`Connection state changed: ${connected ? 'CONNECTED' : 'DISCONNECTED'} - ${reason}`);
      
      this.emit('connectionChanged', {
        connected,
        reason,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Reset connection details
   */
  resetConnectionDetails() {
    this.port = null;
    this.password = null;
    this.baseURL = null;
    this.axios = null;
  }

  /**
   * Get cached data for a specific type
   */
  getCachedData(type) {
    const cached = this.dataCache.get(type);
    return cached ? cached.data : null;
  }

  /**
   * Get connection status
   */
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      initialized: this.isInitialized,
      port: this.port,
      version: this.version,
      gameState: this.lastKnownGameState,
      cacheSize: this.dataCache.size
    };
  }

  /**
   * Force a reconnection attempt
   */
  async forceReconnect() {
    logger.info('Forcing reconnection...');
    
    if (this.isConnected) {
      await this.handleDisconnection();
    }
    
    this.connectionAttempts = 0;
    await this.handleReconnection();
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    logger.info('Shutting down LoL Data Service...');
    
    // Stop process monitoring
    if (this.processMonitor) {
      clearInterval(this.processMonitor);
      this.processMonitor = null;
    }
    
    // Stop endpoint polling
    this.stopEndpointPolling();
    
    // Clear cache
    this.dataCache.clear();
    
    // Reset state
    this.setConnectionState(false, 'Service shutdown');
    this.resetConnectionDetails();
    this.isInitialized = false;
    
    // Remove all listeners
    this.removeAllListeners();
    
    logger.info('LoL Data Service shutdown complete');
  }
}

module.exports = LoLDataService; 