import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as glob from '@actions/glob';
import { TestChimpService, CIFileHandler, createProjectApiKeyAuth, createAuthConfigFromEnv } from 'testchimp-runner-core';
import { GitHubCIPipelineFactory, SuccessCriteria } from './github-pipeline';

function getBackendUrl(): string {
  // Check if we're in staging environment by looking for staging indicators
  const isStaging = process.env.NODE_ENV === 'staging' || 
                   process.env.TESTCHIMP_ENV === 'staging' ||
                   process.env.GITHUB_REF?.includes('staging') ||
                   process.env.GITHUB_HEAD_REF?.includes('staging');
  
  if (isStaging) {
    return 'https://featureservice-staging.testchimp.io';
  }
  
  // Default to production
  return 'https://featureservice.testchimp.io';
}

async function run(): Promise<void> {
  try {

    // Helper function to get input from either core.getInput or environment variables
    const getInput = (name: string, defaultValue: string = ''): string => {
      const coreValue = core.getInput(name);
      if (coreValue) return coreValue;
      
      const envValue = process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`];
      if (envValue) return envValue;
      
      return defaultValue;
    };
    
    // Get inputs using helper function
    const testDirectoryInput = getInput('test-directory', 'tests');
    const testDirectories = testDirectoryInput.split(',').map(dir => dir.trim()).filter(dir => dir.length > 0);
    const recursive = getInput('recursive', 'false') === 'true';
    const includePattern = getInput('include-pattern', '**/*.spec.{js,ts}');
    const excludePattern = getInput('exclude-pattern', '**/node_modules/**');
    const mode = getInput('mode', 'RUN_WITH_AI_REPAIR');
    const deflakeRuns = parseInt(getInput('deflake-runs', '2'));
    // In GitHub Actions, always run headless (no display server available)
    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
    const headless = true; // Always run headless in CI/CD
    
    if (isGitHubActions) {
      core.info('TestChimp: Running in GitHub Actions - forcing headless mode (no display server available)');
    }
    const successCriteria = getInput('success-criteria', 'ORIGINAL_SUCCESS') as SuccessCriteria || SuccessCriteria.ORIGINAL_SUCCESS;
    const repairConfidenceThreshold = parseInt(getInput('repair-confidence-threshold', '4'));
    const attemptAIRepair = getInput('attempt-ai-repair', 'true').toLowerCase() === 'true';

    core.info(`TestChimp: Scanning directories ${testDirectories.join(', ')} for TestChimp managed tests...`);

    // Resolve directories relative to the repository workspace so we scan repo files, not action files
    const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
    const absTestDirectories = testDirectories.map(dir => {
      const path = require('path');
      return path.isAbsolute(dir) ? dir : path.join(workspace, dir);
    });


    // Set up authentication configuration
    let authConfig = createAuthConfigFromEnv();
    
    // If no auth config from environment, use required project API key from GitHub secrets
    if (!authConfig) {
      const apiKey = getInput('api-key');
      const projectId = getInput('project-id');
      
      
      if (!apiKey || !projectId) {
        core.setFailed('TestChimp: Both api-key and project-id are required for CI authentication');
        return;
      }
      
      authConfig = createProjectApiKeyAuth(apiKey, projectId);
      core.info('TestChimp: Using project API key authentication');
    } else {
      core.info(`TestChimp: Using authentication from environment variables (${authConfig.mode})`);
    }

    // Determine backend URL based on environment
    const backendUrl = getBackendUrl();
    core.info(`TestChimp: Using backend URL: ${backendUrl}`);

    // Initialize TestChimp service with CI file handler
    // Use the repository workspace as the base path for relative path resolution
    const ciFileHandler = new CIFileHandler(workspace);
    const testChimpService = new TestChimpService(ciFileHandler, authConfig || undefined, backendUrl);
    await testChimpService.initialize();

    // Find TestChimp managed tests across all directories
    const allTestFiles: string[] = [];
    for (const testDir of absTestDirectories) {
      core.info(`TestChimp: Scanning ${testDir}...`);
      const dirTestFiles = testChimpService.findTestChimpTests(testDir, recursive);
      allTestFiles.push(...dirTestFiles);
      core.info(`TestChimp: Found ${dirTestFiles.length} tests in ${testDir}`);
    }
    
    core.info(`TestChimp: Found ${allTestFiles.length} TestChimp managed tests total`);

    if (allTestFiles.length === 0) {
      core.info('TestChimp: No TestChimp managed tests found. Skipping execution.');
      core.setOutput('status', 'skipped');
      core.setOutput('test-count', '0');
      core.setOutput('success-count', '0');
      core.setOutput('failure-count', '0');
      core.setOutput('repaired-count', '0');
      core.setOutput('repaired-above-threshold', '0');
      core.setOutput('repaired-below-threshold', '0');
      core.setOutput('success-criteria-used', successCriteria);
      
      // Write outputs to file for composite action
      const fs = require('fs');
      const outputs = {
        status: 'skipped',
        testCount: '0',
        successCount: '0',
        failureCount: '0',
        repairedCount: '0',
        repairedAboveThreshold: '0',
        repairedBelowThreshold: '0',
        successCriteriaUsed: successCriteria
      };
      
      fs.writeFileSync('testchimp-outputs.json', JSON.stringify(outputs));
      
      // Display test results even when no tests found
      core.info('📊 TestChimp Test Results:');
      core.info(`  Status: skipped`);
      core.info(`  Total Tests: 0`);
      core.info(`  Successful: 0`);
      core.info(`  Failed: 0`);
      core.info(`  Repaired: 0`);
      core.info(`  High Confidence Repairs: 0`);
      core.info(`  Low Confidence Repairs: 0`);
      core.info(`  Success Criteria: ${successCriteria}`);
      
      return;
    }

    // Execute tests
    let successCount = 0;
    let failureCount = 0;
    let repairedCount = 0;
    let repairedAboveThreshold = 0;
    let repairedBelowThreshold = 0;
    const repairedFiles = new Map<string, string>(); // Map of file path to updated content

    core.info(`TestChimp: Using success criteria: ${successCriteria}`);
    core.info(`TestChimp: Attempt AI repair: ${attemptAIRepair}`);
    if (successCriteria === SuccessCriteria.REPAIR_SUCCESS_WITH_CONFIDENCE) {
      core.info(`TestChimp: Repair confidence threshold: ${repairConfidenceThreshold}`);
    }

    for (const testFile of allTestFiles) {
      core.info(`TestChimp: Executing ${testFile}...`);
      
      try {
        // Convert absolute path to relative path for the file handler
        const path = require('path');
        // Make script path relative to the repository workspace
        const relativeTestFile = path.relative(workspace, testFile);
        
        const request = {
          scriptFilePath: relativeTestFile,
          mode: attemptAIRepair ? mode : 'RUN_EXACTLY',
          headless: headless,
          deflake_run_count: deflakeRuns
        };

        const result = await testChimpService.executeScript(request);
        
        // Collect repaired files for PR creation
        if (result.repair_status === 'success' && result.updated_script) {
          repairedFiles.set(relativeTestFile, result.updated_script);
          core.info(`TestChimp: 📝 ${testFile} - Repaired and queued for PR`);
        }
        
        // Determine if this test should be considered successful based on criteria
        let isSuccessful = false;
        
        if (result.run_status === 'success') {
          // Original test passed
          isSuccessful = true;
          core.info(`TestChimp: ✅ ${testFile} - SUCCESS (original)`);
        } else if (successCriteria === SuccessCriteria.REPAIR_SUCCESS_WITH_CONFIDENCE && 
                   result.repair_status === 'success' && 
                   (result.repair_confidence || 0) >= repairConfidenceThreshold) {
          // Original failed but repair succeeded with sufficient confidence
          isSuccessful = true;
          repairedCount++;
          repairedAboveThreshold++;
          core.info(`TestChimp: ✅ ${testFile} - SUCCESS (repaired with confidence ${result.repair_confidence})`);
        } else if (result.repair_status === 'success' || result.repair_status === 'partial') {
          // Repair was attempted but doesn't meet success criteria
          repairedCount++;
          if ((result.repair_confidence || 0) >= repairConfidenceThreshold) {
            repairedAboveThreshold++;
          } else {
            repairedBelowThreshold++;
          }
          core.error(`TestChimp: ❌ ${testFile} - REPAIR FAILED: confidence ${result.repair_confidence} < threshold ${repairConfidenceThreshold}`);
        } else {
          // No repair or repair failed
          core.error(`TestChimp: ❌ ${testFile} - FAILED: ${result.error || 'No repair available'}`);
        }
        
        if (isSuccessful) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        core.error(`TestChimp: ❌ ${testFile} - ERROR: ${error}`);
        failureCount++;
      }
    }

    // Set outputs
    const status = failureCount === 0 ? 'success' : 'failed';
    const testCount = allTestFiles.length.toString();
    const successCountStr = successCount.toString();
    const failureCountStr = failureCount.toString();
    const repairedCountStr = repairedCount.toString();
    const repairedAboveThresholdStr = repairedAboveThreshold.toString();
    const repairedBelowThresholdStr = repairedBelowThreshold.toString();
    const successCriteriaUsed = successCriteria;
    
    core.setOutput('status', status);
    core.setOutput('test-count', testCount);
    core.setOutput('success-count', successCountStr);
    core.setOutput('failure-count', failureCountStr);
    core.setOutput('repaired-count', repairedCountStr);
    core.setOutput('repaired-above-threshold', repairedAboveThresholdStr);
    core.setOutput('repaired-below-threshold', repairedBelowThresholdStr);
    core.setOutput('success-criteria-used', successCriteriaUsed);
    
    // Write outputs to file for composite action
    const fs = require('fs');
    const outputs = {
      status,
      testCount,
      successCount: successCountStr,
      failureCount: failureCountStr,
      repairedCount: repairedCountStr,
      repairedAboveThreshold: repairedAboveThresholdStr,
      repairedBelowThreshold: repairedBelowThresholdStr,
      successCriteriaUsed: successCriteriaUsed
    };
    
    fs.writeFileSync('testchimp-outputs.json', JSON.stringify(outputs));

    // Summary
    core.info(`TestChimp: Execution complete - ${successCount}/${allTestFiles.length} tests passed`);
    if (repairedCount > 0) {
      core.info(`TestChimp: ${repairedCount} tests were repaired: ${repairedAboveThreshold} above threshold (≥${repairConfidenceThreshold}), ${repairedBelowThreshold} below threshold (<${repairConfidenceThreshold})`);
    }

    // Display comprehensive test results
    core.info('📊 TestChimp Test Results:');
    core.info(`  Status: ${status}`);
    core.info(`  Total Tests: ${testCount}`);
    core.info(`  Successful: ${successCountStr}`);
    core.info(`  Failed: ${failureCountStr}`);
    core.info(`  Repaired: ${repairedCountStr}`);
    core.info(`  High Confidence Repairs: ${repairedAboveThresholdStr}`);
    core.info(`  Low Confidence Repairs: ${repairedBelowThresholdStr}`);
    core.info(`  Success Criteria: ${successCriteriaUsed}`);

    // Check if any files were repaired and create PR if needed
    if (repairedFiles.size > 0) {
      core.info(`TestChimp: ${repairedFiles.size} files were repaired. Creating PR...`);
      
      try {
        // Create CI pipeline for PR creation
        const ciPipeline = GitHubCIPipelineFactory.detectAndCreatePipeline();
        if (!ciPipeline) {
          core.warning('TestChimp: Not running in GitHub Actions environment. Skipping PR creation.');
          return;
        }

        // Process repaired files and create PR
        const testResults = {
          successCount,
          failureCount,
          totalTests: allTestFiles.length,
          repairedFiles,
          repairedCount,
          repairedAboveThreshold,
          repairedBelowThreshold,
          successCriteriaUsed: successCriteria
        };

        const prResult = await ciPipeline.processRepairedFiles(testResults);
        
        if (prResult?.success) {
          core.setOutput('pull-request-number', prResult.number.toString());
          core.setOutput('pull-request-url', prResult.url);
          core.info(`TestChimp: ✅ Successfully created PR #${prResult.number}`);
        } else {
          core.error(`TestChimp: ❌ Failed to create PR: ${prResult?.error || 'Unknown error'}`);
        }
      } catch (error) {
        core.error(`TestChimp: ❌ Error creating PR: ${error}`);
      }
    } else {
      core.info('TestChimp: No files were repaired, skipping PR creation');
    }

    if (failureCount > 0) {
      core.setFailed(`${failureCount} tests failed`);
    }

  } catch (error) {
    core.setFailed(`TestChimp: Action failed - ${error}`);
  }
}

// Run the action
run();
