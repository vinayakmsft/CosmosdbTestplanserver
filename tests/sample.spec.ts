import { test, expect } from '@playwright/test';

/**
 * Microsoft Account Login Test for Playwright Testing Service
 * 
 * This test validates the complete authentication flow for Microsoft accounts
 * accessing the Playwright Testing service portal. Based on live exploration
 * and validation of the actual authentication flow.
 * 
 * Test Case ID: 2542820
 * Test Name: Successful Microsoft Account Login
 */

test.describe('Microsoft Account Authentication', () => {
  
  // Test configuration and credentials
  const testCredentials = {
    username: '',
    password: ''
  };
  
  const baseURL = 'https://playwright.microsoft.com';
  
  test('TC-2542820: Successful Microsoft Account Login', async ({ page }) => {
    console.log('Starting Microsoft Account Login test...');
    
    // Step 1: Navigate to Landing Page
    console.log('Step 1: Navigating to Microsoft Playwright Testing landing page');
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    
    // Verify landing page loaded correctly
    await expect(page).toHaveTitle(/Microsoft Playwright Testing/);
    console.log('✓ Landing page loaded successfully');
    
    // Step 2: Initiate Authentication
    console.log('Step 2: Initiating authentication flow');
    const signInButton = page.getByRole('button', { name: 'Sign in' });
    await expect(signInButton).toBeVisible({ timeout: 10000 });
    await signInButton.click();
    
    // Wait for redirect to Microsoft login
    await page.waitForURL('**/login.microsoftonline.com/**', { timeout: 15000 });
    await expect(page).toHaveTitle(/Sign in to your account/);
    console.log('✓ Redirected to Microsoft authentication page');
    
    // Step 3: Enter Username
    console.log('Step 3: Entering username');
    const usernameField = page.getByRole('textbox', { name: /Enter your email, phone, or/ });
    await expect(usernameField).toBeVisible({ timeout: 10000 });
    await usernameField.fill(testCredentials.username);
    console.log('✓ Username entered successfully');
    
    // Step 4: Proceed to Password Entry
    console.log('Step 4: Proceeding to password entry');
    const nextButton = page.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    
    // Wait for password page to load
    await expect(page.getByRole('heading', { name: /Enter password/ })).toBeVisible({ timeout: 10000 });
    console.log('✓ Password entry page loaded');
    
    // Step 5: Enter Password
    console.log('Step 5: Entering password');
    const passwordField = page.getByRole('textbox', { name: /Enter the password for/ });
    await expect(passwordField).toBeVisible({ timeout: 10000 });
    await passwordField.fill(testCredentials.password);
    console.log('✓ Password entered successfully');
    
    // Step 6: Submit Authentication
    console.log('Step 6: Submitting authentication');
    const signInSubmitButton = page.getByRole('button', { name: 'Sign in' });
    await expect(signInSubmitButton).toBeEnabled();
    await signInSubmitButton.click();
    
    // Step 7: Handle Stay Signed In Dialog (Optional)
    console.log('Step 7: Handling optional Stay Signed In dialog');
    try {
      // Check if "Stay signed in?" dialog appears
      const staySignedInDialog = page.getByText(/stay signed in/i);
      if (await staySignedInDialog.isVisible({ timeout: 5000 })) {
        console.log('Stay signed in dialog appeared, clicking Yes');
        const yesButton = page.getByRole('button', { name: 'Yes' });
        await expect(yesButton).toBeVisible();
        await yesButton.click();
        console.log('✓ Stay signed in preference set');
      } else {
        console.log('Stay signed in dialog did not appear, continuing...');
      }
    } catch (error) {
      console.log('Stay signed in dialog not found or timed out, continuing...');
    }
    
    // Step 8: Verify Authentication Success
    console.log('Step 8: Verifying authentication success');
    
    // Wait for redirect back to Playwright portal
    await page.waitForURL('**/playwright.microsoft.com/**', { timeout: 30000 });
    console.log('✓ Redirected back to Playwright portal');
    
    // Verify workspace dashboard loaded
    await expect(page.getByText('Workspaces')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Manage workspaces within your chosen subscription')).toBeVisible();
    console.log('✓ Workspace dashboard loaded successfully');
    
    // Verify URL indicates successful authentication
    await expect(page).toHaveURL(/.*playwright\.microsoft\.com.*workspaces.*/);
    
    // Additional validation: Check for user profile indicator
    // Note: User profile elements may vary, using conservative approach
    const userProfileIndicator = page.locator('img[alt*="P"]').first(); // Profile avatar
    if (await userProfileIndicator.isVisible({ timeout: 5000 })) {
      console.log('✓ User profile indicator found');
    } else {
      console.log('User profile indicator not immediately visible, but authentication successful');
    }
    
    console.log('✅ Microsoft Account Login test completed successfully');
    
    // Take a final screenshot for verification
    await page.screenshot({ path: 'test-results/successful-login-final-state.png' });
  });
  
  // Additional test to verify logout capability (optional)
  test.skip('TC-2542820-LOGOUT: Verify logout functionality', async ({ page }) => {
    // This test could be added to verify the logout flow
    // Skipped for now as it's not part of the original requirement
    console.log('Logout test not implemented in current scope');
  });
});

/**
 * Test Data Configuration
 * 
 * In production environments, these should be externalized to:
 * - Environment variables
 * - Secure configuration files  
 * - Test data management systems
 */
const testConfiguration = {
  timeouts: {
    navigation: 30000,
    elementInteraction: 15000,
    authentication: 60000
  },
  retries: {
    authenticationSteps: 2,
    networkOperations: 3
  },
  screenshots: {
    onFailure: true,
    onSuccess: true,
    path: 'test-results/'
  }
};

/**
 * Helper Functions for Enhanced Test Maintainability
 */
class AuthenticationHelpers {
  
  static async waitForMicrosoftLogin(page: any) {
    await page.waitForURL('**/login.microsoftonline.com/**', { timeout: 15000 });
    await expect(page).toHaveTitle(/Sign in to your account/);
  }
  
  static async handleOptionalStaySignedIn(page: any) {
    try {
      const staySignedInDialog = page.getByText(/stay signed in/i);
      if (await staySignedInDialog.isVisible({ timeout: 5000 })) {
        const yesButton = page.getByRole('button', { name: 'Yes' });
        if (await yesButton.isVisible()) {
          await yesButton.click();
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }
  
  static async verifyWorkspaceDashboard(page: any) {
    await page.waitForURL('**/playwright.microsoft.com/**', { timeout: 30000 });
    await expect(page.getByText('Workspaces')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Manage workspaces within your chosen subscription')).toBeVisible();
  }
}