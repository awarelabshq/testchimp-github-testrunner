import { PlaywrightMCPService as PlaywrightService } from './playwright-mcp-service';
import { 
  PlaywrightExecutionRequest, 
  PlaywrightExecutionResponse, 
  ScriptResult,
  ScriptExecutionRequest,
  ScriptExecutionResponse,
  ScriptStep,
  ExecutionMode,
  StepOperation,
  StepRepairAction
} from './types';
import { RepairSuggestionResponse, RepairConfidenceResponse } from './llm-facade';
import { Browser, BrowserContext, Page } from 'playwright';
import { expect } from '@playwright/test';
import { getEnhancedPageInfo, PageInfo } from './utils/page-info-utils';
import { initializeBrowser } from './utils/browser-utils';
import { LLMFacade } from './llm-facade';
import { AuthConfig } from './auth-config';
import { addTestChimpComment } from './script-utils';

/**
 * Service for orchestrating Playwright script execution
 */
export class ExecutionService {
  private playwrightService: PlaywrightService;
  private llmFacade: LLMFacade;

  constructor(authConfig?: AuthConfig) {
    this.playwrightService = new PlaywrightService();
    this.llmFacade = new LLMFacade(authConfig);
  }

  /**
   * Initialize the execution service
   */
  async initialize(): Promise<void> {
    await this.playwrightService.initialize();
  }


