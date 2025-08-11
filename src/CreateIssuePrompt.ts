export const GetCreateIssueContent = (testCase:string): string => {
    return `Below is the input test case:

${testCase}

# Test Case Enhancement & Script Generation Task

**TASK OBJECTIVE**: Enhance Azure DevOps test case data by expanding manual steps into detailed technical specifications AND generate corresponding Playwright TypeScript test scripts.

**CORE TASK**: Transform provided test case JSON data by expanding each high-level manual step into 3-7 detailed technical steps with element selectors, validation points, and comprehensive testing guidance.

**DELIVERABLES**:

1. Enhanced JSON with detailed technical specifications
2. Executable Playwright TypeScript test script

## PRIMARY REQUIREMENTS

### Enhanced JSON Output

- Expand high-level manual steps into 3-7 detailed technical steps
- Include element selectors (preferring semantic selectors: getByRole > getByLabel > getByTestId)
- Add validation points and error handling
- Maintain original JSON structure while enriching content

### Playwright Script Output  
- Generate single executable .spec.ts file
- Use conservative approach with only validated assertions
- Implement semantic selector hierarchy
- Include proper error handling and wait strategies

## CRITICAL PRINCIPLES

### Conservative Implementation
**FUNDAMENTAL RULE**: Generate only what can be executed successfully without fabrication.

**Requirements**:
- Base all enhancements on actual website exploration using MCP tools
- Use descriptive comments for unverified assumptions  
- Prioritize script execution over comprehensive coverage
- Never create expect() statements based on assumptions

**Forbidden Patterns**:
- ❌ Performance timing assertions (unless measured)
- ❌ Duplicate/redundant assertions on same element
- ❌ Conditional logic without proper validation
- ❌ Error state assertions without seeing actual errors
- ❌ Text content assertions without verifying exact text

## MCP EXPLORATION WORKFLOW

### Step 1: Live Website Discovery
- **TASK**: Use MCP Playwright tools to explore actual website content
- **PURPOSE**: Document real element selectors and interaction patterns
- **PROCESS**: Use \`mcp_playwright_browser_snapshot\` to capture page structure
- **VALIDATION**: Test and document working selector strategies on live site
- **OUTPUT**: Written documentation of actual site structure and behaviors

### Step 2: Interactive Content Creation  
- **REQUIREMENT**: Test each interaction manually through MCP tools
- **VERIFICATION**: Document expected outcomes observed through live testing
- **ERROR HANDLING**: Document actual error conditions and edge cases
- **RULE**: Write ONLY verified interactions into enhanced content
- **FALLBACKS**: Document multiple selector strategies for reliability

**VALIDATION = OBSERVED DOCUMENTATION, NOT FABRICATED LOGIC**

## SCRIPT GENERATION PRINCIPLES

### Conservative Implementation
**FUNDAMENTAL RULE**: Generate ONLY what can be executed successfully without fabrication.

**Core Requirements**:
1. **LIVE VALIDATION ONLY**: Every assertion must be based on actual live website exploration
2. **COMMENT UNCERTAINTY**: Use descriptive comments for any assumptions or unverified elements
3. **EXECUTABLE FIRST**: Prioritize script execution over comprehensive coverage
4. **NO FABRICATED ASSERTIONS**: Never create expect() statements based on assumptions

**Validation Checklist** - Before creating enhanced content:
- [ ] Navigation to base URL documented via MCP tools exploration
- [ ] All element selectors tested for existence and documented
- [ ] Error conditions and edge cases observed and written down
- [ ] Performance characteristics observed (no assumptions made)

**Patterns to AVOID**:
- ❌ Performance timing assertions (unless specifically measured)
- ❌ Duplicate/redundant assertions on the same element
- ❌ Conditional logic without proper validation
- ❌ Error state assertions without seeing actual errors
- ❌ Text content assertions without verifying exact text
- ❌ Count assertions (like \`expect(errors).toHaveCount(0)\`) without validation
- ❌ Complex navigation waits without testing actual flow

**Commenting Strategy**:
\`\`\`typescript
// TODO: Verify this assertion through live exploration
// await expect(page).toHaveTitle(/Microsoft Playwright Testing/);

// CAUTION: This timing check may be too stringent for different environments
// expect(loadTime).toBeLessThan(5000);

// NOTE: Stay signed in dialog may not always appear - needs conditional logic validation
// const staySignedInDialog = page.getByText(/stay signed in/i);
\`\`\`

### Script Generation Examples

#### ❌ BAD - Fabricated/Assumption-Based Code:
\`\`\`typescript
// DON'T DO THIS - Not validated through exploration
await expect(page).toHaveTitle(/Microsoft Playwright Testing/);

// DON'T DO THIS - Stringent timing without measurement
const startTime = Date.now();
expect(loadTime).toBeLessThan(5000);

// DON'T DO THIS - Fabricated error validation
const errorMessages = page.locator('[role="alert"], .error');
await expect(errorMessages).toHaveCount(0);
\`\`\`

#### ✅ GOOD - Conservative/Validated Code:
\`\`\`typescript
// GOOD - Basic navigation without assumption
await page.goto(testData.baseUrl, \{ waitUntil: 'domcontentloaded' });

// GOOD - Simple element interaction
const signInButton = page.getByRole('button', \{ name: 'Sign in' });
await expect(signInButton).toBeVisible(\{ timeout: 10000 });
await signInButton.click();

// GOOD - Conservative conditional handling
try \{
  const staySignedInDialog = page.getByText(/stay signed in/i);
  if (await staySignedInDialog.isVisible(\{ timeout: 5000 })) \{
    const yesButton = page.getByRole('button', \{ name: 'Yes' });
    if (await yesButton.isVisible()) \{
      await yesButton.click();
    }
  }
} catch (error) \{
  console.log('Stay signed in dialog not found, continuing...');
}
\`\`\`

## Input Format Specification

### JSON Test Case Input Format

**Input Structure**: This prompt processes test case data in JSON format with the following structure:

\`\`\`json
\{
    "testCaseId": 2542820,
    "name": "Successful Microsoft Account Login",
    "steps": [
        "Step 1: Navigate to the Playwright Service portal - Expected: The portal home page should load",
        "Step 2: Click on the 'Sign In' button - Expected: The authentication options should be displayed",
        "Step 3: Select 'Microsoft Account' option - Expected: The Microsoft authentication page should load",
        "Step 4: Enter valid Microsoft credentials (email) - Expected: The email should be accepted and password field should be displayed",
        "Step 5: Enter valid Microsoft password - Expected: The password should be accepted",
        "Step 6: Click 'Sign In' button on Microsoft page - Expected: Authentication should complete successfully",
        "Step 7: Verify redirection back to Playwright Service portal - Expected: User should be redirected to the portal dashboard",
        "Step 8: Verify user profile information is displayed correctly - Expected: User name and email should be visible in the header",
        "Step 9: Verify access to workspace features - Expected: User should be able to access workspace selection and management features"
    ],
    "enhanced_steps": []
}
\`\`\`

### Enhanced JSON Output Format

**Output Structure**: The enhanced JSON maintains the same structure but populates the \`enhanced_steps\` array with detailed technical specifications:

\`\`\`json
\{
    "testCaseId": 2542820,
    "name": "Successful Microsoft Account Login",
    "steps": [
        "Step 1: Navigate to the Playwright Service portal - Expected: The portal home page should load",
        "Step 2: Click on the 'Sign In' button - Expected: The authentication options should be displayed",
        "Step 3: Select 'Microsoft Account' option - Expected: The Microsoft authentication page should load",
        "Step 4: Enter valid Microsoft credentials (email) - Expected: The email should be accepted and password field should be displayed",
        "Step 5: Enter valid Microsoft password - Expected: The password should be accepted",
        "Step 6: Click 'Sign In' button on Microsoft page - Expected: Authentication should complete successfully",
        "Step 7: Verify redirection back to Playwright Service portal - Expected: User should be redirected to the portal dashboard",
        "Step 8: Verify user profile information is displayed correctly - Expected: User name and email should be visible in the header",
        "Step 9: Verify access to workspace features - Expected: User should be able to access workspace selection and management features"
    ],
    "enhanced_steps": [
        \{
            "stepNumber": 1,
            "originalStep": "Step 1: Navigate to the Playwright Service portal - Expected: The portal home page should load",
            "detailedSteps": [
                \{
                    "action": "Navigate to Base URL",
                    "description": "Navigate to https://playwright.microsoft.com portal",
                    "element": "URL navigation",
                    "selector": "N/A",
                    "waitCondition": "DOM content loaded",
                    "validation": "Page title contains 'Playwright' AND portal navigation visible",
                    "expectedResult": "Portal home page loads successfully",
                    "errorHandling": "Handle network timeouts, 404 errors, SSL certificate issues"
                },
                \{
                    "action": "Verify Page Load",
                    "description": "Confirm portal home page elements are visible and functional",
                    "element": "Main navigation, hero section, sign-in button",
                    "selector": "nav[role='navigation'], .hero-section, button:has-text('Sign in')",
                    "waitCondition": "All critical elements visible",
                    "validation": "Navigation menu accessible AND hero content displayed AND sign-in button enabled",
                    "expectedResult": "Home page fully loaded with all interactive elements",
                    "errorHandling": "Retry page load if elements not found, check for loading states"
                },
                \{
                    "action": "Performance Validation",
                    "description": "Ensure page load performance meets requirements",
                    "element": "Page load metrics",
                    "selector": "N/A",
                    "waitCondition": "Network idle state",
                    "validation": "Page load time < 3 seconds AND no console errors",
                    "expectedResult": "Portal loads within performance thresholds",
                    "errorHandling": "Log performance metrics, capture console errors for debugging"
                }
            ]
        },
        \{
            "stepNumber": 2,
            "originalStep": "Step 2: Click on the 'Sign In' button - Expected: The authentication options should be displayed",
            "detailedSteps": [
                \{
                    "action": "Locate Sign In Button",
                    "description": "Find and verify the sign-in button is clickable",
                    "element": "Sign In button",
                    "selector": "button:has-text('Sign in'), button[data-testid='sign-in'], a[href*='login']",
                    "waitCondition": "Button visible and enabled",
                    "validation": "Button clickable AND proper text/icon displayed",
                    "expectedResult": "Sign-in button located and ready for interaction",
                    "errorHandling": "Try alternative selectors, wait for dynamic content loading"
                },
                \{
                    "action": "Click Sign In Button",
                    "description": "Perform click action on sign-in button",
                    "element": "Sign In button",
                    "selector": "button:has-text('Sign in')",
                    "waitCondition": "Click action completed",
                    "validation": "Button click registered AND loading state initiated",
                    "expectedResult": "Authentication flow initiated",
                    "errorHandling": "Retry click if no response, handle disabled states"
                },
                \{
                    "action": "Verify Authentication Options",
                    "description": "Confirm authentication options are displayed",
                    "element": "Authentication options menu/modal",
                    "selector": "[data-testid='auth-options'], .auth-modal, .login-options",
                    "waitCondition": "Authentication options visible",
                    "validation": "Microsoft Account option visible AND other auth methods displayed",
                    "expectedResult": "Authentication options menu displayed with multiple login methods",
                    "errorHandling": "Wait for modal/options to load, handle slow network responses"
                }
            ]
        }
    ]
}
\`\`\`

### Detailed Step Schema

Each enhanced step contains the following detailed structure:

\`\`\`json
\{
    "stepNumber": 1,
    "originalStep": "Original high-level step description",
    "detailedSteps": [
        \{
            "action": "Specific action name",
            "description": "Detailed description of what this micro-step accomplishes",
            "element": "Target element or component description",
            "selector": "Playwright selector strategy (semantic hierarchy preferred)",
            "waitCondition": "What to wait for before proceeding",
            "validation": "Success criteria and checkpoints",
            "expectedResult": "Expected outcome of this micro-step",
            "errorHandling": "How to handle failures and edge cases"
        }
    ]
}
\`\`\`

### Azure DevOps Test Plan Analysis

**ADO Test Plan Intelligence**: Automatically analyze JSON test case data from Azure DevOps test plans, understanding common ADO field structures while remaining adaptable to custom configurations.

#### Key ADO Features:
- **Standard Fields**: Test Case ID, Title, Priority, State, Area Path, Test Steps, Expected Results, Tags
- **ADO-Specific Elements**: Shared step references, parameter syntax (@parameter), test suite hierarchy
- **Enhancement Approach**: Expand shared steps, convert parameters to concrete test data, maintain ADO traceability

#### High-Level to Detailed Transformation Examples

**Format Adaptation Examples**: The following examples demonstrate enhancement across different input formats for JSON test case structures.

**Example 1: Authentication Flow Expansion (JSON Format)**

*Original Manual Step (High-Level):*
\`\`\`json
\{
    "stepDescription": "Login to playwright.microsoft.com using username <u>, password <p>",
    "expectedResult": "User successfully authenticated and redirected to dashboard"
}
\`\`\`

*Enhanced Technical Steps (Detailed JSON):*
\`\`\`json
\{
    "stepNumber": 1,
    "originalStep": "Login to playwright.microsoft.com using username <u>, password <p>",
    "detailedSteps": [
        \{
            "action": "Navigate to Login Page",
            "description": "Navigate to https://playwright.microsoft.com/login",
            "element": "URL validation",
            "selector": "N/A",
            "waitCondition": "DOM ready",
            "validation": "Login form visible",
            "expectedResult": "Login page loads with authentication form"
        },
        \{
            "action": "Enter Credentials and Submit",
            "description": "Fill username, locate password field, fill password, click submit",
            "element": "Login form inputs",
            "selector": "input[data-testid='username'] OR input[name='email'], input[type='password']",
            "waitCondition": "Form submission response",
            "validation": "Fields accept input, form submission succeeds",
            "expectedResult": "Authentication request processed successfully"
        },
        \{
            "action": "Verify Authentication Success",
            "description": "Confirm redirect to dashboard and user session established",
            "element": "User menu and dashboard elements",
            "selector": "[data-testid='user-menu'] OR navigation with user info",
            "waitCondition": "Dashboard load complete",
            "validation": "Redirect to dashboard, auth token stored, user menu visible",
            "expectedResult": "User successfully authenticated and dashboard accessible"
        }
    ]
}
\`\`\`

**Example 2: Embedded Issue Data Processing (GitHub/ADO Issue Format)**

*Original Issue Description with Embedded Test Case:*

\`\`\`markdown
## User Story
As a QA engineer, I need to validate the Microsoft Playwright Testing platform authentication flow.

## Test Scenarios

| Test Case | Steps | Expected Result | Priority |
|-----------|--------|-----------------|----------|
| TC-AUTH-001 | Navigate to playwright.microsoft.com and click "Get Started" | Landing page loads with signup options | High |
| TC-AUTH-001 | Select "Sign up with GitHub" option | GitHub OAuth dialog appears | High |
| TC-WORKSPACE-002 | Create new workspace "TestProject" | Workspace creation form appears | Medium |

## Additional Context
- Test environment: https://playwright.microsoft.com
- Expected completion time: < 30 seconds per flow
\`\`\`

*Enhanced Output (Generated JSON Format):*

\`\`\`json
\{
    "testCases": [
        \{
            "testCaseId": "TC-AUTH-001",
            "name": "Authentication Flow Validation",
            "priority": "High",
            "steps": [
                "Navigate to playwright.microsoft.com and click 'Get Started'",
                "Select 'Sign up with GitHub' option"
            ],
            "enhanced_steps": [
                \{
                    "stepNumber": 1,
                    "originalStep": "Navigate to playwright.microsoft.com and click 'Get Started'",
                    "detailedSteps": [
                        \{
                            "action": "Navigate to Base URL",
                            "description": "Navigate to https://playwright.microsoft.com and wait for page load",
                            "element": "Get Started button",
                            "selector": "button[data-testid='get-started'] or button:has-text('Get Started')",
                            "waitCondition": "DOM ready and button clickable",
                            "validation": "Page title contains 'Playwright' AND signup section visible AND Get Started button enabled",
                            "expectedResult": "Landing page loads with signup options",
                            "errorHandling": "Handle network timeouts and page load failures"
                        }
                    ]
                },
                \{
                    "stepNumber": 2,
                    "originalStep": "Select 'Sign up with GitHub' option",
                    "detailedSteps": [
                        \{
                            "action": "Click GitHub Signup",
                            "description": "Locate and click GitHub signup option",
                            "element": "GitHub signup button",
                            "selector": "button:has-text('Sign up with GitHub')",
                            "waitCondition": "OAuth redirect initiated",
                            "validation": "GitHub button visible AND OAuth redirect to github.com domain AND OAuth state parameter present",
                            "expectedResult": "GitHub OAuth dialog appears",
                            "errorHandling": "Handle OAuth failures and redirect issues"
                        }
                    ]
                }
            ]
        }
    ]
}
\`\`\`

**Key Enhancement Features for Embedded Data:**
- **Automatic Table Detection**: Recognizes markdown tables in issue descriptions
- **Context Preservation**: Maintains issue metadata and additional context information  
- **Format Normalization**: Converts embedded tables to standardized JSON format
- **Cross-Reference Integration**: Links test scenarios with user stories and acceptance criteria
- **Technical Specification Generation**: Creates detailed implementation guidance from brief issue descriptions

### Repository Context Requirements
- **Frontend Code**: Component files, page structures, routing configurations
- **Test Utilities**: Existing test helpers, data-testid patterns, test constants
- **Configuration Files**: Environment settings, build configurations

## Enhanced Output Format

### JSON Structure Preservation (Enhanced Test Cases)

**Format Compatibility**: The enhanced output maintains the EXACT same JSON structure as the input, preserving all original fields while populating the \`enhanced_steps\` array with detailed technical specifications.

#### Enhancement Strategy:
1. **Preserve Original Structure**: Keep all input JSON fields unchanged
2. **Populate Enhanced Steps**: Fill the \`enhanced_steps\` array with comprehensive technical details  
3. **Maintain Compatibility**: Ensure enhanced JSON can be processed by existing tools
4. **Add Technical Depth**: Embed comprehensive validation and technical details within structured format

#### Example Enhancement (JSON Test Case Format):

**Input JSON Example:**
\`\`\`json
\{
    "testCaseId": 12345,
    "name": "User Authentication Flow", 
    "priority": "High",
    "steps": [
        "Navigate to login page",
        "Enter valid credentials", 
        "Access main dashboard"
    ],
    "enhanced_steps": []
}
\`\`\`

**Enhanced JSON Output:**
\`\`\`json
\{
    "testCaseId": 12345,
    "name": "User Authentication Flow",
    "priority": "High", 
    "steps": [
        "Navigate to login page",
        "Enter valid credentials",
        "Access main dashboard"
    ],
    "enhanced_steps": [
        \{
            "stepNumber": 1,
            "originalStep": "Navigate to login page",
            "detailedSteps": [
                \{
                    "action": "Navigate to Login URL",
                    "description": "Navigate to \{baseURL}/login with proper wait conditions",
                    "element": "URL navigation",
                    "selector": "N/A",
                    "waitCondition": "DOM ready",
                    "validation": "Page title='Login' AND form[data-testid='login-form'] visible",
                    "expectedResult": "Login page loads with authentication form",
                    "errorHandling": "Handle 404/timeout/CSP violations, retry navigation"
                },
                \{
                    "action": "Verify Form Elements",
                    "description": "Confirm login form fields are present and functional",
                    "element": "Login form inputs",
                    "selector": "input[name='username'], input[type='password'], button[type='submit']",
                    "waitCondition": "Form elements visible and enabled",
                    "validation": "Username field enabled AND password field enabled AND submit button clickable",
                    "expectedResult": "Complete authentication form ready for input",
                    "errorHandling": "Wait for dynamic form loading, handle field validation states"
                }
            ]
        },
        \{
            "stepNumber": 2,
            "originalStep": "Enter valid credentials",
            "detailedSteps": [
                \{
                    "action": "Enter Username",
                    "description": "Input valid username/email into username field",
                    "element": "Username input field",
                    "selector": "input[data-testid='username'], input[name='username'], input[type='email']",
                    "waitCondition": "Field focus and input reflection",
                    "validation": "Field accepts input AND no validation errors AND input value persists",
                    "expectedResult": "Username successfully entered and validated",
                    "errorHandling": "Handle field disabled states, format validation, session timeout"
                },
                \{
                    "action": "Enter Password",
                    "description": "Input valid password with masking verification",
                    "element": "Password input field", 
                    "selector": "input[type='password'], input[data-testid='password']",
                    "waitCondition": "Password field focused and masked input visible",
                    "validation": "Password masking active AND field accepts input AND no leak in network",
                    "expectedResult": "Password entered securely with proper masking",
                    "errorHandling": "Verify password security, handle validation failures"
                },
                \{
                    "action": "Submit Credentials",
                    "description": "Click submit button and monitor authentication request",
                    "element": "Submit button",
                    "selector": "button[type='submit'], button:has-text('Sign in'), input[type='submit']",
                    "waitCondition": "Authentication response received",
                    "validation": "Auth request sent AND response received AND no error messages",
                    "expectedResult": "Authentication submitted and processed",
                    "errorHandling": "Handle network errors, auth failures, loading timeouts"
                }
            ]
        }
    ]
}
\`\`\`

## Enhancement Process

### Phase 1: Setup & MCP Exploration
1. **Environment Analysis**: Analyze repository structure and identify testing patterns
2. **Live Site Access**: Navigate to provided URL using MCP tools and verify accessibility
3. **MANDATORY Complete Navigation**: For EVERY test step - navigate exact user flows, capture element properties, document behaviors through MCP tools
4. **Element Discovery**: Extract and test actual selectors using live site inspection
5. **Evidence Collection**: Capture screenshots, interaction logs, and validation evidence

### Phase 2: Enhancement & Script Generation  
1. **Step Expansion**: Transform each manual step into 3-7 detailed technical steps
2. **Playwright Script Creation**: Generate single executable .spec.ts file with semantic selectors
3. **MCP Validation**: Simulate every script step using MCP tools for 100% validation
4. **File Creation**: Create enhanced JSON, test script, and evidence files using create_file tool

2. **Simple Playwright TypeScript Script Generation**

**🎯 DELIVERABLE REQUIREMENT**: Generate a single, simple Playwright TypeScript test script file

**🚨 MANDATORY VALIDATION REQUIREMENT**: All generated test scripts MUST be validated through MCP Playwright simulation tools to ensure 100% executability before delivery.

**Script Structure & Implementation**:
\`\`\`typescript
import \{ test, expect } from '@playwright/test';

// Simple test script for [Test Case Name]
test.describe('[Test Case Suite]', () => \{
  test('[TC-ID]: [Test Case Description]', async (\{ page }) => \{
    // Direct implementation of enhanced test steps
    // No complex folder structure or configuration
    // Self-contained test script
  });
});
\`\`\`

**Semantic Selector Hierarchy (Use in order of preference)**:
\`\`\`typescript
// 1. ARIA Roles (Highest Priority)
await page.getByRole('button', \{ name: 'Submit' }).click();
await page.getByRole('textbox', \{ name: 'Username' }).fill('testuser');

// 2. Labels for Form Elements
await page.getByLabel('Email Address').fill('test@example.com');
await page.getByLabel('Password').fill('securepass123');

// 3. Test IDs for Custom Components  
await page.getByTestId('login-form').isVisible();
await page.getByTestId('submit-button').click();

// 4. Text Content (when unique)
await page.getByText('Welcome to Dashboard').isVisible();

// 5. CSS Selectors (Last Resort)
await page.locator('[data-cy="advanced-selector"]').click();
\`\`\`

**Error Handling & Performance**:
\`\`\`typescript
// Wait & Retry Strategies
await page.waitForLoadState('networkidle');
await expect(async () => \{
  await page.getByRole('button', \{ name: 'Submit' }).click();
  await expect(page.getByText('Success')).toBeVisible();
}).toPass(\{ timeout: 10000 });

// Error Recovery
try \{
  await page.getByRole('button', \{ name: 'Submit' }).click(\{ timeout: 5000 });
} catch (error) \{
  await page.screenshot(\{ path: 'error-submit.png' });
  throw new Error(\`Submit button interaction failed: $\{error.message}\`);
}
\`\`\`

### Phase 4: MANDATORY MCP Validation Protocol

**🚨 CRITICAL REQUIREMENT**: Every generated Playwright script MUST be validated through MCP Playwright simulation tools to ensure 100% executability.

**🎯 SIMULATION-BASED VALIDATION**: Use MCP Playwright browser tools to simulate script execution and validate functionality without direct Playwright test runner execution.

**MCP Simulation Protocol**:
\`\`\`
🚨 MANDATORY MCP SIMULATION EXECUTION:

For EVERY generated test script WITHOUT EXCEPTION:
- MUST simulate each test step using corresponding MCP tools:
  * page.goto() → mcp_playwright_browser_navigate
  * page.click() → mcp_playwright_browser_click  
  * page.type() → mcp_playwright_browser_type
  * page.getByRole() → mcp_playwright_browser_snapshot + element inspection
  * expect().toBeVisible() → mcp_playwright_browser_snapshot + visual validation

- MUST validate that all scripted selectors work in MCP simulation
- MUST verify that all assertions would pass through MCP tool validation
- MUST confirm proper error handling through MCP interaction testing
- MUST document simulation results for each test step

SIMULATION REQUIREMENTS:
- Simulate script against the actual live URL used for enhancement
- Test all user flows step-by-step using MCP tools
- Validate performance expectations through MCP monitoring
- Verify network interactions using mcp_playwright_browser_network_requests
- Confirm screenshot capture points using mcp_playwright_browser_take_screenshot
\`\`\`

**Script Refinement & Evidence Collection**:
\`\`\`
If MCP simulation reveals issues:
- MUST identify specific failure points through MCP tool interactions
- MUST correct selectors based on live MCP site inspection
- MUST adjust timing and wait strategies based on MCP observations
- MUST re-simulate script steps until 100% MCP validation success
- MUST document all corrections and reasoning based on MCP findings

DELIVERABLE PROOF:
- MCP simulation evidence showing all script steps work as intended
- Screenshots from mcp_playwright_browser_take_screenshot for visual validation
- Network request logs from mcp_playwright_browser_network_requests
- Console output from mcp_playwright_browser_console_messages showing clean execution
\`\`\`

**MCP Tools Reference**:
- **Navigation**: \`mcp_playwright_browser_navigate\`, \`mcp_playwright_browser_snapshot\`, \`mcp_playwright_browser_tab_new\`
- **Interaction**: \`mcp_playwright_browser_click\`, \`mcp_playwright_browser_type\`, \`mcp_playwright_browser_select_option\`
- **Validation**: \`mcp_playwright_browser_console_messages\`, \`mcp_playwright_browser_network_requests\`, \`mcp_playwright_browser_take_screenshot\`, \`mcp_playwright_browser_evaluate\`

## Quality Standards & Constraints

### Output Requirements
- **Selector Quality**: Prefer data-testid > role-based > CSS selectors
- **Validation Coverage**: Functional, visual, data, error, and performance testing
- **Technical Documentation**: Clear, complete, testable, and maintainable specifications
- **Script Execution**: 100% executable, live tested, performance verified, error resilient

### Forbidden Activities
**� NOT ALLOWED**: Building systems, tools, frameworks, or generic automation platforms
**✅ REQUIRED**: Enhance PROVIDED test case data and generate specific implementation scripts

### Task Scope
This is a **DATA ENHANCEMENT TASK with EXECUTABLE OUTPUT** - transform test case data into enhanced JSON specifications AND corresponding executable Playwright scripts.

---

## IMMEDIATE TASK INSTRUCTIONS - COMPLETE NAVIGATION MANDATORY

**🚨 PRIMARY OBJECTIVE: ENHANCED JSON FILE GENERATION**
The PRIMARY deliverable is an enhanced JSON file that MUST be created using the create_file tool. This is not optional - it is the core requirement of this task.

**When you receive test case data, follow this ENFORCED process:**

1. **Analyze the provided test case data** 
   - Parse JSON file attachments if provided
   - Extract test case data from any provided format
   - Recognize structured test scenarios within content
   - Adapt to JSON format requirements

2. **Request repository access and live URL** if not already provided  

3. **🚨 MANDATORY: Complete MCP exploration of EVERY single manual step**
   - MUST use mcp_playwright_browser_navigate to access every page/URL mentioned
   - MUST use mcp_playwright_browser_click, mcp_playwright_browser_type for every interaction
   - MUST take mcp_playwright_browser_snapshot after every action for evidence
   - MUST use mcp_playwright_browser_evaluate to inspect actual element properties
   - MUST document any MCP navigation failures with specific error reasons
   - NEVER enhance steps without complete MCP exploration evidence

4. **🚨 MANDATORY: Discover and validate element selectors through MCP tools**
   - MUST inspect actual page source using mcp_playwright_browser_evaluate
   - MUST test selectors by performing real interactions via MCP tools
   - MUST provide mcp_playwright_browser_take_screenshot evidence for each identified element
   - MUST validate selector reliability through repeated MCP interactions

5. **Expand each manual step** into 3-7 detailed technical steps ONLY after complete MCP verification

6. **🚨 MANDATORY: Create enhanced JSON file using create_file tool**
   - MUST save enhanced JSON as a proper file artifact (not just in session logs)
   - MUST use create_file tool with absolute file path
   - Use naming convention: [original-filename]_enhanced.json OR [issue-number]_test_cases_enhanced.json for embedded data
   - Examples: "test_cases_enhanced.json", "issue-123_test_cases_enhanced.json", "login_test_enhanced.json"
   - Save in same directory as original test case file or workspace root for embedded data
   - Ensure file can be committed to repository as part of PR
   - CRITICAL: Use proper JSON format with valid syntax and structure
   - **VERIFICATION REQUIRED**: After creating JSON file, confirm it appears in VS Code file explorer
   - **CONTENT VALIDATION**: JSON must contain all original test cases with enhanced technical specifications in the enhanced_steps array

7. **🚨 MANDATORY: Generate simple single-file Playwright TypeScript script using create_file tool**
   - MUST create a single .spec.ts file implementing all enhanced test steps
   - Use naming convention: [original-filename]_test.spec.ts OR [issue-number]_test.spec.ts for embedded data
   - NO complex folder structure, NO configuration files, NO test utilities
   - Simple import \{ test, expect } from '@playwright/test' structure only
   - Implement semantic selector hierarchy: getByRole > getByLabel > getByTestId > getByText > locator
   - Include comprehensive assertions and error handling in the single file

8. **🚨 MANDATORY: Validate generated script through MCP simulation**
   - MUST simulate every script step using corresponding MCP tools:
     * page.goto() → mcp_playwright_browser_navigate
     * page.click() → mcp_playwright_browser_click  
     * page.type() → mcp_playwright_browser_type
     * expect().toBeVisible() → mcp_playwright_browser_snapshot + visual validation
   - MUST verify 100% MCP simulation success with all interactions working
   - MUST iterate and fix any failures until script achieves 100% MCP validation success
   - MUST provide MCP simulation evidence (snapshots, interaction logs, console output)

9. **🚨 MANDATORY: Save all MCP evidence as file artifacts**
   - MUST save all screenshots taken during MCP exploration using create_file tool
   - MUST save MCP simulation evidence and validation results as file artifacts
   - Create screenshots folder: [original-filename]_screenshots/ OR [issue-number]_screenshots/ for embedded data
   - Use naming convention: step-[X]-[description].png (e.g., step-1-login-page.png)
   - Include MCP snapshots for every enhanced step as evidence
   - Include MCP simulation screenshots showing successful script validation
   - Ensure screenshots can be committed to repository as part of PR

10. **Output enhanced test case data** with MCP-verified specifications and MCP-validated executable scripts

**🚫 STRICTLY FORBIDDEN:**

- Creating specifications without live site verification
- Using assumed UI patterns or common practices without verification
- Expanding steps based on logical extrapolation alone
- Providing selectors that weren't tested on the live site
- Only outputting JSON content in session logs without creating actual files
- Taking screenshots without saving them as file artifacts for repository inclusion

**✅ EVIDENCE REQUIRED FOR EVERY Enhanced Step:**

- Screenshot showing the actual element/interaction
- Verified selector that was tested on live site
- Documentation of successful interaction or reason for failure

**✅ DELIVERABLE REQUIREMENTS:**

- **🚨 CRITICAL: Enhanced JSON file created using create_file tool with proper JSON formatting**
  - MUST use create_file tool to save JSON content as actual file artifact
  - MUST use proper JSON format with valid syntax and structure
  - MUST name file with "_enhanced.json" suffix (e.g., "test_cases_enhanced.json", "login_test_enhanced.json")
  - MUST ensure JSON file is saved in workspace root or same directory as source data
  - MUST verify JSON content includes all enhanced test steps with technical specifications in enhanced_steps array
- **🚨 CRITICAL: Simple single-file Playwright TypeScript script** created using create_file tool (no complex structure)
- **🚨 MANDATORY: 100% MCP-validated script with simulation evidence**
- MCP simulation results showing all script steps work successfully through MCP tools
- Screenshots folder with all MCP exploration evidence saved as file artifacts
- Script validation evidence (MCP interaction logs, console output, performance metrics)
- Files properly named and located for repository commit
- All specifications backed by complete MCP exploration evidence
- **CERTIFICATION**: Generated script validated through comprehensive MCP simulation without errors or iteration requirements

**🚨 JSON FILE FORMAT REQUIREMENTS:**
- Use standard JSON format with proper syntax
- Include all required fields: testCaseId, name, steps, enhanced_steps
- Maintain proper JSON structure and validation
- Example JSON structure:
  \`\`\`json
  \{
    "testCaseId": 12345,
    "name": "Test Case Name",
    "steps": ["Original step 1", "Original step 2"],
    "enhanced_steps": [
      \{
        "stepNumber": 1,
        "originalStep": "Original step 1",
        "detailedSteps": [
          \{
            "action": "Action name",
            "description": "Detailed description",
            "element": "Target element",
            "selector": "Playwright selector",
            "waitCondition": "Wait condition",
            "validation": "Success criteria",
            "expectedResult": "Expected outcome",
            "errorHandling": "Error handling strategy"
          }
        ]
      }
    ]
  }
  \`\`\`

**📝 JSON CREATION EXAMPLE:**
When creating the enhanced JSON file, use the create_file tool exactly like this:
\`\`\`javascript
create_file(\{
  filePath: "c:/projects/planner/enhanced_test_cases.json",
  content: JSON.stringify(\{
    "testCaseId": 12345,
    "name": "Sample Test Case",
    "steps": ["Step 1: Original description"],
    "enhanced_steps": [
      \{
        "stepNumber": 1,
        "originalStep": "Step 1: Original description",
        "detailedSteps": [
          \{
            "action": "Navigate to Page",
            "description": "Navigate to the target page",
            "element": "Page URL",
            "selector": "N/A",
            "waitCondition": "DOM ready",
            "validation": "Page loads successfully",
            "expectedResult": "Target page displayed",
            "errorHandling": "Handle navigation errors"
          }
        ]
      }
    ]
  }, null, 2)
})
\`\`\`

**Remember**: No assumptions, no patterns, no guessing. Every specification must be backed by actual live site exploration and interaction evidence. The final enhanced JSON must be created as a proper file artifact for repository inclusion.

**🚨 CRITICAL SUCCESS CRITERIA FOR JSON GENERATION:**
- The enhanced JSON file is THE PRIMARY DELIVERABLE - everything else is secondary
- MUST use create_file tool with filePath parameter and JSON content
- JSON file MUST be visible in VS Code file explorer after creation
- JSON file MUST be committable to Git repository
- JSON content MUST include enhanced test steps with technical specifications in enhanced_steps array
- Failure to create the JSON file means task failure regardless of other outputs

**🚨 FINAL FILE CREATION CHECKLIST:**
1. Enhanced JSON file MUST be created using create_file tool (not just displayed in chat)
2. JSON file MUST have proper filename ending in "_enhanced.json"
3. JSON file MUST contain properly formatted JSON data with all required fields
4. Playwright script file MUST be created using create_file tool
5. Screenshot files MUST be created using create_file tool for evidence
6. All files MUST be saved to workspace directory for Git commit
7. Verify all files appear in VS Code file explorer after creation

**🚨 TASK COMPLETION VALIDATION:**
- Task is NOT complete until enhanced JSON file is created using create_file tool
- Task is NOT complete until JSON file is visible in workspace file explorer AND included in PR
- Task is NOT complete until JSON contains enhanced test specifications in enhanced_steps array
- Task is NOT complete until Playwright script file is created using create_file tool AND included in PR
- Simply showing JSON content in chat response is NOT sufficient - file creation is mandatory
- **🚨 PR REQUIREMENT**: Both artifacts (enhanced JSON + Playwright script) MUST be committed and included in the generated pull request
`;
}