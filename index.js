#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

// Check if we're in a GitHub Actions environment
if (process.env.GITHUB_ACTIONS === 'true') {
  // In GitHub Actions, run TypeScript directly to avoid bundling issues
  const actionPath = process.env.GITHUB_ACTION_PATH || __dirname;
  
  try {
    console.log('📦 Installing dependencies...');
    execSync('npm ci', { 
      cwd: actionPath, 
      stdio: 'inherit' 
    });
    
    console.log('🚀 Running TestChimp Action (TypeScript)...');
    // Run TypeScript directly instead of building
    execSync('npx ts-node src/index.ts', { 
      cwd: actionPath, 
      stdio: 'inherit' 
    });
  } catch (error) {
    console.error('❌ TestChimp Action failed:', error.message);
    process.exit(1);
  }
} else {
  // Local development - run directly
  require('./dist/index.js');
}
