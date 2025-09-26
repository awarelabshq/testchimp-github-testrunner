// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * Playwright MCP configuration - JavaScript config file content (playwright.config.js)
 */
export type PlaywrightConfig = string;

// ============================================================================
// SCRIPT EXECUTION TYPES
// ============================================================================

/**
 * Request structure for the Playwright script executor
 */
export interface PlaywrightExecutionRequest {
  /** Main Playwright script content */
  script: string;
  /** Optional pre-script to run before the main script */
  prescript?: string;
  /** Optional post-script to run after the main script */
  postscript?: string;
  /** Playwright configuration file content */
  playwrightConfig: string;
  /** Optional GPT model to use for AI operations */
  model?: string;
}

/**
 * Response structure for the Playwright script executor
 */
export interface PlaywrightExecutionResponse {
  /** Whether the execution was successful */
  success: boolean;
  /** Execution results from each script phase */
  results: {
    prescript?: ScriptResult;
    script: ScriptResult;
    postscript?: ScriptResult;
  };
  /** Overall execution time in milliseconds */
  executionTime: number;
  /** Any errors that occurred during execution */
  error?: string;
}

/**
 * Individual script execution result
 */
export interface ScriptResult {
  /** Whether this specific script executed successfully */
  success: boolean;
  /** Output from the script execution */
  output: string;
  /** Any errors from this script */
  error?: string;
  /** Execution time for this script in milliseconds */
  executionTime: number;
}

// ============================================================================
// SCENARIO EXECUTION TYPES
// ============================================================================

/**
 * Scenario execution request
 */
export interface ScenarioRequest {
  scenario: string;
  testName?: string;
  playwrightConfig?: PlaywrightConfig;
  model?: string;
  outputDirectory?: string;
  logsDirectory?: string;
}

/**
 * Scenario execution job for worker queue
 */
export interface ScenarioRunJob {
  id: string;
  scenario: string;
  testName?: string;
  playwrightConfig?: PlaywrightConfig;
  model?: string;
  outputDirectory?: string;
  logsDirectory?: string;
}

/**
 * Scenario execution response
 */
export interface ScenarioResponse {
  success: boolean;
  steps: ScenarioStep[];
  generatedScript: string;
  scriptPath?: string;
  executionTime: number;
  error?: string;
}

/**
 * Individual scenario step
 */
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

/**
 * Legacy scenario job interface (for backward compatibility)
 */
export interface ScenarioJob {
  id: string;
  scenario: string;
  config?: PlaywrightConfig;
  resolve: (result: ScenarioResponse) => void;
  reject: (error: Error) => void;
}

// ============================================================================
// AI REPAIR TYPES
// ============================================================================

/**
 * Execution mode for script execution
 */
export enum ExecutionMode {
  RUN_EXACTLY = 'RUN_EXACTLY',
  RUN_WITH_AI_REPAIR = 'RUN_WITH_AI_REPAIR'
}

/**
 * Script execution request with AI repair capabilities
 */
export interface ScriptExecutionRequest {
  script?: string; // Optional if scriptFilePath is provided
  scriptFilePath?: string; // Path to script file (alternative to script content)
  mode: ExecutionMode;
  repair_flexibility?: number; // 0-5, defaults to 3
  playwrightConfig?: PlaywrightConfig;
  playwrightConfigFilePath?: string; // Path to playwright config file (alternative to playwrightConfig content)
  model?: string;
  headless?: boolean; // defaults to false (headed)
  deflake_run_count?: number; // defaults to 1
}

/**
 * Script execution response with repair information
 */
export interface ScriptExecutionResponse {
  run_status: 'success' | 'failed';
  repair_status?: 'success' | 'failed' | 'partial';
  repair_confidence?: number; // 0-5
  repair_advice?: string;
  updated_script?: string;
  executionTime: number;
  num_deflake_runs?: number; // Number of deflaking runs made (excluding original run)
  error?: string;
}

/**
 * Individual script step for AI repair
 */
export interface ScriptStep {
  description: string;
  code: string;
  success?: boolean;
  error?: string;
}

/**
 * Step operation types for AI repair
 */
export enum StepOperation {
  MODIFY = 'MODIFY',
  INSERT = 'INSERT',
  REMOVE = 'REMOVE'
}

/**
 * Step repair action
 */
export interface StepRepairAction {
  operation: StepOperation;
  stepIndex?: number; // For MODIFY and REMOVE operations
  newStep?: ScriptStep; // For MODIFY and INSERT operations
  insertAfterIndex?: number; // For INSERT operation
}

// Repair suggestion and confidence interfaces are now in llm-facade.ts