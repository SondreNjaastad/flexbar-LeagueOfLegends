import copy from 'rollup-plugin-copy';
import { createDefaultConfig } from '@eniac/flexdesigner/lib/rollup-config';
import path from 'path';

const config = createDefaultConfig({
  input: 'src/plugin.js',
  output: {
    dir: 'dist',
    format: 'cjs',
    sourcemap: true
  }
});

// Define plugin directory path
const pluginDir = path.join(process.cwd(), 'com.sondrenjaastad.leagueoflegends.plugin');

// Add the copy plugin to copy assets
config.plugins.push(
  copy({
    targets: [
      // Copy to dist folder for development
      { src: 'src/assets/*', dest: 'dist/assets' },
      // Copy to plugin folder for production
      { src: 'src/assets/*', dest: path.join(pluginDir, 'assets') }
    ],
    verbose: true
  })
);

export default config; 