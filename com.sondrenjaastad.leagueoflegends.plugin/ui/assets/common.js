/**
 * League of Legends Plugin - Common UI JavaScript
 * Shared functionality across all UI pages
 */

// Plugin API wrapper for consistent error handling
window.PluginAPI = {
    /**
     * Get global plugin settings
     */
    getSettings: function() {
        try {
            return window.pluginApi?.getSettings() || {};
        } catch (error) {
            console.error('Failed to get settings:', error);
            return {};
        }
    },

    /**
     * Save global plugin settings
     */
    saveSettings: function(settings) {
        try {
            return window.pluginApi?.saveSettings(settings);
        } catch (error) {
            console.error('Failed to save settings:', error);
            throw error;
        }
    },

    /**
     * Get key-specific settings
     */
    getKeySettings: function(keyType) {
        try {
            return window.pluginApi?.getKeySettings(keyType) || {};
        } catch (error) {
            console.error(`Failed to get ${keyType} key settings:`, error);
            return {};
        }
    },

    /**
     * Save key-specific settings
     */
    saveKeySettings: function(keyType, settings) {
        try {
            return window.pluginApi?.saveKeySettings(keyType, settings);
        } catch (error) {
            console.error(`Failed to save ${keyType} key settings:`, error);
            throw error;
        }
    },

    /**
     * Test League of Legends client connection
     */
    testConnection: function() {
        try {
            return window.pluginApi?.testConnection() || Promise.resolve(false);
        } catch (error) {
            console.error('Failed to test connection:', error);
            return Promise.resolve(false);
        }
    },

    /**
     * Get current League of Legends data
     */
    getLeagueData: function(endpoint) {
        try {
            return window.pluginApi?.getLeagueData(endpoint) || Promise.resolve(null);
        } catch (error) {
            console.error(`Failed to get League data from ${endpoint}:`, error);
            return Promise.resolve(null);
        }
    }
};

// Status message system
window.StatusManager = {
    /**
     * Show a status message
     */
    show: function(message, type = 'info', duration = 5000) {
        let statusEl = document.getElementById('status');
        
        // Create status element if it doesn't exist
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'status';
            statusEl.className = 'status';
            statusEl.style.display = 'none';
            
            // Insert at the top of the container or body
            const container = document.querySelector('.container') || document.body;
            container.insertBefore(statusEl, container.firstChild);
        }
        
        statusEl.textContent = message;
        statusEl.className = 'status ' + type;
        statusEl.style.display = 'block';
        
        // Auto-hide after duration
        if (duration > 0) {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, duration);
        }
    },

    hide: function() {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
    },

    success: function(message, duration = 5000) {
        this.show(message, 'success', duration);
    },

    error: function(message, duration = 7000) {
        this.show(message, 'error', duration);
    },

    warning: function(message, duration = 6000) {
        this.show(message, 'warning', duration);
    },

    info: function(message, duration = 5000) {
        this.show(message, 'info', duration);
    }
};

// Form utilities
window.FormUtils = {
    /**
     * Load settings into form elements
     */
    loadSettings: function(settings, prefix = '') {
        Object.keys(settings).forEach(key => {
            const element = document.getElementById(prefix + key);
            if (!element) return;

            const value = settings[key];
            
            switch (element.type) {
                case 'checkbox':
                    element.checked = Boolean(value);
                    break;
                case 'radio':
                    if (element.value === value) {
                        element.checked = true;
                    }
                    break;
                case 'number':
                case 'range':
                    element.value = Number(value) || 0;
                    break;
                default:
                    element.value = value || '';
            }
        });
    },

    /**
     * Gather settings from form elements
     */
    gatherSettings: function(prefix = '') {
        const settings = {};
        const inputs = document.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
            let key = input.id;
            if (prefix && key.startsWith(prefix)) {
                key = key.substring(prefix.length);
            }
            
            if (!key) return;

            switch (input.type) {
                case 'checkbox':
                    settings[key] = input.checked;
                    break;
                case 'radio':
                    if (input.checked) {
                        settings[key] = input.value;
                    }
                    break;
                case 'number':
                case 'range':
                    settings[key] = Number(input.value) || 0;
                    break;
                default:
                    settings[key] = input.value;
            }
        });
        
        return settings;
    },

    /**
     * Add change listeners to form elements
     */
    addChangeListeners: function(callback) {
        const inputs = document.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('change', callback);
            if (input.type === 'text' || input.type === 'textarea') {
                input.addEventListener('input', callback);
            }
        });
    }
};

