/**
 * Script Generation Utilities
 * 
 * This module provides utilities for generating and formatting test scripts
 * with TestChimp-specific markers and comments.
 */

/**
 * TestChimp managed test comment that should be added to all generated scripts
 */
export const TESTCHIMP_MANAGED_COMMENT = `/*

This is a TestChimp Managed Test.

*/`;

/**
 * Generates TestChimp managed test comment with optional repair advice
 * @param repairAdvice Optional repair advice to include in the comment
 * @returns The complete comment block
 */
export function generateTestChimpComment(repairAdvice?: string): string {
  if (repairAdvice) {
    return `/*

This is a TestChimp Managed Test.

Repair Advice:
${repairAdvice}

*/`;
  }
  return TESTCHIMP_MANAGED_COMMENT;
}

/**
 * Adds the TestChimp managed test comment to the beginning of a script
 * @param script The original script content
 * @param repairAdvice Optional repair advice to include in the comment
 * @returns The script with TestChimp comment prepended
 */
export function addTestChimpComment(script: string, repairAdvice?: string): string {
  // If the script already has the TestChimp comment, update it with repair advice if provided
  if (script.includes('This is a TestChimp Managed Test')) {
    if (repairAdvice) {
      // Replace existing comment with new one that includes repair advice
      const commentRegex = /\/\*[\s\S]*?This is a TestChimp Managed Test\.[\s\S]*?\*\//;
      const newComment = generateTestChimpComment(repairAdvice);
      return script.replace(commentRegex, newComment);
    }
    return script;
  }

  // Add the comment at the beginning of the script
  const comment = generateTestChimpComment(repairAdvice);
  return `${comment}\n\n${script}`;
}

/**
 * Generates a complete test script with TestChimp comment, imports, and test structure
 * @param testName The name of the test
 * @param steps Array of test steps with descriptions and commands
 * @param includeTestChimpComment Whether to include the TestChimp managed test comment
 * @param repairAdvice Optional repair advice to include in the comment
 * @returns The complete test script
 */
export function generateTestScript(
  testName: string, 
  steps: Array<{ stepNumber: number; description: string; playwrightCommand?: string; success?: boolean }>,
  includeTestChimpComment: boolean = true,
  repairAdvice?: string
): string {
  const scriptLines: string[] = [];
  
  // Add TestChimp comment if requested
  if (includeTestChimpComment) {
    const comment = generateTestChimpComment(repairAdvice);
    scriptLines.push(comment);
    scriptLines.push('');
  }
  
  // Add imports
  scriptLines.push(`import { test, expect } from '@playwright/test';`);
  
  // Add test structure
  scriptLines.push(`test('${testName.replace(/'/g, "\\'")}', async ({ page, browser, context }) => {`);
  
  // Add steps
  for (const step of steps) {
    const status = step.success === false ? ' [FAILED]' : '';
    scriptLines.push(`  // Step ${step.stepNumber}: ${step.description}${status}`);
    if (step.playwrightCommand && step.success !== false) {
      scriptLines.push(`  ${step.playwrightCommand}`);
    }
  }
  
  scriptLines.push(`});`);
  
  return scriptLines.join('\n');
}

/**
 * Checks if a script is a TestChimp managed test
 * @param script The script content to check
 * @returns True if the script contains the TestChimp managed test comment
 */
export function isTestChimpManagedTest(script: string): boolean {
  return script.includes('This is a TestChimp Managed Test');
}
