import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Microsoft Account Authentication Tests
 * 
 * This configuration is optimized for testing Microsoft services including
 * the Microsoft Playwright Testing portal authentication flow.
 * 
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // Test directory configuration
  testDir: './tests',
  
  // Global test timeout (30 minutes for authentication flows)
  timeout: 30 * 60 * 1000,
  
  // Expect timeout for assertions
  expect: {
    // Timeout for expect() assertions
    timeout: 15000,
  },
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry configuration
  retries: process.env.CI ? 2 : 1,
  
  // Number of parallel workers
  workers: process.env.CI ? 1 : undefined,
  
  // Reporter configuration
  reporter: [
    // HTML reporter for detailed test results
    ['html', { outputFolder: 'playwright-report' }],
    // Line reporter for CI/terminal output
    ['line'],
    // JSON reporter for integration with other tools
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  
  // Global test setup and configuration
  use: {
    // Base URL for tests (can be overridden per test)
    baseURL: 'https://playwright.microsoft.com',
    
    // Browser context options
    viewport: { width: 1920, height: 1080 },
    
    // Collect trace on failure for debugging
    trace: 'on-first-retry',
    
    // Take screenshots on failure
    screenshot: 'only-on-failure',
    
    // Record video on failure
    video: 'retain-on-failure',
    
    // Navigation timeout
    navigationTimeout: 30000,
    
    // Action timeout
    actionTimeout: 15000,
    
    // Ignore HTTPS errors (useful for development environments)
    ignoreHTTPSErrors: true,
    
    // User agent
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    
    // Locale and timezone
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },

  // Test projects configuration for different browsers
  projects: [
    // Chromium-based browsers (Primary for Microsoft services)
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        // Additional Chrome-specific settings for Microsoft authentication
        channel: 'chrome',
        launchOptions: {
          args: [
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-networking',
            '--disable-sync',
            '--disable-translate',
            '--disable-ipc-flooding-protection',
          ],
        },
      },
    },

    // Microsoft Edge (Recommended for Microsoft services)
    {
      name: 'edge',
      use: { 
        ...devices['Desktop Edge'],
        channel: 'msedge',
        launchOptions: {
          args: [
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
          ],
        },
      },
    },

    // Firefox (Alternative browser testing)
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    // Mobile browsers (if mobile testing is needed)
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Output directories
  outputDir: 'test-results/',
  
  // Global setup and teardown
  globalSetup: require.resolve('./tests/global-setup.ts'),
  globalTeardown: require.resolve('./tests/global-teardown.ts'),

  // Web server configuration (if you need to start a local server)
  webServer: process.env.START_LOCAL_SERVER ? {
    command: 'npm run server',
    port: 3000,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  } : undefined,
});
