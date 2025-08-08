import { FullConfig } from '@playwright/test';

/**
 * Global teardown for Playwright tests
 * 
 * This teardown runs once after all tests and can be used to:
 * - Clean up test data
 * - Stop services
 * - Generate reports
 * - Clean up resources
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting global teardown for Playwright tests...');
  
  try {
    // You can add any global cleanup logic here
    // For example: clean up test data, stop services, etc.
    
    console.log('✅ Global teardown completed successfully');
    
    return; // Return nothing to indicate success
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    throw error; // Re-throw to log the error
  }
}

export default globalTeardown;
