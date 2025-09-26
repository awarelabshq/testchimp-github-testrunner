/**
 * All LLM prompts used throughout the application
 */

export const PROMPTS = {
  // Test name generation
  TEST_NAME_GENERATION: {
    SYSTEM: 'You are an AI assistant that generates meaningful test names for user journey tests. Carefully analyze the scenario description to look for any hints, indicators, or explicit mentions of what this test should be called. Pay attention to phrases like "test", "scenario", "check", "verify", "flow", or any descriptive terms that suggest the test purpose. If you find such indicators, use them as the basis for the test name. Otherwise, analyze the overall user journey and business purpose. Generate a concise test name (under 30 characters) in camelCase format. Respond with a JSON object in this format: {"testName": "userJourneyName"}',
    
    USER: (scenario: string) => `Analyze this scenario description and generate a meaningful test name:\n\n"${scenario}"\n\nInstructions:\n1. Look for ANY hints or indicators in the text that suggest what this test should be called:\n   - Explicit mentions: "Test: ...", "Scenario: ...", "Check: ...", "Verify: ..."\n   - Descriptive phrases: "...flow", "...process", "...journey", "...workflow"\n   - Action-focused terms: "login", "registration", "purchase", "messaging", "search"\n   - Business context: "user onboarding", "checkout process", "team collaboration"\n2. If you find such indicators, use them as the basis for the test name\n3. If not found, analyze the user journey and business purpose\n4. Generate a concise name under 30 characters in camelCase\n\nExamples:\n- "Test: User login and messaging flow" -> "userLoginAndMessagingFlow"\n- "Checkout process with payment" -> "checkoutProcess"\n- "User registration and email verification" -> "userRegistration"\n- "Team messaging and collaboration" -> "teamMessaging"`
  },

  // Scenario breakdown
  SCENARIO_BREAKDOWN: {
    SYSTEM: `You are an expert test automation engineer that breaks down user scenarios into precise, actionable Playwright steps.

          RULES:
          - Each step should be a single, specific action
          - Use clear, imperative language (Go to, Click, Type, Verify, etc.)
          - Include specific details (URLs, text content, element descriptions)
          - Order steps logically (navigation first, then interactions, then verifications)
          - Be specific about what to verify/assert
          
          COMMON STEP PATTERNS:
          - "Go to [URL]" - for navigation
          - "Click on [element description]" - for clicking
          - "Type '[text]' into [field description]" - for text input
          - "Verify that [condition]" - for assertions
          - "Wait for [element/condition]" - for waiting
          
          Respond with JSON: {"steps": ["step1", "step2", "step3"]}`,
    
    USER: (scenario: string) => `Break down this scenario into specific, actionable steps for Playwright automation:\n\n"${scenario}"`
  },

  // Playwright command generation
  PLAYWRIGHT_COMMAND: {
    SYSTEM: 'You are an expert Playwright automation engineer. Generate clean, concise, and reliable commands. Use Playwright\'s built-in auto-waiting instead of explicit timeouts. Keep code readable and maintainable. Learn from previous failures and adapt your approach accordingly.',
    
    USER: (stepDescription: string, pageInfo: any, previousCommands: string, attemptHistory: string, errorContext: string) => `You are an expert Playwright automation engineer. Generate a single, precise Playwright command for the given step.

    CRITICAL RULES:
    - Generate ONLY ONE command per step
    - Use the most reliable selectors (prefer getByRole, getByText, getByLabel)
    - Always wait for elements before interacting (use waitFor, waitForSelector)
    - Use proper error handling and timeouts
    - If previous attempts failed, try a COMPLETELY DIFFERENT approach
    - Learn from failures and adapt your strategy
    
    ELEMENT SELECTION PRIORITY:
    1. getByRole() - Most reliable for interactive elements
    2. getByText() - For text content
    3. getByLabel() - For form inputs
    4. getByPlaceholder() - For input placeholders
    5. getByTestId() - For test-specific elements
    6. locator() with CSS selectors - Last resort
    
    COMMON PATTERNS:
    - Navigation: await page.goto('url')
    - Click: await page.getByRole('button', { name: 'text' }).click()
    - Type: await page.getByRole('textbox', { name: 'label' }).fill('text')
    - Wait: await page.waitForLoadState('networkidle')
    - Verify: await expect(page).toHaveTitle(/expected/)
    
    CODE STYLE GUIDELINES:
    - Keep commands concise and clean
    - Avoid explicit timeouts unless necessary
    - Use Playwright's built-in auto-waiting
    - Only add timeouts for specific slow operations
    - Prefer single-line commands when possible
    
    RETRY STRATEGIES:
    - Timeout errors: Add waitFor() or increase timeout
    - Not found errors: Try different selectors or wait for element
    - Not visible errors: Scroll into view or wait for visibility
    - Not enabled errors: Wait for element to be enabled
    
    TIMEOUT GUIDELINES:
    - Only add explicit timeouts for slow operations (file uploads, large data loads)
    - Use page.waitForLoadState('networkidle') for page navigation
    - Use element.waitFor() only when waiting for specific conditions
    - Let Playwright's auto-waiting handle most interactions
    
    Respond with JSON:
    {
      "command": "await page.goto('https://www.google.com');",
      "reasoning": "Direct navigation to target URL",
      "selectorStrategy": "direct_navigation"
    }
    
    Current State:
    - URL: ${pageInfo.url}
    - Title: ${pageInfo.title}
    - Page Structure: ${pageInfo.pageStructure}
    - Interactive Elements: ${pageInfo.interactiveElements}
    - Form Fields: ${pageInfo.formFields}
    - All Elements: ${pageInfo.elements}
    
    Previous Commands:
    \`\`\`javascript
    ${previousCommands}
    \`\`\`
    
    ${attemptHistory}
    
    ${errorContext}
    
    Step to execute: "${stepDescription}"`
  },

  // Script parsing for AI repair
  SCRIPT_PARSING: {
    SYSTEM: 'You are an expert at parsing Playwright test scripts into logical steps. IGNORE doc comments at the top (/** ... */) as they are repair advice, not test steps. ALWAYS prioritize existing step comments over generating new ones. If the script has "// Step N:" comments, use those exactly as they are. Only generate new descriptions if no existing step comments are found. Be conservative and preserve exact code formatting.',
    
    USER: (script: string) => `Parse this Playwright test script into logical steps. Be conservative and preserve the exact code.

            Instructions:
            1. IGNORE any doc comments at the top of the script (e.g., /** ... */ or /* ... */) - these are repair advice and should not be parsed as steps
            2. FIRST, look for existing step comments (e.g., "// Step 1:", "// Step 2:", etc.) and use those as step boundaries
            3. If existing step comments are found, use them exactly as they are - do not modify or regenerate descriptions
            4. If no existing step comments, then group related commands that work together logically
            5. Preserve ALL code exactly as written - do not modify, reformat, or change any code
            6. Each step should contain commands that belong together (e.g., navigation + wait, form filling, verification)
            7. Keep steps focused and not too granular

            Script:
            ${script}

            Return JSON object with steps array:
            {
              "steps": [
                {
                  "description": "use existing comment if available, otherwise create meaningful description",
                  "code": "exact code from script - preserve all formatting and content"
                }
              ]
            }`
  },

  // Repair suggestion
  REPAIR_SUGGESTION: {
    SYSTEM: 'You are an expert test automation engineer specializing in fixing failing Playwright tests. Analyze the current DOM state, error message, and step description to suggest the best repair action. Consider the failure history to avoid repeating the same mistakes.',
    
    USER: (stepDescription: string, stepCode: string, errorMessage: string, pageInfo: any, failureHistory: string, recentRepairs: string) => `Analyze this failing Playwright test step and suggest a repair action.

    Current Step:
    Description: ${stepDescription}
    Code: ${stepCode}
    Error: ${errorMessage}

    Current Page State:
    - URL: ${pageInfo.url}
    - Title: ${pageInfo.title}
    - Interactive Elements: ${pageInfo.interactiveElements}
    - Form Fields: ${pageInfo.formFields}

    ${failureHistory}

    ${recentRepairs}

    Choose the best repair action:
    1. MODIFY - Fix the current step with better selectors, waits, or logic
    2. INSERT - Add a new step before the current one (e.g., wait for element, scroll into view)
    3. REMOVE - Skip this step entirely if it's not essential

    Respond with JSON:
    {
      "shouldContinue": true/false,
      "reason": "explanation of decision",
      "action": {
        "operation": "MODIFY|INSERT|REMOVE",
        "newStep": {
          "description": "step description",
          "code": "await page.getByRole('button', { name: 'Submit' }).click();"
        }
      }
    }`
  },

  // Repair confidence assessment
  REPAIR_CONFIDENCE: {
    SYSTEM: 'You are an expert test automation engineer who writes concise repair advice to build a running understanding of this test behavior and repairs done.',
    
    USER: (originalScript: string, updatedScript: string) => `You are an expert test automation engineer. Generate a short repair advice that will be used to build a running understanding of this test.

            Original Script:
            ${originalScript}

            Repaired Script:
            ${updatedScript}

            Instructions:
            1. Compare the original and repaired scripts to identify what was fixed
            2. Determine confidence level (0-5) where:
               - 0 = Low confidence, repairs may be unreliable
               - 5 = High confidence, repairs are solid and maintainable
            3. Write SHORT advice (few short sentences max) that:
               - States what specific fix was made
               - Builds on any previous repair advice found in the original script
               - Captures patterns (e.g., "usually fails on selector issues", "often needs deflaking")
               - Will help future repairs understand this test's quirks

            IMPORTANT:
            - Step comments are EXPECTED and GOOD - do not mention them as issues
            - Be concise and factual
            - Focus on the actual fix made, not general recommendations
            - Build a running understanding of this test's behavior relating to the repairs done
            - If the original script contains previous repair advice, build upon it to create a cumulative understanding

            Respond with JSON:
            {
              "confidence": 0-5,
              "advice": "short factual statement about the fix and test patterns"
            }`
  },

  // Final script generation
  FINAL_SCRIPT: {
    SYSTEM: 'You are an expert at creating drop-in replacement scripts. Generate a complete, properly formatted script that preserves the original structure while incorporating repairs and new advice.',
    
    USER: (originalScript: string, updatedScript: string, newRepairAdvice: string) => `You are an expert at generating drop-in replacement scripts. Create a final script that can be pasted directly into the original file.

            Original Script (with existing repair advice):
            ${originalScript}

            Updated Script (with repairs):
            ${updatedScript}

            New Repair Advice:
            ${newRepairAdvice}

            Instructions:
            1. Create a drop-in replacement that preserves the original test name and structure
            2. Update the TestChimp comment block at the top to include BOTH existing and new repair advice
            3. If there was existing repair advice, combine it with the new advice to build a running understanding
            4. Use the repaired code from the updated script
            5. Preserve the original test name (don't use 'repairedTest')
            6. Keep the same import statements and overall structure
            7. Ensure the script is properly formatted and ready to use
            8. The repair advice should accumulate knowledge about this test's behavior patterns

            Return JSON object with the final script:
            {
              "script": "complete final script that can be pasted into the original file"
            }`
  }
};
