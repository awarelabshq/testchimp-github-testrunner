import { Browser, Page, BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';
import { getEnhancedPageInfo } from './utils/page-info-utils';
import { initializeBrowser } from './utils/browser-utils';
import { LLMFacade } from './llm-facade';
import { ScenarioRunJob, ScenarioResponse, ScenarioStep } from './types';
import { FileHandler } from './file-handler';
import { AuthConfig } from './auth-config';
import { generateTestScript } from './script-utils';

// Define a simple logging interface for compatibility
interface OutputChannel {
  appendLine: (text: string) => void;
}

// Legacy interface for backward compatibility
interface ScenarioJob {
  id: string;
  scenario: string;
  testName?: string;
  playwrightConfig?: string;
  model?: string;
  outputDirectory?: string;
  logsDirectory?: string;
}


const MAX_RETRIES_PER_STEP = 2;
// Default directories (will be overridden by job-specific directories)
const DEFAULT_SCRIPT_OUTPUT_DIR = path.join(process.cwd(), 'generated-scripts');
const DEFAULT_LOG_OUTPUT_DIR = path.join(process.cwd(), 'execution-logs');

export class ScenarioWorker {
  private initialized = false;
  private sessionId: string | null = null;
  private llmFacade: LLMFacade;
  private fileHandler?: FileHandler;
  private outputChannel?: OutputChannel;

  constructor(fileHandler?: FileHandler, authConfig?: AuthConfig, backendUrl?: string, outputChannel?: OutputChannel) {
    this.llmFacade = new LLMFacade(authConfig, backendUrl);
    this.fileHandler = fileHandler;
    this.outputChannel = outputChannel;
  }

  private log(message: string): void {
    console.log(message);
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[ScenarioWorker] ${message}`);
    }
  }

  private logError(message: string): void {
    console.error(message);
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[ScenarioWorker] ERROR: ${message}`);
    }
  }

  async initialize(): Promise<void> {
    try {
      this.log('Initializing Scenario worker...');
      this.sessionId = `scenario_worker_${Date.now()}`;
      this.initialized = true;
      this.log(`Scenario worker initialized with session: ${this.sessionId}`);
    } catch (error) {
      this.logError(`Scenario worker initialization error: ${error}`);
      throw error;
    }
  }

  async processScenarioJob(job: ScenarioJob): Promise<ScenarioResponse> {
    if (!this.initialized) {
      throw new Error('Scenario worker not initialized');
    }

    const startTime = Date.now();
    const steps: ScenarioStep[] = [];
    let generatedScript = '';
    let scriptPath: string | undefined;
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;
    let overallSuccess = true;

    try {
      // 1. Break down scenario into steps using LLM
      const scenarioSteps = await this.llmFacade.breakdownScenario(job.scenario, job.model);
      steps.push(...scenarioSteps);

      // 2. Start a new browser session using centralized utility
      // Default to headed mode (headless: false) for better debugging
      const browserInstance = await initializeBrowser(job.playwrightConfig, false);
      browser = browserInstance.browser;
      context = browserInstance.context;
      page = browserInstance.page;
      
      // Set reasonable timeout for all operations
      page.setDefaultTimeout(5000); // 5 seconds

      let previousSteps: ScenarioStep[] = [];
      let lastError: string | undefined;

      // 3. Execute each step
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        step.stepNumber = i + 1;
        step.retryCount = 0;

        let stepSuccess = false;
        let stepOutput = '';
        let stepError: string | undefined;

        for (let attempt = 0; attempt <= MAX_RETRIES_PER_STEP; attempt++) {
          let currentAttemptCommand: string | undefined;
          let currentAttemptSuccess = false;
          let currentAttemptError: string | undefined;
          const attemptTimestamp = Date.now();

          try {
            this.log(`Attempt ${attempt + 1} for step: ${step.description}`);

            // Get current page state using Playwright's accessibility tree
            const domSnapshot = {
              url: page.url(),
              title: await page.title(),
              accessibilityTree: await page.accessibility.snapshot()
            };

            // Generate Playwright command using LLM
            const pageInfo = await getEnhancedPageInfo(domSnapshot);
            const command = await this.llmFacade.generatePlaywrightCommand(step.description, pageInfo, previousSteps, lastError, step, job.model);

            if (!command) {
              throw new Error('LLM failed to generate a Playwright command.');
            }

            step.playwrightCommand = command;
            currentAttemptCommand = command;
            this.log(`  Command: ${command}`);

            // Execute the command
            await this.executePlaywrightCommand(page, browser, context, command);

            stepSuccess = true;
            currentAttemptSuccess = true;
            stepOutput = `Executed: ${command}`;
            stepError = undefined;
            this.log(`  ✅ SUCCESS: ${command}`);
            break; // Step successful, move to next scenario step
            } catch (error: any) {
              stepError = error instanceof Error ? error.message : String(error);
              currentAttemptError = stepError;
              console.error(`  ❌ FAILED (attempt ${attempt + 1}): ${stepError}`);
              console.error(`  Command attempted: ${currentAttemptCommand || 'N/A'}`);
              step.retryCount++;
              
              // Only update lastError if this is the final attempt
              if (attempt === MAX_RETRIES_PER_STEP) {
                lastError = stepError;
              }
              
              // If this is the last attempt, mark as failed and move on
              if (attempt === MAX_RETRIES_PER_STEP) {
                stepSuccess = false;
                stepOutput = `Failed after ${MAX_RETRIES_PER_STEP + 1} attempts.`;
                overallSuccess = false;
                console.error(`  🚫 STEP FAILED after ${MAX_RETRIES_PER_STEP + 1} attempts`);
                break; // Exit retry loop
              }
            } finally {
              if (!step.attempts) {
                step.attempts = [];
              }
              step.attempts.push({
                attemptNumber: attempt + 1,
                command: currentAttemptCommand,
                success: currentAttemptSuccess,
                error: currentAttemptError,
                timestamp: attemptTimestamp
              });
            }
          }

        step.success = stepSuccess;
        step.error = stepError;
        previousSteps.push(step);
      }

      // Generate test name if not provided
      const testName = job.testName || await this.llmFacade.generateTestName(job.scenario, job.model);

      // Generate clean script with TestChimp comment and code
      generatedScript = generateTestScript(testName, steps);

      // Generate detailed execution log
      const logLines: string[] = [];
      logLines.push(`# Scenario Execution Log`);
      logLines.push(`Job ID: ${job.id}`);
      logLines.push(`Scenario: ${job.scenario}`);
      logLines.push(`Start Time: ${new Date(startTime).toISOString()}`);
      logLines.push(`End Time: ${new Date().toISOString()}`);
      logLines.push(`Total Execution Time: ${Date.now() - startTime}ms`);
      logLines.push(`Overall Success: ${overallSuccess ? 'YES' : 'NO'}`);
      logLines.push(``);
      
      for (const step of steps) {
        logLines.push(`## Step ${step.stepNumber}: ${step.description}`);
        logLines.push(`Status: ${step.success ? 'SUCCESS' : 'FAILED'}`);
        logLines.push(`Retry Count: ${step.retryCount || 0}`);
        
        if (step.playwrightCommand) {
          logLines.push(`Final Command: ${step.playwrightCommand}`);
        }
        
        if (step.error) {
          logLines.push(`Final Error: ${step.error}`);
        }

        if (step.attempts && step.attempts.length > 0) {
          logLines.push(`### Attempts:`);
          for (const attempt of step.attempts) {
            logLines.push(`- Attempt ${attempt.attemptNumber}:`);
            logLines.push(`  Command: ${attempt.command || 'N/A'}`);
            logLines.push(`  Success: ${attempt.success ? 'YES' : 'NO'}`);
            if (attempt.error) {
              logLines.push(`  Error: ${attempt.error}`);
            }
            logLines.push(`  Timestamp: ${new Date(attempt.timestamp).toISOString()}`);
          }
        }
        
        logLines.push(``);
      }
      
      const executionLog = logLines.join('\n');

      // 4. Write the generated script to a file
      const scriptOutputDir = job.outputDirectory || DEFAULT_SCRIPT_OUTPUT_DIR;
      const fileName = await this.generateScriptFileName(testName, scriptOutputDir);
      scriptPath = path.join(scriptOutputDir, fileName);
      
      if (this.fileHandler) {
        await this.fileHandler.writeGeneratedScript(scriptPath, generatedScript);
      } else {
        // Fallback to direct write if no file handler provided
        fs.writeFileSync(scriptPath, generatedScript);
      }
      console.log(`Generated script saved to: ${scriptPath}`);

      // Write the execution log to a file
      const logOutputDir = job.logsDirectory || DEFAULT_LOG_OUTPUT_DIR;
      const logFileName = await this.generateLogFileName(testName, startTime, logOutputDir);
      const executionLogPath = path.join(logOutputDir, logFileName);
      
      if (this.fileHandler) {
        await this.fileHandler.writeExecutionLog(executionLogPath, executionLog);
      } else {
        // Fallback to direct write if no file handler provided
        fs.writeFileSync(executionLogPath, executionLog);
      }
      console.log(`Execution log saved to: ${executionLogPath}`);

    } catch (error: any) {
      overallSuccess = false;
      console.error('Overall scenario processing error:', error);
      return {
        success: false,
        steps,
        generatedScript,
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error during scenario processing'
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    return {
      success: overallSuccess,
      steps,
      generatedScript,
      scriptPath,
      executionTime: Date.now() - startTime
    };
  }


  private async generateScriptFileName(testName: string, outputDirectory?: string): Promise<string> {
    // Use provided directory or default
    const scriptOutputDir = outputDirectory || DEFAULT_SCRIPT_OUTPUT_DIR;
    
    // Ensure directory exists
    if (!fs.existsSync(scriptOutputDir)) {
      fs.mkdirSync(scriptOutputDir, { recursive: true });
    }

    // Sanitize the test name to be a valid filename
    const sanitizedName = testName
      .replace(/[^a-zA-Z0-9\s-_]/g, '') // Remove special characters except spaces, hyphens, underscores
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single underscore
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .toLowerCase();

    // Always use the same filename - overwrite existing files
    const fileName = `${sanitizedName}.spec.js`;

    return fileName;
  }

  private async generateLogFileName(testName: string, startTime: number, logsDirectory?: string): Promise<string> {
    // Use provided directory or default
    const logOutputDir = logsDirectory || DEFAULT_LOG_OUTPUT_DIR;
    
    // Ensure directory exists
    if (!fs.existsSync(logOutputDir)) {
      fs.mkdirSync(logOutputDir, { recursive: true });
    }

    // Sanitize the test name to be a valid filename
    const sanitizedName = testName
      .replace(/[^a-zA-Z0-9\s-_]/g, '') // Remove special characters except spaces, hyphens, underscores
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single underscore
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .toLowerCase();

    const timestamp = new Date(startTime).toISOString().replace(/[:.]/g, '-');
    return `job_${sanitizedName}_${timestamp}.log`;
  }




  private async executePlaywrightCommand(
    page: Page, 
    browser: Browser, 
    context: BrowserContext, 
    command: string
  ): Promise<void> {
    // Set reasonable timeouts
    page.setDefaultTimeout(5000); // 5 seconds

    try {
      // Execute command directly without validation
      const commandFunction = new Function('page', 'browser', 'context', 'expect', `
        return (async () => {
          try {
            ${command}
          } catch (error) {
            console.error('Command execution error:', error);
            throw error;
          }
        })();
      `);

      await commandFunction(page, browser, context, require('@playwright/test').expect);
      
    } finally {
      // Reset to default timeout
      page.setDefaultTimeout(10000); // Reset to default 10 seconds
    }
  }



  async cleanup(): Promise<void> {
    this.initialized = false;
    this.sessionId = null;
  }
}
