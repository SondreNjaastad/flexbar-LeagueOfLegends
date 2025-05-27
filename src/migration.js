const fs = require('fs').promises;
const path = require('path');
const logger = require('./utils/logger');

/**
 * Migration Script
 * 
 * Helps transition from the old plugin structure to the new architecture.
 * This script can be run to clean up old files and prepare for the new structure.
 */

class PluginMigration {
  constructor() {
    this.oldFiles = [
      'src/lol.js',
      'src/plugin.js', 
      'src/keymanager.js',
      'src/loggerWrapper.js',
      'src/utils.js',
      'src/canvasRenderer.js',
      'src/championDisplay.js',
      'src/keyExamples.js'
    ];

    this.filesToKeep = [
      'src/keys/', // Keep existing key implementations for reference
    ];

    this.backupDir = 'backup-old-structure';
  }

  /**
   * Run the migration
   */
  async migrate() {
    logger.info('Starting plugin migration...');

    try {
      // Create backup directory
      await this.createBackup();

      // Move old files to backup
      await this.backupOldFiles();

      // Create README for migration
      await this.createMigrationReadme();

      logger.info('Migration completed successfully!');
      logger.info(`Old files backed up to: ${this.backupDir}`);
      logger.info('You can now test the new plugin structure');

    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  /**
   * Create backup directory
   */
  async createBackup() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
      logger.info(`Created backup directory: ${this.backupDir}`);
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Backup old files
   */
  async backupOldFiles() {
    for (const filePath of this.oldFiles) {
      try {
        // Check if file exists
        await fs.access(filePath);
        
        // Create backup path
        const backupPath = path.join(this.backupDir, filePath);
        const backupDir = path.dirname(backupPath);
        
        // Ensure backup directory exists
        await fs.mkdir(backupDir, { recursive: true });
        
        // Move file to backup
        await fs.rename(filePath, backupPath);
        
        logger.info(`Backed up: ${filePath} -> ${backupPath}`);
        
      } catch (error) {
        if (error.code === 'ENOENT') {
          logger.debug(`File not found (skipping): ${filePath}`);
        } else {
          logger.warn(`Failed to backup ${filePath}:`, error.message);
        }
      }
    }
  }

  /**
   * Create migration README
   */
  async createMigrationReadme() {
    const readmeContent = `# Plugin Migration

This directory contains the old plugin structure that was backed up during migration.

## Migration Date
${new Date().toISOString()}

## New Architecture

The plugin has been completely overhauled with the following structure:

### Services
- **LoLDataService** (\`src/services/LoLDataService.js\`) - Handles all League client communication
- **KeyService** (\`src/services/KeyService.js\`) - Manages key rendering and state
- **StateManager** (\`src/services/StateManager.js\`) - Centralized state management with persistence

### Core
- **PluginCore** (\`src/PluginCore.js\`) - Main plugin coordinator
- **KeyHandlers** (\`src/handlers/KeyHandlers.js\`) - Process data updates and coordinate rendering

### Utilities
- **Logger** (\`src/utils/logger.js\`) - Centralized logging system

### Entry Point
- **Index** (\`src/index.js\`) - Main entry point with proper error handling

## Key Benefits

1. **Separation of Concerns**: Clear separation between data collection, processing, and rendering
2. **Robust Error Handling**: Proper error recovery and graceful degradation
3. **State Management**: Centralized state with persistence
4. **Event-Driven Architecture**: Clean event flow between components
5. **Professional Structure**: Follows modern software architecture principles

## Testing the Migration

1. The new plugin should automatically start with the new architecture
2. All key functionality should be preserved
3. Better handling of League client disconnections/reconnections
4. Improved logging and debugging capabilities

## Rollback Instructions

If you need to rollback to the old structure:

1. Stop the plugin
2. Move files from this backup directory back to their original locations
3. Update your entry point to use the old plugin.js structure

## Old File Mapping

`;

    // Add file mapping
    const mapping = this.oldFiles.map(file => `- \`${file}\` -> \`${this.backupDir}/${file}\``).join('\n');
    
    const fullContent = readmeContent + mapping + `

## Next Steps

1. Test the new plugin thoroughly
2. If everything works correctly, you can safely delete this backup directory
3. Consider updating any documentation or deployment scripts to use the new structure
`;

    await fs.writeFile(path.join(this.backupDir, 'README.md'), fullContent, 'utf8');
    logger.info('Created migration README');
  }

  /**
   * Rollback migration (restore old files)
   */
  async rollback() {
    logger.info('Rolling back migration...');

    try {
      for (const filePath of this.oldFiles) {
        const backupPath = path.join(this.backupDir, filePath);
        
        try {
          // Check if backup exists
          await fs.access(backupPath);
          
          // Ensure original directory exists
          const originalDir = path.dirname(filePath);
          await fs.mkdir(originalDir, { recursive: true });
          
          // Restore file
          await fs.rename(backupPath, filePath);
          
          logger.info(`Restored: ${backupPath} -> ${filePath}`);
          
        } catch (error) {
          if (error.code === 'ENOENT') {
            logger.debug(`Backup not found (skipping): ${backupPath}`);
          } else {
            logger.warn(`Failed to restore ${backupPath}:`, error.message);
          }
        }
      }

      logger.info('Rollback completed successfully!');
      logger.info('Old plugin structure has been restored');

    } catch (error) {
      logger.error('Rollback failed:', error);
      throw error;
    }
  }

  /**
   * Check migration status
   */
  async checkStatus() {
    logger.info('Checking migration status...');

    const status = {
      backupExists: false,
      oldFilesPresent: 0,
      newFilesPresent: 0,
      migrationNeeded: false
    };

    // Check if backup directory exists
    try {
      await fs.access(this.backupDir);
      status.backupExists = true;
    } catch (error) {
      // Backup doesn't exist
    }

    // Check old files
    for (const filePath of this.oldFiles) {
      try {
        await fs.access(filePath);
        status.oldFilesPresent++;
      } catch (error) {
        // File doesn't exist
      }
    }

    // Check new files
    const newFiles = [
      'src/services/LoLDataService.js',
      'src/services/KeyService.js',
      'src/services/StateManager.js',
      'src/PluginCore.js',
      'src/handlers/KeyHandlers.js',
      'src/utils/logger.js',
      'src/index.js'
    ];

    for (const filePath of newFiles) {
      try {
        await fs.access(filePath);
        status.newFilesPresent++;
      } catch (error) {
        // File doesn't exist
      }
    }

    status.migrationNeeded = status.oldFilesPresent > 0 && status.newFilesPresent === newFiles.length;

    logger.info('Migration Status:', status);
    return status;
  }
}

// Export for use as module
module.exports = PluginMigration;

// Run migration if called directly
if (require.main === module) {
  const migration = new PluginMigration();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'migrate':
      migration.migrate().catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
      });
      break;
      
    case 'rollback':
      migration.rollback().catch(error => {
        console.error('Rollback failed:', error);
        process.exit(1);
      });
      break;
      
    case 'status':
      migration.checkStatus().catch(error => {
        console.error('Status check failed:', error);
        process.exit(1);
      });
      break;
      
    default:
      console.log('Usage: node migration.js [migrate|rollback|status]');
      console.log('  migrate  - Backup old files and prepare for new structure');
      console.log('  rollback - Restore old files from backup');
      console.log('  status   - Check current migration status');
      process.exit(1);
  }
} 