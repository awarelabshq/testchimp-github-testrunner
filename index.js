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
    // Run TypeScript directly with proper environment
    const env = {
      ...process.env,
      // Pass all GitHub Actions environment variables
      GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
      GITHUB_WORKFLOW: process.env.GITHUB_WORKFLOW,
      GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
      GITHUB_REF: process.env.GITHUB_REF,
      GITHUB_HEAD_REF: process.env.GITHUB_HEAD_REF,
      GITHUB_BASE_REF: process.env.GITHUB_BASE_REF,
      GITHUB_SHA: process.env.GITHUB_SHA,
      GITHUB_WORKSPACE: process.env.GITHUB_WORKSPACE,
      GITHUB_ACTION_PATH: process.env.GITHUB_ACTION_PATH,
      GITHUB_ACTOR: process.env.GITHUB_ACTOR,
      GITHUB_EVENT_NAME: process.env.GITHUB_EVENT_NAME,
      GITHUB_EVENT_PATH: process.env.GITHUB_EVENT_PATH,
      GITHUB_JOB: process.env.GITHUB_JOB,
      GITHUB_RUN_ID: process.env.GITHUB_RUN_ID,
      GITHUB_RUN_NUMBER: process.env.GITHUB_RUN_NUMBER,
      GITHUB_SERVER_URL: process.env.GITHUB_SERVER_URL,
      GITHUB_API_URL: process.env.GITHUB_API_URL,
      GITHUB_GRAPHQL_URL: process.env.GITHUB_GRAPHQL_URL,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      GITHUB_WORKFLOW_REF: process.env.GITHUB_WORKFLOW_REF,
      // Pass inputs as environment variables
      INPUT_API_KEY: process.env.INPUT_API_KEY,
      INPUT_PROJECT_ID: process.env.INPUT_PROJECT_ID,
      INPUT_TESTCHIMP_ENDPOINT: process.env.INPUT_TESTCHIMP_ENDPOINT,
      INPUT_TEST_TYPE: process.env.INPUT_TEST_TYPE,
      INPUT_TEST_CASE_REGEX: process.env.INPUT_TEST_CASE_REGEX,
      INPUT_TEST_SUITE_REGEX: process.env.INPUT_TEST_SUITE_REGEX,
      INPUT_TEST_DIRECTORY: process.env.INPUT_TEST_DIRECTORY,
      INPUT_RECURSIVE: process.env.INPUT_RECURSIVE,
      INPUT_INCLUDE_PATTERN: process.env.INPUT_INCLUDE_PATTERN,
      INPUT_EXCLUDE_PATTERN: process.env.INPUT_EXCLUDE_PATTERN,
      INPUT_MODE: process.env.INPUT_MODE,
      INPUT_DEFLAKE_RUNS: process.env.INPUT_DEFLAKE_RUNS,
      INPUT_HEADLESS: process.env.INPUT_HEADLESS,
      INPUT_SUCCESS_CRITERIA: process.env.INPUT_SUCCESS_CRITERIA,
      INPUT_REPAIR_CONFIDENCE_THRESHOLD: process.env.INPUT_REPAIR_CONFIDENCE_THRESHOLD,
      INPUT_CREATE_PR_ON_REPAIR: process.env.INPUT_CREATE_PR_ON_REPAIR,
      INPUT_PR_TITLE: process.env.INPUT_PR_TITLE,
      INPUT_PR_BODY: process.env.INPUT_PR_BODY
    };
    
    execSync('npx ts-node src/index.ts', { 
      cwd: actionPath, 
      stdio: 'inherit',
      env: env
    });
  } catch (error) {
    console.error('❌ TestChimp Action failed:', error.message);
    process.exit(1);
  }
} else {
  // Local development - run directly
  require('./dist/index.js');
}
