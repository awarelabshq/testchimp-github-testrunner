import axios from 'axios';
import { PROMPTS } from './prompts';
import { PageInfo } from './utils/page-info-utils';
import { StepOperation } from './types';
import { AuthConfig, createAuthConfigFromEnv, getAuthHeaders } from './auth-config';
import { loadEnvConfig } from './env-loader';

// LLM Request/Response interfaces for backend proxy
interface CallLLMRequest {
  model?: string;
  system_prompt?: string;
  user_prompt?: string;
}

interface CallLLMResponse {
  answer?: string;
}

// LLM Response interfaces
export interface LLMScenarioBreakdownResponse {
  steps: string[];
}

export interface LLMPlaywrightCommandResponse {
  command: string;
  reasoning?: string;
}

export interface LLMTestNameResponse {
  testName: string;
}

export interface RepairSuggestionResponse {
  shouldContinue: boolean;
  reason: string;
  action: {
    operation: StepOperation;
    stepIndex?: number;
    newStep?: {
      description: string;
      code: string;
    };
    insertAfterIndex?: number;
  };
}

export interface RepairConfidenceResponse {
  confidence: number;
  advice: string;
}

export interface ScenarioStep {
  stepNumber: number;
  description: string;
  playwrightCommand?: string;
  success?: boolean;
  error?: string;
  retryCount?: number;
  attempts?: Array<{
    attemptNumber: number;
    command?: string;
    success: boolean;
    error?: string;
    timestamp: number;
  }>;
}

export class LLMFacade {
  private backendUrl: string;
  private authConfig: AuthConfig | null;

  constructor(authConfig?: AuthConfig, backendUrl?: string) {
    // Use provided backend URL or fall back to environment configuration
    if (backendUrl) {
      this.backendUrl = backendUrl;
      console.log(`LLMFacade initialized with provided backend URL: ${this.backendUrl}`);
    } else {
      // Fall back to environment configuration for backward compatibility
      const envConfig = loadEnvConfig();
      this.backendUrl = envConfig.TESTCHIMP_BACKEND_URL;
      console.log(`LLMFacade initialized with environment backend URL: ${this.backendUrl}`);
    }
    
    // Use provided auth config or try to create from environment
    this.authConfig = authConfig || createAuthConfigFromEnv();
    
    if (!this.authConfig) {
      console.warn('TestChimp authentication not configured. LLM calls may fail.');
    }
  }

  /**
   * Update authentication configuration
   */
  setAuthConfig(authConfig: AuthConfig): void {
    this.authConfig = authConfig;
  }

  /**
   * Get current authentication configuration
   */
  getAuthConfig(): AuthConfig | null {
    return this.authConfig;
  }

