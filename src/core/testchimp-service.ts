/**
 * TestChimp Runner Core
 * Shared functionality for VS Code extension and GitHub Actions
 */

// Core services
import { ExecutionService } from './execution-service';
import { ScenarioService } from './scenario-service';
import { ScenarioWorker } from './scenario-worker-class';
import { PlaywrightMCPService } from './playwright-mcp-service';
import { LLMFacade } from './llm-facade';
import { AuthConfig } from './auth-config';

export { ExecutionService, ScenarioService, ScenarioWorker, PlaywrightMCPService, LLMFacade };

// File handlers
import { FileHandler, LocalFileHandler, CIFileHandler, NoOpFileHandler } from './file-handler';
export { FileHandler, LocalFileHandler, CIFileHandler, NoOpFileHandler };

// Types
export * from './types';

// Authentication
export * from './auth-config';

// Environment configuration
export { loadEnvConfig } from './env-loader';

// Script utilities
export * from './script-utils';

// Main TestChimp service class
export class TestChimpService {
  private executionService: ExecutionService;
  public scenarioService: ScenarioService; // Make public for event listening
  private playwrightService: PlaywrightMCPService;
  private llmFacade: LLMFacade;
  private fileHandler: FileHandler;
  private authConfig: AuthConfig | null;
  private backendUrl: string;

  constructor(fileHandler?: FileHandler, authConfig?: AuthConfig, backendUrl?: string) {
    this.fileHandler = fileHandler || new NoOpFileHandler();
    this.authConfig = authConfig || null;
    this.backendUrl = backendUrl || 'https://featureservice.testchimp.io'; // Default to production
    this.playwrightService = new PlaywrightMCPService();
    this.llmFacade = new LLMFacade(this.authConfig || undefined, this.backendUrl);
    this.executionService = new ExecutionService(this.authConfig || undefined);
    this.scenarioService = new ScenarioService(2, this.fileHandler, this.authConfig || undefined);
  }

  /**
   * Set authentication configuration for the service
   */
  async setAuthConfig(authConfig: AuthConfig): Promise<void> {
    this.authConfig = authConfig;
    this.llmFacade.setAuthConfig(authConfig);
    
    // Recreate services with new auth config to ensure all workers get the updated config
    this.executionService = new ExecutionService(this.authConfig);
    this.scenarioService = new ScenarioService(2, this.fileHandler, this.authConfig);
    
    // Reinitialize the services
    await this.executionService.initialize();
    await this.scenarioService.initialize();
  }

  /**
   * Set backend URL for the service
   */
  setBackendUrl(backendUrl: string): void {
    this.backendUrl = backendUrl;
    // Recreate LLM facade with new backend URL
    this.llmFacade = new LLMFacade(this.authConfig || undefined, this.backendUrl);
  }

  /**
   * Get current authentication configuration
   */
  getAuthConfig(): AuthConfig | null {
    return this.authConfig;
  }

  async initialize(): Promise<void> {
    await this.playwrightService.initialize();
    await this.executionService.initialize();
    await this.scenarioService.initialize();
  }

  async shutdown(): Promise<void> {
    // Cleanup resources
  }

  // Scenario generation
  async generateScript(scenario: string, testName?: string, outputDirectory?: string, logsDirectory?: string): Promise<string> {
    return this.scenarioService.processScenario(scenario, testName, undefined, undefined, outputDirectory, logsDirectory);
  }

  // Test execution
  async executeScript(request: any): Promise<any> {
    // Read script content if not provided but scriptFilePath is
    if (!request.script && request.scriptFilePath) {
      try {
        const resolvedPath = this.fileHandler.resolvePath(request.scriptFilePath);
        request.script = await this.fileHandler.readTestFile(resolvedPath);
        console.log(`Read script content from file: ${resolvedPath}`);
      } catch (error) {
        throw new Error(`Failed to read script file: ${error}`);
      }
    }

    // Read Playwright config content if not provided but playwrightConfigFilePath is
    if (!request.playwrightConfig && request.playwrightConfigFilePath) {
      try {
        const resolvedPath = this.fileHandler.resolvePath(request.playwrightConfigFilePath);
        request.playwrightConfig = await this.fileHandler.readTestFile(resolvedPath);
        console.log(`Read Playwright config content from file: ${resolvedPath}`);
      } catch (error) {
        console.warn(`Failed to read Playwright config file: ${error}. Using default configuration.`);
        // Don't throw error, just use default config
      }
    }

    // Log content status
    if (request.script) {
      console.log(`Using provided script content (${request.script.length} characters)`);
    } else {
      throw new Error('Script content is required. Provide either script or scriptFilePath.');
    }

    if (request.playwrightConfig) {
      console.log(`Using provided Playwright config (${request.playwrightConfig.length} characters)`);
    } else {
      console.log(`Using default Playwright configuration`);
    }

    const result = await this.executionService.executeScript(request);
    
    // If repair succeeded and we have a file handler, write the repaired content
    if (result.repair_status === 'success' && result.updated_script && request.scriptFilePath) {
      const resolvedPath = this.fileHandler.resolvePath(request.scriptFilePath);
      await this.fileHandler.writeRepairedTest(resolvedPath, result.updated_script);
    }
    
    return result;
  }

  // Test execution with AI repair
  async executeScriptWithAIRepair(request: any): Promise<any> {
    const repairRequest = { ...request, mode: 'RUN_WITH_AI_REPAIR' };
    return this.executeScript(repairRequest);
  }

  // Find TestChimp managed tests
  findTestChimpTests(directory: string, recursive: boolean = true): string[] {
    const fs = require('fs');
    const path = require('path');
    
    const testFiles: string[] = [];
    
    function scanDir(dir: string) {
      try {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory() && recursive) {
            scanDir(fullPath);
          } else if (stat.isFile() && isTestChimpManaged(fullPath)) {
            testFiles.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    }
    
    function isTestChimpManaged(filePath: string): boolean {
      // Check if file is a test file
      if (!filePath.match(/\.(spec|test)\.(js|ts)$/)) {
        return false;
      }
      
      try {
        // Read file content
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Check for TestChimp markers
        const testChimpMarkers = [
          /\/\/ TestChimp:.*step/i,
          /\/\* TestChimp:.*step \*\//i,
          /\/\/ Step \d+:/i,
          /\/\* Step \d+: \*\//i,
          /testchimp.*step/i,
          /\/\/ AI.*repair/i,
          /\/\* AI.*repair \*\//i,
          /\/\/ TestChimp.*Managed/i,
          /\/\* TestChimp.*Managed.*\*\//i,
          /TestChimp.*Managed.*Test/i
        ];
        
        return testChimpMarkers.some(marker => marker.test(content));
      } catch (error) {
        return false;
      }
    }
    
    scanDir(directory);
    return testFiles;
  }
}
