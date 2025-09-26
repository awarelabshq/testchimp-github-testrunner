import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { build } from 'esbuild';

/**
 * Initialize browser with Playwright configuration
 * @param playwrightConfig - JavaScript config file content (playwright.config.js)
 * @param headless - Override headless mode (optional)
 * @returns Browser, context, and page instances
 */
export async function initializeBrowser(
  playwrightConfig?: string, 
  headless?: boolean,
  playwrightConfigFilePath?: string
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  console.log('Initializing browser with Playwright');
  
  let contextOptions: any = {};
  
  // Let Playwright handle the config file directly if provided
  if (playwrightConfigFilePath) {
    // Resolve the path - it might be relative or absolute
    const resolvedPath = path.isAbsolute(playwrightConfigFilePath) 
      ? playwrightConfigFilePath 
      : path.resolve(process.cwd(), playwrightConfigFilePath);
    
    console.log(`Looking for Playwright config at: ${resolvedPath}`);
    console.log(`File exists: ${fs.existsSync(resolvedPath)}`);
    
    if (fs.existsSync(resolvedPath)) {
      console.log(`Loading Playwright config from: ${resolvedPath}`);

      try {
        // Transpile the config in-memory and evaluate it
        console.log(`Transpiling config in-memory from: ${resolvedPath}`);
        
        const result = await build({
          entryPoints: [resolvedPath],
          bundle: true,
          platform: 'node',
          format: 'cjs',
          sourcemap: false,
          target: 'node18',
          logLevel: 'silent',
          write: false, // Don't write to file, get the result in memory
          external: [
            '@playwright/test',
            'playwright',
            'playwright-core'
          ]
        });

        if (!result.outputFiles || result.outputFiles.length === 0) {
          throw new Error('esbuild failed to generate output');
        }

        const transpiledCode = result.outputFiles[0].text;
        console.log(`Transpilation complete. Generated ${transpiledCode.length} characters of code`);
        
        // Evaluate the transpiled code in a safe context
        const loadedConfig = eval(transpiledCode);
        console.log('Loaded config object:', loadedConfig);
        console.log('Config type:', typeof loadedConfig);
        console.log('Config keys:', loadedConfig ? Object.keys(loadedConfig) : 'null/undefined');
        
        // Get the actual config from the default export (ES module transpiled to CommonJS)
        const actualConfig = loadedConfig.default || loadedConfig;
        console.log('Actual config:', actualConfig);
        console.log('Actual config keys:', actualConfig ? Object.keys(actualConfig) : 'null/undefined');
        
        if (!actualConfig) {
          console.log('Config import did not return a valid config; using defaults');
        } else {
          // Apply global use options
          if (actualConfig.use) {
            contextOptions = { ...actualConfig.use };
            console.log('Applied context options from Playwright config:', contextOptions);
          } else {
            console.log('No use property found in config');
          }
          // Apply first project overrides if present
          if (Array.isArray(actualConfig.projects) && actualConfig.projects.length > 0) {
            const firstProject = actualConfig.projects[0];
            if (firstProject && firstProject.use) {
              contextOptions = { ...contextOptions, ...firstProject.use };
              console.log('Applied project-specific options:', firstProject.use);
            }
          } else {
            console.log('No projects found in config');
          }
        }

        // No cleanup needed - we used in-memory transpilation

      } catch (error) {
        console.log(`Failed to load Playwright config via esbuild/import: ${error}`);
        console.log('Using default browser settings');
      }
    } else {
      console.log(`Playwright config file not found at: ${resolvedPath}`);
      console.log('Using default browser settings');
    }
  }
  
  // Use chromium as default browser
  const browser = await chromium.launch({ 
    headless: headless !== undefined ? headless : false 
  });
  
  // Create context with config options or defaults
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  
  // Set default timeout to 5 seconds (unless overridden by playwright config)
  if (!contextOptions.timeout) {
    context.setDefaultTimeout(5000);
    page.setDefaultTimeout(5000);
  }

  return { browser, context, page };
}