  /**
   * Execute a script with optional AI repair capabilities
   */
  async executeScript(request: ScriptExecutionRequest): Promise<ScriptExecutionResponse> {
    const startTime = Date.now();
    const model = request.model || 'gpt-4.1-mini';
    
    try {
      if (request.mode === ExecutionMode.RUN_EXACTLY) {
        return await this.runExactly(request, startTime);
      } else {
        return await this.runWithAIRepair(request, startTime, model);
      }
    } catch (error) {
      return {
        run_status: 'failed',
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Execute a complete Playwright test suite as a single job
   */
  async executeTestSuite(request: PlaywrightExecutionRequest): Promise<PlaywrightExecutionResponse> {
    try {
      // Parse Playwright configuration
      const config = this.parsePlaywrightConfig(request.playwrightConfig);

      // Execute the entire job (prescript + script + postscript) as one unit
      const jobResult = await this.playwrightService.executeJob(
        request.prescript,
        request.script,
        request.postscript,
        config
      );

      return {
        success: jobResult.success,
        results: jobResult.results,
        executionTime: jobResult.executionTime,
        error: jobResult.error
      };

    } catch (error) {
      return {
        success: false,
        results: {
          script: { success: false, output: '', error: '', executionTime: 0 }
        },
        executionTime: 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Parse Playwright configuration from string
   */
  private parsePlaywrightConfig(configString: string): any {
    try {
      // Try to parse as JSON first
      const config = JSON.parse(configString);
      return {
        browserType: config.browserType || 'chromium',
        headless: config.headless === true,
        viewport: config.viewport || { width: 1280, height: 720 },
        options: config.options || {}
      };
    } catch {
      // If not JSON, try to extract basic config from JavaScript
      try {
        // Simple regex-based extraction for common config patterns
        const headlessMatch = configString.match(/headless:\s*(true|false)/);
        const viewportMatch = configString.match(/viewport:\s*\{\s*width:\s*(\d+),\s*height:\s*(\d+)\s*\}/);
        const browserMatch = configString.match(/browserType:\s*['"`](chromium|firefox|webkit)['"`]/);
        
        return {
          browserType: browserMatch ? browserMatch[1] : 'chromium',
          headless: headlessMatch ? headlessMatch[1] === 'true' : true,
          viewport: viewportMatch ? 
            { width: parseInt(viewportMatch[1]), height: parseInt(viewportMatch[2]) } : 
            { width: 1280, height: 720 },
          options: {}
        };
      } catch {
        // Return default config if parsing fails
        return {
          browserType: 'chromium',
          headless: false,
          viewport: { width: 1280, height: 720 },
          options: {}
        };
      }
    }
  }

  /**
   * Close the execution service
   */
  async close(): Promise<void> {
    await this.playwrightService.close();
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.playwrightService.isReady();
  }

  private async runExactly(request: ScriptExecutionRequest, startTime: number, model?: string): Promise<ScriptExecutionResponse> {
    const deflakeRunCount = request.deflake_run_count !== undefined ? request.deflake_run_count : 1;
    const totalAttempts = deflakeRunCount + 1; // Original run + deflake attempts
    let lastError: Error | null = null;
    
    console.log(`runExactly: deflake_run_count = ${request.deflake_run_count}, totalAttempts = ${totalAttempts}`);

    // Script content should be provided by the caller (TestChimpService)
    // The TestChimpService handles file reading through the appropriate FileHandler
    if (!request.script) {
      throw new Error('Script content is required for execution. The TestChimpService should read the file and provide script content.');
    }

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      console.log(`Attempting deflake run ${attempt}/${totalAttempts}`);
      const { browser, context, page } = await this.initializeBrowser(request.playwrightConfig, request.headless, request.playwrightConfigFilePath);

      try {
        // Execute the script as-is
        await this.executeScriptContent(request.script, page);
        
        await browser.close();
        
        // Success! Return immediately
        return {
          run_status: 'success',
          num_deflake_runs: attempt - 1, // Count only deflaking runs (exclude original run)
          executionTime: Date.now() - startTime
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Script execution failed');
        console.log(`Initial run failed: ${lastError.message}`);
        
        try {
          await browser.close();
        } catch (closeError) {
          // Browser might already be closed
        }

        // If this is not the last attempt, continue to next attempt
        if (attempt < totalAttempts) {
          console.log(`Deflaking attempt ${attempt} failed, trying again... (${attempt + 1}/${totalAttempts})`);
          continue;
        }
      }
    }

    // All attempts failed
    return {
      run_status: 'failed',
      num_deflake_runs: deflakeRunCount, // Count only deflaking runs (exclude original run)
      executionTime: Date.now() - startTime,
      error: lastError?.message || 'All deflaking attempts failed'
    };
  }

  private async runWithAIRepair(request: ScriptExecutionRequest, startTime: number, model: string): Promise<ScriptExecutionResponse> {
    const repairFlexibility = request.repair_flexibility || 3;

    // Script content should be provided by the caller (TestChimpService)
    // The TestChimpService handles file reading through the appropriate FileHandler
    if (!request.script) {
      throw new Error('Script content is required for AI repair. The TestChimpService should read the file and provide script content.');
    }

    // First, try runExactly (which includes deflaking if configured)
    console.log('Attempting runExactly first (with deflaking if configured)...');
    const runExactlyResult = await this.runExactly(request, startTime, model);
    
    // If runExactly succeeded, return that result
    if (runExactlyResult.run_status === 'success') {
      return runExactlyResult;
    }

    // runExactly failed, start AI repair
    console.log('runExactly failed, starting AI repair process...');

    try {
        
        // Start browser initialization and script parsing in parallel for faster startup
        console.log('Initializing repair browser and parsing script...');
        const [steps, { browser: repairBrowser, context: repairContext, page: repairPage }] = await Promise.all([
          this.parseScriptIntoSteps(request.script, model),
          this.initializeBrowser(request.playwrightConfig, request.headless, request.playwrightConfigFilePath) // Use request.headless (defaults to false/headed)
        ]);
        
        console.log('Starting AI repair with parsed steps...');
        const updatedSteps = await this.repairStepsWithAI(steps, repairPage, repairFlexibility, model);
        
        // Always generate the updated script
        const updatedScript = this.generateUpdatedScript(updatedSteps);
        
        // Check if repair was successful by seeing if we completed all steps
        const allStepsSuccessful = updatedSteps.length > 0 && updatedSteps.every(step => step.success);
        
        // Check if we have any successful repairs (partial success)
        const hasSuccessfulRepairs = updatedSteps.some(step => step.success);
        
        // Debug: Log step success status
        console.log('Step success status:', updatedSteps.map((step, index) => `Step ${index + 1}: ${step.success ? 'SUCCESS' : 'FAILED'}`));
        console.log('All steps successful:', allStepsSuccessful);
        console.log('Has successful repairs:', hasSuccessfulRepairs);
        
        // Debug: Log individual step details
        updatedSteps.forEach((step, index) => {
          console.log(`Step ${index + 1} details: success=${step.success}, description="${step.description}"`);
        });
        
        // Update file if we have any successful repairs (partial or complete)
        if (hasSuccessfulRepairs) {
          const confidenceResponse = await this.llmFacade.assessRepairConfidence(request.script!, updatedScript, model);
          const finalScript = await this.llmFacade.generateFinalScript(request.script!, updatedScript, confidenceResponse.advice, model);
          
          // Ensure the final script has the correct TestChimp comment format with repair advice
          const scriptWithRepairAdvice = addTestChimpComment(finalScript, confidenceResponse.advice);
          
          await repairBrowser.close();
          
          return {
            run_status: 'failed', // Original script failed
            repair_status: allStepsSuccessful ? 'success' : 'partial', // Complete or partial repair success
            repair_confidence: confidenceResponse.confidence,
            repair_advice: confidenceResponse.advice,
            updated_script: scriptWithRepairAdvice, // Return the drop-in replacement script with proper TestChimp comment
            num_deflake_runs: runExactlyResult.num_deflake_runs, // All deflaking attempts failed
            executionTime: Date.now() - startTime
          };
        } else {
          // No successful repairs at all
          await repairBrowser.close();
          
          return {
            run_status: 'failed', // Original script failed
            repair_status: 'failed',
            repair_confidence: 0,
            repair_advice: 'AI repair could not fix any steps',
            updated_script: request.script!, // Return original script since no repairs were successful
            num_deflake_runs: runExactlyResult.num_deflake_runs, // All deflaking attempts failed
            executionTime: Date.now() - startTime,
            error: 'AI repair could not fix any steps'
          };
        }
    } catch (error) {
      return {
        run_status: 'failed',
        repair_status: 'failed',
        num_deflake_runs: runExactlyResult.num_deflake_runs,
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Script execution failed'
      };
    }
  }

  private async parseScriptIntoSteps(script: string, model: string): Promise<(ScriptStep & { success?: boolean; error?: string })[]> {
    // First try LLM-based parsing
    try {
      console.log('Attempting LLM-based script parsing...');
      const result = await this.llmFacade.parseScriptIntoSteps(script, model);
      console.log('LLM parsing successful, got', result.length, 'steps');
      return result;
    } catch (error) {
      console.log('LLM parsing failed, falling back to code parsing:', error);
      const fallbackResult = this.parseScriptIntoStepsFallback(script);
      console.log('Fallback parsing successful, got', fallbackResult.length, 'steps');
      return fallbackResult;
    }
  }


  private parseScriptIntoStepsFallback(script: string): (ScriptStep & { success?: boolean; error?: string })[] {
    const lines = script.split('\n');
    const steps: (ScriptStep & { success?: boolean; error?: string })[] = [];
    let currentStep: ScriptStep | null = null;
    let currentCode: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Check for step comment
      if (trimmedLine.startsWith('// Step ')) {
        // Save previous step if exists and has code
        if (currentStep) {
          const code = currentCode.join('\n').trim();
          const cleanedCode = this.cleanStepCode(code);
          if (cleanedCode) {
            currentStep.code = cleanedCode;
            steps.push(currentStep);
          }
        }
        
        // Start new step
        const description = trimmedLine.replace(/^\/\/\s*Step\s*\d+:\s*/, '').replace(/\s*\[FAILED\]\s*$/, '').trim();
        currentStep = { description, code: '' };
        currentCode = [];
      } else if (trimmedLine && !trimmedLine.startsWith('import') && !trimmedLine.startsWith('test(') && !trimmedLine.startsWith('});')) {
        // Add code line to current step
        if (currentStep) {
          currentCode.push(line);
        }
      }
    }

    // Add the last step if it has code
    if (currentStep) {
      const code = currentCode.join('\n').trim();
      const cleanedCode = this.cleanStepCode(code);
      if (cleanedCode) {
        currentStep.code = cleanedCode;
        steps.push(currentStep);
      }
    }

    return steps;
  }

  private async repairStepsWithAI(
    steps: (ScriptStep & { success?: boolean; error?: string })[], 
    page: Page, 
    repairFlexibility: number,
    model: string
  ): Promise<(ScriptStep & { success?: boolean; error?: string })[]> {
    let updatedSteps = [...steps];
    const maxTries = 3;
    const recentRepairs: Array<{
      stepNumber: number;
      operation: string;
      originalDescription?: string;
      newDescription?: string;
      originalCode?: string;
      newCode?: string;
    }> = [];

    // Create a shared execution context that accumulates all executed code for variable tracking
    let executionContext = '';
    const contextVariables = new Map<string, any>();

    let i = 0;
    while (i < updatedSteps.length) {
      const step = updatedSteps[i];
      console.log(`Loop iteration: i=${i}, step description="${step.description}", total steps=${updatedSteps.length}`);
      
      try {
        // Try to execute the step directly without context replay
        console.log(`Attempting Step ${i + 1}: ${step.description}`);
        console.log(`  Code: ${step.code}`);
        await this.executeStepCode(step.code, page);
        step.success = true;
        console.log(`Step ${i + 1} executed successfully: ${step.description}`);
        console.log(`Step ${i + 1} success status set to: ${step.success}`);
        
        // Add this step's code to the execution context for future steps (for variable tracking)
        executionContext += step.code + '\n';
        i++; // Move to next step
      } catch (error) {
        console.log(`Step ${i + 1} failed: ${step.description}`);
        console.log(`  Failed code: ${step.code}`);
        console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        if (error instanceof Error && error.stack) {
          console.log(`  Stack trace: ${error.stack}`);
        }
        step.success = false;
        step.error = this.safeSerializeError(error);

        // Try multiple repair attempts
        const repairHistory: Array<{
          attempt: number;
          action: StepRepairAction;
          error: string;
          pageInfo: PageInfo;
        }> = [];

        let repairSuccess = false;
        const originalDescription = step.description;
        const originalCode = step.code;
        
        for (let attempt = 1; attempt <= maxTries; attempt++) {
          console.log(`Step ${i + 1} repair attempt ${attempt}/${maxTries}`);
          
          // Get current page state for AI repair
          const pageInfo = await this.getEnhancedPageInfo(page);
          
          // Build failure history for LLM context
          const failureHistory = this.buildFailureHistory(repairHistory, step, error);
          
          // Build recent repairs context for LLM
          const recentRepairsContext = this.buildRecentRepairsContext(recentRepairs);
          
          // Ask AI for repair suggestion with failure history and recent repairs
          const repairSuggestion = await this.llmFacade.getRepairSuggestion(
            step.description,
            step.code,
            step.error || 'Unknown error',
            pageInfo,
            failureHistory,
            recentRepairsContext,
            model
          );

          if (!repairSuggestion.shouldContinue) {
            console.log(`AI decided to stop repair at attempt ${attempt}: ${repairSuggestion.reason}`);
            break;
          }

          // Apply the repair action
          try {
            // Set the step index and insertAfterIndex on the client side based on current step being processed
            const repairAction = {
              ...repairSuggestion.action,
              stepIndex: i, // Client-side step index management
              insertAfterIndex: repairSuggestion.action.operation === StepOperation.INSERT ? i - 1 : undefined // For INSERT, insert before current step
            };
            
            console.log(`🔧 Applying repair action:`, {
              operation: repairAction.operation,
              stepIndex: repairAction.stepIndex,
              insertAfterIndex: repairAction.insertAfterIndex,
              newStepDescription: repairAction.newStep?.description,
              newStepCode: repairAction.newStep?.code
            });
            console.log(`🔧 Steps array before repair:`, updatedSteps.map((s, idx) => `${idx}: "${s.description}" (success: ${s.success})`));
            
            const result = await this.applyRepairActionInContext(repairAction, updatedSteps, i, page, executionContext, contextVariables);
            
            if (result.success) {
              repairSuccess = true;
              console.log(`🔧 Steps array after repair:`, updatedSteps.map((s, idx) => `${idx}: "${s.description}" (success: ${s.success})`));
              
              // Mark the appropriate step(s) as successful based on operation type
              if (repairAction.operation === StepOperation.MODIFY) {
                // For MODIFY: mark the modified step as successful
                step.success = true;
                step.error = undefined;
                updatedSteps[i].success = true;
                updatedSteps[i].error = undefined;
                console.log(`Step ${i + 1} marked as successful after MODIFY repair`);
              } else if (repairAction.operation === StepOperation.INSERT) {
                // For INSERT: mark the newly inserted step as successful
                const insertIndex = repairAction.insertAfterIndex !== undefined ? repairAction.insertAfterIndex + 1 : i + 1;
                if (updatedSteps[insertIndex]) {
                  updatedSteps[insertIndex].success = true;
                  updatedSteps[insertIndex].error = undefined;
                }
              } else if (repairAction.operation === StepOperation.REMOVE) {
                // For REMOVE: no step to mark as successful since we removed it
                // The step is already removed from the array
              }
              
              const commandInfo = repairAction.operation === StepOperation.MODIFY ? 
                `MODIFY: "${repairAction.newStep?.code || 'N/A'}"` :
                repairAction.operation === StepOperation.INSERT ? 
                `INSERT: "${repairAction.newStep?.code || 'N/A'}"` :
                repairAction.operation === StepOperation.REMOVE ? 
                `REMOVE: step at index ${repairAction.stepIndex}` :
                repairAction.operation;
              console.log(`Step ${i + 1} repair action ${commandInfo} executed successfully on attempt ${attempt}`);
              
              // Update execution context based on the repair action
              if (repairAction.operation === StepOperation.MODIFY && repairAction.newStep) {
                // Update the step in the execution context for variable tracking
                executionContext = executionContext.replace(originalCode, repairAction.newStep.code);
              } else if (repairAction.operation === StepOperation.INSERT && repairAction.newStep) {
                // Insert the new step code into execution context for variable tracking
                executionContext += repairAction.newStep.code + '\n';
              } else if (repairAction.operation === StepOperation.REMOVE) {
                // Remove the step code from execution context for variable tracking
                executionContext = executionContext.replace(originalCode, '');
              }
              
              // Record this successful repair
              recentRepairs.push({
                stepNumber: i + 1,
                operation: repairAction.operation,
                originalDescription: repairAction.operation === StepOperation.REMOVE ? originalDescription : undefined,
                newDescription: repairAction.newStep?.description,
                originalCode: repairAction.operation === StepOperation.REMOVE ? originalCode : undefined,
                newCode: repairAction.newStep?.code
              });
              
              // Keep only the last 3 repairs for context
              if (recentRepairs.length > 3) {
                recentRepairs.shift();
              }
              
              // Update step index based on operation
              if (repairAction.operation === StepOperation.INSERT) {
                // For INSERT: inserted step is already executed
                console.log(`INSERT operation: current i=${i}, insertAfterIndex=${repairAction.insertAfterIndex}`);
                console.log(`INSERT: Steps array length before: ${updatedSteps.length}`);
                console.log(`INSERT: Steps before operation:`, updatedSteps.map((s, idx) => `${idx}: "${s.description}" (success: ${s.success})`));
                
                if (repairAction.insertAfterIndex !== undefined && repairAction.insertAfterIndex < i) {
                  // If inserting before current position, current step moved down by 1
                  console.log(`INSERT before current position: incrementing i from ${i} to ${i + 1}`);
                  i++; // Move to the original step that was pushed to the next position
                } else {
                  // If inserting at or after current position, stay at current step
                  console.log(`INSERT at/after current position: keeping i at ${i}`);
                }
                
                console.log(`INSERT: Steps array length after: ${updatedSteps.length}`);
                console.log(`INSERT: Steps after operation:`, updatedSteps.map((s, idx) => `${idx}: "${s.description}" (success: ${s.success})`));
              } else if (repairAction.operation === StepOperation.REMOVE) {
                // For REMOVE: stay at same index since the next step moved to current position
                // Don't increment i because the array shifted left
              } else {
                // For MODIFY: move to next step since modified step was executed
                i++; // Move to next step for MODIFY
              }
              
              // Add the repaired step's code to execution context for variable tracking
              executionContext += step.code + '\n';
              
              break;
            } else {
              throw new Error(result.error || 'Repair action failed');
            }
          } catch (repairError) {
            const repairErrorMessage = repairError instanceof Error ? repairError.message : 'Repair failed';
            const commandInfo = repairSuggestion.action.operation === StepOperation.MODIFY ? 
              `MODIFY: "${repairSuggestion.action.newStep?.code || 'N/A'}"` :
              repairSuggestion.action.operation === StepOperation.INSERT ? 
              `INSERT: "${repairSuggestion.action.newStep?.code || 'N/A'}"` :
              repairSuggestion.action.operation === StepOperation.REMOVE ? 
              `REMOVE: step at index ${repairSuggestion.action.stepIndex}` :
              repairSuggestion.action.operation;
            console.log(`Step ${i + 1} repair attempt ${attempt} failed (${commandInfo}): ${repairErrorMessage}`);
            if (repairError instanceof Error && repairError.stack) {
              console.log(`  Repair stack trace: ${repairError.stack}`);
            }
            
            // Record this attempt in history
            repairHistory.push({
              attempt,
              action: repairSuggestion.action,
              error: repairErrorMessage,
              pageInfo
            });
            
            step.error = repairErrorMessage;
          }
        }

        if (!repairSuccess) {
          console.log(`Step ${i + 1} failed after ${maxTries} repair attempts`);
          break;
        }
      }
    }

    return updatedSteps;
  }

  private async executeStepCode(code: string, page: Page): Promise<void> {
    // Set timeout for individual step execution
    page.setDefaultTimeout(5000); // 5 seconds for individual commands
    
    try {
      // Clean and validate the code before execution
      const cleanedCode = this.cleanStepCode(code);
      
      if (!cleanedCode || cleanedCode.trim().length === 0) {
        throw new Error('Step code is empty or contains only comments');
      }
      
      // Create an async function that has access to page, expect, and other Playwright globals
      const executeCode = new Function('page', 'expect', `return (async () => { ${cleanedCode} })()`);
      const result = executeCode(page, expect);
      await result;
    } finally {
      // Restore to reasonable default timeout
      page.setDefaultTimeout(10000);
    }
  }

  /**
   * Validate step code has executable content (preserves comments)
   */
  private cleanStepCode(code: string): string {
    if (!code || code.trim().length === 0) {
      return '';
    }
    
    // Check if there are any executable statements (including those with comments)
    const hasExecutableCode = /[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(|await\s+|return\s+|if\s*\(|for\s*\(|while\s*\(|switch\s*\(|try\s*\{|catch\s*\(/.test(code);
    
    if (!hasExecutableCode) {
      return '';
    }
    
    return code; // Return the original code without removing comments
  }

  private async executeStepInContext(
    code: string, 
    page: Page, 
    executionContext: string, 
    contextVariables: Map<string, any>
  ): Promise<void> {
    // Set timeout for individual step execution
    page.setDefaultTimeout(5000); // 5 seconds for individual commands
    
    try {
      // Execute only the current step code, but make context variables available
      const fullCode = code;
    
    // Create a function that has access to page, expect, and the context variables
    const executeCode = new Function(
      'page', 
      'expect', 
      'contextVariables',
      `return (async () => { 
        // Make context variables available in the execution scope
        for (const [key, value] of contextVariables) {
          globalThis[key] = value;
        }
        
        ${fullCode}
        
        // Capture any new variables that might have been created
        const newVars = {};
        for (const key in globalThis) {
          if (!contextVariables.has(key) && typeof globalThis[key] !== 'function' && key !== 'page' && key !== 'expect') {
            newVars[key] = globalThis[key];
          }
        }
        return newVars;
      })()`
    );
    
      const newVars = await executeCode(page, expect, contextVariables);
      
      // Update the context variables with any new variables created
      for (const [key, value] of Object.entries(newVars)) {
        contextVariables.set(key, value);
      }
    } finally {
      // Restore to reasonable default timeout
      page.setDefaultTimeout(5000);
    }
  }

  private async executeScriptContent(script: string, page: Page): Promise<void> {
    // Extract the test function content
    const testMatch = script.match(/test\([^,]+,\s*async\s*\(\s*\{\s*page[^}]*\}\s*\)\s*=>\s*\{([\s\S]*)\}\s*\);/);
    if (!testMatch) {
      throw new Error('Could not extract test function from script');
    }

    const testBody = testMatch[1];
    // Execute the entire test body as one async function
    const executeTest = new Function('page', 'expect', `return (async () => { ${testBody} })()`);
    await executeTest(page, expect);
  }

  private async getEnhancedPageInfo(page: Page): Promise<PageInfo> {
    try {
      return await getEnhancedPageInfo(page);
    } catch (error) {
      return {
        url: page.url(),
        title: 'Unknown',
        elements: 'Unable to extract',
        formFields: 'Unable to extract',
        interactiveElements: 'Unable to extract',
        pageStructure: 'Unable to extract'
      };
    }
  }

  private buildFailureHistory(
    repairHistory: Array<{ attempt: number; action: StepRepairAction; error: string; pageInfo: PageInfo }>,
    originalStep: ScriptStep,
    originalError: any
  ): string {
    if (repairHistory.length === 0) {
      return `Original failure: ${this.safeSerializeError(originalError)}`;
    }

    let history = `Original failure: ${this.safeSerializeError(originalError)}\n\n`;
    history += `Previous repair attempts:\n`;
    
    repairHistory.forEach((attempt, index) => {
      history += `Attempt ${attempt.attempt}:\n`;
      history += `  Operation: ${attempt.action.operation}\n`;
      if (attempt.action.newStep) {
        history += `  Description: ${attempt.action.newStep.description}\n`;
        history += `  Code: ${attempt.action.newStep.code}\n`;
      }
      history += `  Error: ${attempt.error}\n`;
      if (index < repairHistory.length - 1) {
        history += `\n`;
      }
    });

    return history;
  }

  private buildRecentRepairsContext(
    recentRepairs: Array<{
      stepNumber: number;
      operation: string;
      originalDescription?: string;
      newDescription?: string;
      originalCode?: string;
      newCode?: string;
    }>
  ): string {
    if (recentRepairs.length === 0) {
      return 'No recent repairs to consider.';
    }

    let context = 'Recent successful repairs that may affect this step:\n\n';
    
    recentRepairs.forEach((repair, index) => {
      context += `Step ${repair.stepNumber} was successfully repaired:\n`;
      context += `  Operation: ${repair.operation}\n`;
      
      if (repair.operation === 'REMOVE') {
        context += `  Removed: "${repair.originalDescription}"\n`;
        context += `  Code removed:\n    ${repair.originalCode?.replace(/\n/g, '\n    ')}\n`;
      } else if (repair.operation === 'INSERT') {
        context += `  Inserted: "${repair.newDescription}"\n`;
        context += `  Code inserted:\n    ${repair.newCode?.replace(/\n/g, '\n    ')}\n`;
      } else {
        context += `  Original: "${repair.originalDescription}"\n`;
        context += `  Repaired: "${repair.newDescription}"\n`;
        context += `  Code changed from:\n    ${repair.originalCode?.replace(/\n/g, '\n    ')}\n`;
        context += `  To:\n    ${repair.newCode?.replace(/\n/g, '\n    ')}\n`;
      }
      
      if (index < recentRepairs.length - 1) {
        context += `\n`;
      }
    });

    context += '\nConsider how these changes might affect the current step and adjust accordingly.';
    return context;
  }

  private async applyRepairActionInContext(
    action: StepRepairAction,
    steps: (ScriptStep & { success?: boolean; error?: string })[],
    currentIndex: number,
    page: Page,
    executionContext: string,
    contextVariables: Map<string, any>
  ): Promise<{ success: boolean; error?: string; updatedContext?: string }> {
    try {
      switch (action.operation) {
        case StepOperation.MODIFY:
          if (action.newStep && action.stepIndex !== undefined) {
            // Modify existing step
            steps[action.stepIndex] = {
              ...action.newStep,
              success: false,
              error: undefined
            };
            // Test the modified step with current page state and variables
            await this.executeStepCode(action.newStep.code, page);
            return { success: true, updatedContext: executionContext + action.newStep.code };
          }
          break;
          
        case StepOperation.INSERT:
          if (action.newStep && action.insertAfterIndex !== undefined) {
            // Insert new step after specified index
            const insertIndex = action.insertAfterIndex + 1;
            const newStep = {
              ...action.newStep,
              success: false,
              error: undefined
            };
            console.log(`INSERT: Inserting step at index ${insertIndex} with description "${newStep.description}"`);
            console.log(`INSERT: Steps before insertion:`, steps.map((s, i) => `${i}: "${s.description}" (success: ${s.success})`));
            
            // Preserve success status of existing steps before insertion
            const successStatusMap = new Map(steps.map((step, index) => [index, { success: step.success, error: step.error }]));
            
            steps.splice(insertIndex, 0, newStep);
            
            // Restore success status for steps that were shifted by the insertion
            // Steps at insertIndex and before keep their original status
            // Steps after insertIndex need to be shifted to their new positions
            for (let i = insertIndex + 1; i < steps.length; i++) {
              const originalIndex = i - 1; // The step that was originally at this position
              if (successStatusMap.has(originalIndex)) {
                const status = successStatusMap.get(originalIndex)!;
                steps[i].success = status.success;
                steps[i].error = status.error;
              }
            }
            
            // CRITICAL FIX: Ensure the inserted step doesn't overwrite existing step data
            // The new step should only have its own description, not inherit from existing steps
            console.log(`INSERT: Final step array after restoration:`, steps.map((s, i) => `${i}: "${s.description}" (success: ${s.success})`));
            
            console.log(`INSERT: Steps after insertion:`, steps.map((s, i) => `${i}: "${s.description}" (success: ${s.success})`));
            // Test the new step with current page state
            await this.executeStepCode(action.newStep.code, page);
            return { success: true, updatedContext: executionContext + action.newStep.code };
          }
          break;
          
        case StepOperation.REMOVE:
          if (action.stepIndex !== undefined) {
            // Remove step
            steps.splice(action.stepIndex, 1);
            return { success: true, updatedContext: executionContext };
          }
          break;
      }
      
      return { success: false, error: 'Invalid repair action' };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error during repair action' 
      };
    }
  }

  private async applyRepairAction(
    action: StepRepairAction,
    steps: (ScriptStep & { success?: boolean; error?: string })[],
    currentIndex: number,
    page: Page
  ): Promise<{ success: boolean; error?: string }> {
    try {
      switch (action.operation) {
        case StepOperation.MODIFY:
          if (action.newStep && action.stepIndex !== undefined) {
            // Modify existing step
            steps[action.stepIndex] = {
              ...action.newStep,
              success: false,
              error: undefined
            };
            // Test the modified step
            await this.executeStepCode(action.newStep.code, page);
            return { success: true };
          }
          break;
          
        case StepOperation.INSERT:
          if (action.newStep && action.insertAfterIndex !== undefined) {
            // Insert new step after specified index
            const insertIndex = action.insertAfterIndex + 1;
            const newStep = {
              ...action.newStep,
              success: false,
              error: undefined
            };
            steps.splice(insertIndex, 0, newStep);
            // Test the inserted step
            await this.executeStepCode(action.newStep.code, page);
            return { success: true };
          }
          break;
          
        case StepOperation.REMOVE:
          if (action.stepIndex !== undefined) {
            // Remove the step
            steps.splice(action.stepIndex, 1);
            return { success: true };
          }
          break;
      }
      
      return { success: false, error: 'Invalid repair action' };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Repair action execution failed' 
      };
    }
  }



  private generateUpdatedScript(steps: (ScriptStep & { success?: boolean; error?: string })[], repairAdvice?: string): string {
    const scriptLines = [
      "import { test, expect } from '@playwright/test';",
      `test('repairedTest', async ({ page, browser, context }) => {`
    ];

    steps.forEach((step, index) => {
      scriptLines.push(`  // Step ${index + 1}: ${step.description}`);
      const codeLines = step.code.split('\n');
      codeLines.forEach(line => {
        scriptLines.push(`  ${line}`);
      });
    });

    scriptLines.push('});');
    const script = scriptLines.join('\n');
    
    // Add TestChimp comment to the repaired script with repair advice
    return addTestChimpComment(script, repairAdvice);
  }


  /**
   * Initialize browser with configuration (delegates to utility function)
   */
  private async initializeBrowser(playwrightConfig?: string, headless?: boolean, playwrightConfigFilePath?: string): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
    return initializeBrowser(playwrightConfig, headless, playwrightConfigFilePath);
  }

  /**
   * Safely serialize error information, filtering out non-serializable values
   */
  private safeSerializeError(error: any): string {
    try {
      if (error instanceof Error) {
        return error.message;
      }
      
      if (typeof error === 'string') {
        return error;
      }
      
      if (typeof error === 'object' && error !== null) {
        // Try to extract meaningful information without serializing the entire object
        const safeError: any = {};
        
        // Copy safe properties
        if (error.message) safeError.message = error.message;
        if (error.name) safeError.name = error.name;
        if (error.code) safeError.code = error.code;
        if (error.status) safeError.status = error.status;
        
        // Try to get stack trace safely
        if (error.stack && typeof error.stack === 'string') {
          safeError.stack = error.stack;
        }
        
        return JSON.stringify(safeError);
      }
      
      return String(error);
    } catch (serializationError) {
      // If even safe serialization fails, return a basic string representation
      return `Error: ${String(error)}`;
    }
  }
}