  private async callLLM(request: CallLLMRequest): Promise<string> {
    if (!this.authConfig) {
      throw new Error('Authentication not configured. Please set authentication credentials.');
    }

    try {
      const authHeaders = getAuthHeaders(this.authConfig);
      const url = `${this.backendUrl}/localagent/call_llm`;
      console.log(`Making LLM call to: ${url}`);
      console.log(`Request:`, request);
      console.log(`Auth headers:`, authHeaders);
      
      const response = await axios.post(url, request, {
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout for LLM calls
      });

      if (response.data && response.data.answer) {
        return response.data.answer;
      } else {
        throw new Error('Invalid response from LLM backend');
      }
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error('LLM call failed:', error.message);
        console.error('Status:', error.response?.status);
        console.error('Status Text:', error.response?.statusText);
        console.error('Response Data:', error.response?.data);
        console.error('Request URL:', error.config?.url);
        console.error('Request Headers:', error.config?.headers);
      } else {
        console.error('LLM call failed:', error);
      }
      throw new Error(`LLM call failed: ${error.message}`);
    }
  }

  /**
   * Generate a test name from scenario description
   */
  async generateTestName(scenario: string, model: string = 'gpt-4.1-mini'): Promise<string> {
    console.log('Generating test name with LLM...');
    
    const request: CallLLMRequest = {
      model,
      system_prompt: PROMPTS.TEST_NAME_GENERATION.SYSTEM,
      user_prompt: PROMPTS.TEST_NAME_GENERATION.USER(scenario)
    };

    try {
      const response = await this.callLLM(request);
      const testNameResponse = JSON.parse(response) as LLMTestNameResponse;
      return testNameResponse.testName;
    } catch (error) {
      console.error('Failed to generate test name:', error);
      // Fallback to a simple generated name
      return `Test: ${scenario.substring(0, 50)}...`;
    }
  }

  /**
   * Break down scenario into steps
   */
  async breakdownScenario(scenario: string, model: string = 'gpt-4.1-mini'): Promise<ScenarioStep[]> {
    console.log('Breaking down scenario with LLM...');
    
    const request: CallLLMRequest = {
      model,
      system_prompt: PROMPTS.SCENARIO_BREAKDOWN.SYSTEM,
      user_prompt: PROMPTS.SCENARIO_BREAKDOWN.USER(scenario)
    };

    try {
      const response = await this.callLLM(request);
      const breakdownResponse = JSON.parse(response) as LLMScenarioBreakdownResponse;
      
      // Validate and clean up steps
      const cleanedSteps = breakdownResponse.steps
        .map(step => step.trim())
        .filter(step => step.length > 0)
        .slice(0, 10); // Limit to 10 steps max
      
      return cleanedSteps.map((desc, index) => ({
        stepNumber: index + 1,
        description: desc,
      }));
    } catch (error) {
      console.error('Failed to breakdown scenario:', error);
      // Fallback to simple breakdown
      const stepDescriptions = scenario.split('.').map(s => s.trim()).filter(s => s.length > 0);
      return stepDescriptions.map((desc, index) => ({
        stepNumber: index + 1,
        description: desc,
      }));
    }
  }

  /**
   * Generate Playwright command for a step
   */
  async generatePlaywrightCommand(
    stepDescription: string,
    pageInfo: PageInfo,
    previousSteps: ScenarioStep[],
    lastError?: string,
    currentStep?: ScenarioStep,
    model: string = 'gpt-4.1-mini'
  ): Promise<string | null> {
    console.log('Generating Playwright command with LLM...');
    
    const previousCommands = previousSteps
      .filter(s => s.playwrightCommand && s.success)
      .map(s => `// Step ${s.stepNumber}: ${s.description}\n${s.playwrightCommand}`)
      .join('\n');

    // Build comprehensive attempt history for current step
    const attemptHistory = this.buildAttemptHistory(currentStep);
    
    // Provide raw error context for LLM analysis
    const errorContext = this.buildErrorContext(lastError, currentStep);

    const prompt = PROMPTS.PLAYWRIGHT_COMMAND.USER(
      stepDescription,
      pageInfo,
      previousCommands,
      attemptHistory,
      errorContext
    );

    const request: CallLLMRequest = {
      model,
      system_prompt: PROMPTS.PLAYWRIGHT_COMMAND.SYSTEM,
      user_prompt: prompt
    };

    try {
      const response = await this.callLLM(request);
      const commandResponse = JSON.parse(response) as LLMPlaywrightCommandResponse;
      return commandResponse.command;
    } catch (error) {
      console.error('Failed to generate Playwright command:', error);
      return null;
    }
  }

  /**
   * Parse script into steps for AI repair
   */
  async parseScriptIntoSteps(script: string, model: string = 'gpt-4o-mini'): Promise<Array<{ description: string; code: string; success?: boolean; error?: string }>> {
    const request: CallLLMRequest = {
      model,
      system_prompt: PROMPTS.SCRIPT_PARSING.SYSTEM,
      user_prompt: PROMPTS.SCRIPT_PARSING.USER(script)
    };

    try {
      const response = await this.callLLM(request);
      const parsed = JSON.parse(response);
      
      // Expect JSON object with steps array
      if (parsed.steps && Array.isArray(parsed.steps)) {
        return parsed.steps;
      } else {
        console.error('Unexpected LLM response format - expected {steps: [...]}:', parsed);
        return [];
      }
    } catch (error) {
      console.error('Failed to parse LLM response as JSON:', error);
      return [];
    }
  }

  /**
   * Get repair suggestion for a failing step
   */
  async getRepairSuggestion(
    stepDescription: string,
    stepCode: string,
    errorMessage: string,
    pageInfo: PageInfo,
    failureHistory: string,
    recentRepairs: string,
    model: string = 'gpt-4.1-mini'
  ): Promise<RepairSuggestionResponse> {
    const request: CallLLMRequest = {
      model,
      system_prompt: PROMPTS.REPAIR_SUGGESTION.SYSTEM,
      user_prompt: PROMPTS.REPAIR_SUGGESTION.USER(
        stepDescription,
        stepCode,
        errorMessage,
        pageInfo,
        failureHistory,
        recentRepairs,
      )
    };

    const response = await this.callLLM(request);
    console.log(`🤖 LLM Repair Response:`, response);
    const parsed = JSON.parse(response) as any;
    console.log(`🤖 Parsed Repair Action:`, parsed);
    
    // Convert string operation to enum
    if (parsed.action && parsed.action.operation) {
      switch (parsed.action.operation) {
        case 'MODIFY':
          parsed.action.operation = StepOperation.MODIFY;
          break;
        case 'INSERT':
          parsed.action.operation = StepOperation.INSERT;
          break;
        case 'REMOVE':
          parsed.action.operation = StepOperation.REMOVE;
          break;
        default:
          parsed.action.operation = StepOperation.MODIFY;
      }
    }
    
    return parsed as RepairSuggestionResponse;
  }

  /**
   * Assess repair confidence and generate advice
   */
  async assessRepairConfidence(
    originalScript: string,
    updatedScript: string,
    model: string = 'gpt-4.1-mini'
  ): Promise<RepairConfidenceResponse> {
    const request: CallLLMRequest = {
      model,
      system_prompt: PROMPTS.REPAIR_CONFIDENCE.SYSTEM,
      user_prompt: PROMPTS.REPAIR_CONFIDENCE.USER(originalScript, updatedScript)
    };

    const response = await this.callLLM(request);
    return JSON.parse(response) as RepairConfidenceResponse;
  }

  /**
   * Generate final script with repair advice
   */
  async generateFinalScript(
    originalScript: string,
    updatedScript: string,
    newRepairAdvice: string,
    model: string = 'gpt-4o-mini'
  ): Promise<string> {
    const request: CallLLMRequest = {
      model,
      system_prompt: PROMPTS.FINAL_SCRIPT.SYSTEM,
      user_prompt: PROMPTS.FINAL_SCRIPT.USER(originalScript, updatedScript, newRepairAdvice)
    };

    const response = await this.callLLM(request);
    try {
      const parsed = JSON.parse(response);
      return parsed.script || updatedScript;
    } catch (error) {
      console.error('Failed to parse final script response:', error);
      return updatedScript;
    }
  }

  /**
   * Build attempt history for current step
   */
  private buildAttemptHistory(currentStep?: ScenarioStep): string {
    if (!currentStep || !currentStep.attempts || currentStep.attempts.length === 0) {
      return 'This is the first attempt for this step.';
    }

    const attempts = currentStep.attempts.map((attempt, index) => {
      const status = attempt.success ? '✅ SUCCESS' : '❌ FAILED';
      return `Attempt ${attempt.attemptNumber} (${status}):
  Command: ${attempt.command || 'No command generated'}
  ${attempt.error ? `Error: ${attempt.error}` : 'No error'}
  Timestamp: ${new Date(attempt.timestamp).toISOString()}`;
    }).join('\n\n');

    return `Current step attempt history:
${attempts}

LEARNING FROM FAILURES:
- Analyze what went wrong in each attempt
- Try completely different approaches for failed attempts
- If a selector failed, try alternative selectors
- If timing failed, add proper waits
- If element not found, try different strategies`;
  }

  /**
   * Build error context for LLM analysis
   */
  private buildErrorContext(lastError?: string, currentStep?: ScenarioStep): string {
    if (!lastError && (!currentStep || !currentStep.error)) {
      return '';
    }

    const errors = [];
    if (lastError) errors.push(lastError);
    if (currentStep?.error) errors.push(currentStep.error);

    const errorText = errors.join(' | ');
    
    return `ERROR CONTEXT:
Last Error: ${errorText}

ANALYZE THE ERROR AND ADAPT:
- Study the error message to understand what went wrong
- Try a completely different approach than what failed
- Consider alternative selectors, timing, or interaction methods
- Never repeat the exact same command that failed`;
  }
}