// Preview system for key configurations
window.PreviewManager = {
    /**
     * Update key preview based on current settings
     */
    updateKeyPreview: function(keyType, settings) {
        const previewKey = document.getElementById('previewKey');
        if (!previewKey) return;

        // Update based on key type
        switch (keyType) {
            case 'summoner':
                this.updateSummonerPreview(previewKey, settings);
                break;
            case 'rank':
                this.updateRankPreview(previewKey, settings);
                break;
            case 'wallet':
                this.updateWalletPreview(previewKey, settings);
                break;
            case 'gameStats':
                this.updateGameStatsPreview(previewKey, settings);
                break;
        }
    },

    updateSummonerPreview: function(previewKey, settings) {
        const textEl = previewKey.querySelector('#previewText');
        const levelEl = previewKey.querySelector('#previewLevel');
        const iconEl = previewKey.querySelector('.preview-icon');
        
        if (textEl) {
            textEl.textContent = settings.hideWhenStreaming ? 
                (settings.fallbackText || 'Player') : 'RiotPlayer';
            
            // Update text size
            const sizes = { small: '9px', medium: '10px', large: '11px' };
            textEl.style.fontSize = sizes[settings.textSize] || '10px';
        }
        
        if (levelEl) {
            levelEl.style.display = settings.showLevel ? 'block' : 'none';
        }
        
        if (iconEl) {
            iconEl.style.display = settings.showIcon ? 'block' : 'none';
        }
    },

    updateRankPreview: function(previewKey, settings) {
        const textEl = previewKey.querySelector('#previewText');
        const subtextEl = previewKey.querySelector('#previewSubtext');
        
        if (textEl) {
            textEl.textContent = 'Gold IV';
        }
        
        if (subtextEl) {
            subtextEl.style.display = settings.showLP ? 'block' : 'none';
            subtextEl.textContent = '67 LP';
        }
    },

    updateWalletPreview: function(previewKey, settings) {
        const textEl = previewKey.querySelector('#previewText');
        const subtextEl = previewKey.querySelector('#previewSubtext');
        
        if (textEl) {
            const amount = settings.shortCurrency ? '1.2K' : '1,234';
            textEl.textContent = `${amount} BE`;
        }
        
        if (subtextEl && settings.showOE) {
            subtextEl.style.display = 'block';
            const oeAmount = settings.shortCurrency ? '567' : '567';
            subtextEl.textContent = `${oeAmount} OE`;
        }
    },

    updateGameStatsPreview: function(previewKey, settings) {
        const textEl = previewKey.querySelector('#previewText');
        
        if (textEl) {
            switch (settings.statType) {
                case 'kda':
                    textEl.textContent = '5/2/7';
                    break;
                case 'teamKills':
                    textEl.textContent = '12 Kills';
                    break;
                case 'wardScore':
                    textEl.textContent = 'Ward: 45';
                    break;
                default:
                    textEl.textContent = 'N/A';
            }
        }
    }
};

// Connection status checker
window.ConnectionChecker = {
    isChecking: false,
    
    /**
     * Test connection to League of Legends client
     */
    async testConnection() {
        if (this.isChecking) return;
        
        this.isChecking = true;
        const statusEl = document.getElementById('connectionStatus');
        
        try {
            StatusManager.info('Testing connection to League of Legends client...');
            
            if (statusEl) {
                statusEl.innerHTML = '<p class="pulse">Connecting...</p>';
            }
            
            const connected = await PluginAPI.testConnection();
            
            if (connected) {
                if (statusEl) {
                    statusEl.innerHTML = 
                        '<p style="color: var(--lol-blue-light);">✅ Connected to League of Legends client</p>';
                }
                StatusManager.success('Connection test successful!');
            } else {
                if (statusEl) {
                    statusEl.innerHTML = 
                        '<p style="color: var(--lol-gold-light);">❌ Could not connect to League of Legends client</p>' +
                        '<p style="color: var(--lol-gray-light); font-size: 12px;">Make sure League of Legends is running and try again.</p>';
                }
                StatusManager.warning('Connection test failed. Make sure League of Legends is running.');
            }
        } catch (error) {
            console.error('Connection test error:', error);
            if (statusEl) {
                statusEl.innerHTML = 
                    '<p style="color: var(--lol-gold-light);">❌ Connection test failed</p>' +
                    '<p style="color: var(--lol-gray-light); font-size: 12px;">Error: ' + error.message + '</p>';
            }
            StatusManager.error('Connection test failed: ' + error.message);
        } finally {
            this.isChecking = false;
        }
    },

    /**
     * Auto-check connection status
     */
    autoCheck() {
        setTimeout(() => this.testConnection(), 1000);
    }
};

// Utility functions
window.Utils = {
    /**
     * Format numbers with thousand separators
     */
    formatNumber: function(num, short = false) {
        if (typeof num !== 'number') return '0';
        
        if (short) {
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1) + 'M';
            } else if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'K';
            }
        }
        
        return num.toLocaleString();
    },

    /**
     * Debounce function calls
     */
    debounce: function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Deep merge objects
     */
    deepMerge: function(target, source) {
        const output = Object.assign({}, target);
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    },

    isObject: function(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
};

// Initialize common functionality when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Add fade-in animation to all sections
    const sections = document.querySelectorAll('.section');
    sections.forEach((section, index) => {
        setTimeout(() => {
            section.classList.add('fade-in');
        }, index * 100);
    });
    
    // Auto-check connection if connection status element exists
    if (document.getElementById('connectionStatus')) {
        ConnectionChecker.autoCheck();
    }
});

// Global error handler for unhandled promises
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    StatusManager.error('An unexpected error occurred: ' + event.reason.message);
});

// Export for modules if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PluginAPI,
        StatusManager,
        FormUtils,
        PreviewManager,
        ConnectionChecker,
        Utils
    };
} 