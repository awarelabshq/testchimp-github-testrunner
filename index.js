#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Check if we're in a GitHub Actions environment
if (process.env.GITHUB_ACTIONS === 'true') {
  // In GitHub Actions, build and run
  const actionPath = process.env.GITHUB_ACTION_PATH || __dirname;
  
  try {
    console.log('🔨 Building TestChimp Action...');
    execSync('npm run build', { 
      cwd: actionPath, 
      stdio: 'inherit' 
    });
    
    console.log('🚀 Running TestChimp Action...');
    require(path.join(actionPath, 'dist', 'index.js'));
  } catch (error) {
    console.error('❌ TestChimp Action failed:', error.message);
    process.exit(1);
  }
} else {
  // Local development - run directly
  require('./dist/index.js');
}
