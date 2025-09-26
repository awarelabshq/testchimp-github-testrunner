import { ScriptResult, PlaywrightConfig } from './types';
import { chromium, firefox, webkit, Browser, Page, BrowserContext } from 'playwright';
import { initializeBrowser } from './utils/browser-utils';

/**
 * Service for executing Playwright scripts using worker pool
 */
export class PlaywrightMCPService {
  private isConnected = false;

  constructor() {
    // No initialization needed for direct Playwright execution
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing Playwright service...');
      
      // No specific initialization needed for direct Playwright execution
      this.isConnected = true;
      console.log('Playwright service initialized successfully');
    } catch (error) {
      throw new Error(`Failed to initialize Playwright service: ${error}`);
    }
  }

  /**
   * Execute a complete job (prescript + script + postscript) using worker pool
   */
  async executeJob(prescript: string | undefined, script: string, postscript: string | undefined, config?: PlaywrightConfig): Promise<{
    success: boolean;
    results: {
      prescript?: ScriptResult;
      script: ScriptResult;
      postscript?: ScriptResult;
    };
    executionTime: number;
    error?: string;
  }> {
    if (!this.isConnected) {
      throw new Error('Service not initialized');
    }

    try {
      // Execute the job directly using Playwright
      return await this.executeScriptDirectly(prescript, script, postscript, config);
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
   * Prepare the script content for execution
   */
  private prepareScript(script: string, config?: PlaywrightConfig): string {
    // If the script looks like a test file, return as-is
    if (script.includes('test(') || script.includes('describe(')) {
      return script;
    }

    // If it's a list of Playwright commands, wrap in a test
    return `
      test('executed script', async ({ page }) => {
        ${script}
      });
    `;
  }

  /**
   * Close the service
   */
  /**
   * Execute script directly using Playwright
   */
  private async executeScriptDirectly(
    prescript: string | undefined, 
    script: string, 
    postscript: string | undefined, 
    config?: PlaywrightConfig
  ): Promise<{
    success: boolean;
    results: {
      prescript?: ScriptResult;
      script: ScriptResult;
      postscript?: ScriptResult;
    };
    executionTime: number;
    error?: string;
  }> {
    const startTime = Date.now();
    let browser: Browser | undefined;
    let context: BrowserContext | undefined;
    let page: Page | undefined;

    try {
      // Use the centralized browser initialization utility
      const browserInstance = await initializeBrowser(config);
      browser = browserInstance.browser;
      context = browserInstance.context;
      page = browserInstance.page;

      const results: {
        prescript?: ScriptResult;
        script: ScriptResult;
        postscript?: ScriptResult;
      } = {
        script: { success: false, output: '', error: '', executionTime: 0 }
      };

      // Execute prescript
      if (prescript) {
        try {
          const scriptFunction = new Function('page', 'browser', 'context', `
            return (async () => {
              ${prescript}
            })();
          `);
          await scriptFunction(page, browser, context);
          results.prescript = { success: true, output: 'Prescript executed successfully', error: '', executionTime: 0 };
        } catch (error: any) {
          results.prescript = { success: false, output: '', error: error.message, executionTime: 0 };
        }
      }

      // Execute main script
      try {
        const scriptFunction = new Function('page', 'browser', 'context', `
          return (async () => {
            ${script}
          })();
        `);
        await scriptFunction(page, browser, context);
        results.script = { success: true, output: 'Script executed successfully', error: '', executionTime: 0 };
      } catch (error: any) {
        results.script = { success: false, output: '', error: error.message, executionTime: 0 };
      }

      // Execute postscript
      if (postscript) {
        try {
          const scriptFunction = new Function('page', 'browser', 'context', `
            return (async () => {
              ${postscript}
            })();
          `);
          await scriptFunction(page, browser, context);
          results.postscript = { success: true, output: 'Postscript executed successfully', error: '', executionTime: 0 };
        } catch (error: any) {
          results.postscript = { success: false, output: '', error: error.message, executionTime: 0 };
        }
      }

      return {
        success: results.script.success,
        results,
        executionTime: Date.now() - startTime
      };

    } catch (error: any) {
      return {
        success: false,
        results: {
          script: { success: false, output: '', error: error.message, executionTime: 0 }
        },
        executionTime: Date.now() - startTime,
        error: error.message
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async close(): Promise<void> {
    try {
      // No cleanup needed for direct Playwright execution
      this.isConnected = false;
      console.log('Playwright service closed');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.isConnected;
  }
}
