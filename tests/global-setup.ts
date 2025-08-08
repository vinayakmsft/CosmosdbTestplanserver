import { chromium, FullConfig } from '@playwright/test';

/**
 * Global setup for Playwright tests
 * 
 * This setup runs once before all tests and can be used to:
 * - Set up test data
 * - Configure authentication state
 * - Start services
 * - Prepare test environment
 */
async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global setup for Playwright tests...');
  
  // Create a browser instance for any setup operations
  const browser = await chromium.launch();
  
  try {
    // You can add any global setup logic here
    // For example: pre-authenticate users, set up test data, etc.
    
    console.log('✅ Global setup completed successfully');
    
    // Clean up
    await browser.close();
    
    return; // Return nothing to indicate success
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    await browser.close();
    throw error; // Re-throw to fail the test run
  }
}

export default globalSetup;
