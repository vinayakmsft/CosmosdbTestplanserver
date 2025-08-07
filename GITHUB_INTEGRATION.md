# GitHub Integration Examples

## Setup GitHub Token

1. Go to GitHub Settings > Developer settings > Personal access tokens
2. Generate new token (classic)
3. Select these scopes:
   - `repo` (for creating issues in repositories)
   - `read:user` (for user information)
   - `read:org` (if working with organization repositories)
4. Add the token to your `.env` file:
   ```
   GITHUB_TOKEN=your_github_personal_access_token_here
   ```

## API Examples

### 1. Test GitHub Connection (Insomnia/Postman)

**GET** `http://localhost:3000/{resourceId}/github/test`

Example URL:
```
GET http://localhost:3000/subscriptions%2F12345%2FresourceGroups%2Fmy-rg%2Fproviders%2FMicrosoft.Web%2Fsites%2Fmy-app/github/test
```

Response:
```json
{
  "success": true,
  "message": "GitHub connection successful",
  "authentication": {
    "authenticated": true,
    "user": "your-github-username",
    "scopes": ["repo", "read:user"]
  },
  "repository": {
    "name": "your-repo",
    "full_name": "your-org/your-repo",
    "description": "Repository description",
    "private": false,
    "has_issues": true,
    "url": "https://github.com/your-org/your-repo"
  },
  "availableLabels": ["bug", "enhancement", "documentation"],
  "totalLabels": 10,
  "githubUrl": "https://github.com/your-org/your-repo"
}
```

### 2. Create Real GitHub Issue

**POST** `http://localhost:3000/{resourceId}/createIssue/{testCaseId}`

**Note:** This API automatically adds tracking labels (`ado-test-api`, `automated-issue`) to help identify issues created by the API.

Headers:
```
Content-Type: application/json
```

Body:
```json
{
  "title": "Test Case TC001 Failed - Login functionality broken",
  "body": "**Test Case ID:** TC001\n\n**Description:** The login functionality is not working as expected. Users are unable to authenticate with valid credentials.\n\n**Steps to Reproduce:**\n1. Navigate to login page\n2. Enter valid username and password\n3. Click login button\n4. Observe error message\n\n**Expected Result:** User should be logged in successfully\n**Actual Result:** Authentication fails with 'Invalid credentials' error\n\n**Environment:** Production\n**Priority:** High",
  "labels": ["bug", "login", "authentication", "high-priority"],
  "assignees": ["developer1", "qa-team"]
}
```

Success Response (201):
```json
{
  "success": true,
  "message": "GitHub issue created successfully",
  "testCaseId": "TC001",
  "resourceId": "subscriptions/12345/resourceGroups/my-rg/providers/Microsoft.Web/sites/my-app",
  "status": "Created",
  "githubIssue": {
    "id": 1234567890,
    "number": 42,
    "title": "Test Case TC001 Failed - Login functionality broken",
    "url": "https://github.com/your-org/your-repo/issues/42",
    "state": "open",
    "assignees": ["developer1", "qa-team"],
    "labels": ["bug", "login", "authentication", "high-priority", "ado-test-api", "automated-issue"],
    "created_at": "2025-01-15T10:30:00Z"
  },
  "suites": [...]
}
```

Failure Response (500):
```json
{
  "success": false,
  "message": "Failed to create GitHub issue, but test case updated",
  "testCaseId": "TC001",
  "resourceId": "subscriptions/12345/resourceGroups/my-rg/providers/Microsoft.Web/sites/my-app",
  "status": "Failed",
  "error": "GitHub authentication failed. Please check your GitHub token.",
  "suites": [...]
}
```

## Complete Workflow Example (JavaScript)

```javascript
const axios = require('axios');

class GitHubIntegratedTestManager {
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
        this.resourceId = 'subscriptions/12345/resourceGroups/my-rg/providers/Microsoft.Web/sites/my-app';
        this.encodedResourceId = encodeURIComponent(this.resourceId);
    }

    // Test the complete workflow
    async runCompleteWorkflow() {
        console.log('🚀 Starting complete workflow with GitHub integration...');

        try {
            // Step 1: Save connection
            await this.saveConnection();

            // Step 2: Test GitHub connection
            await this.testGitHubConnection();

            // Step 3: Get ADO plans
            await this.getAdoPlans();

            // Step 4: Create real GitHub issues for failed test cases
            await this.createRealGitHubIssues();

            console.log('✅ Workflow completed successfully!');

        } catch (error) {
            console.error('❌ Workflow failed:', error.message);
        }
    }

    async saveConnection() {
        const connectionData = {
            github_url: 'https://github.com/myorg/myrepo',
            prd: 'production-environment',
            ado_url: 'https://dev.azure.com/myorg/myproject',
            website_url: 'https://myapp.com'
        };

        try {
            const response = await axios.post(
                `${this.baseUrl}/${this.encodedResourceId}/saveConnection`,
                connectionData
            );
            console.log('✅ Connection saved:', response.data.message);
            return response.data;
        } catch (error) {
            console.error('❌ Error saving connection:', error.response?.data);
            throw error;
        }
    }

    async testGitHubConnection() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/${this.encodedResourceId}/github/test`
            );
            
            const result = response.data;
            console.log('✅ GitHub connection test successful');
            console.log(`   User: ${result.authentication.user}`);
            console.log(`   Repository: ${result.repository.full_name}`);
            console.log(`   Issues enabled: ${result.repository.has_issues}`);
            console.log(`   Available labels: ${result.availableLabels.join(', ')}`);
            
            return result;
        } catch (error) {
            console.error('❌ GitHub connection test failed:', error.response?.data);
            throw error;
        }
    }

    async getAdoPlans() {
        try {
            const response = await axios.get(
                `${this.baseUrl}/${this.encodedResourceId}/ado_plans`
            );
            console.log('✅ ADO Plans fetched successfully');
            return response.data;
        } catch (error) {
            console.error('❌ Error fetching ADO plans:', error.response?.data);
            throw error;
        }
    }

    async createRealGitHubIssues() {
        const failedTestCases = [
            {
                id: 'TC001',
                title: 'Login Functionality Test Failed',
                description: 'Critical authentication issue in production',
                body: `**Test Case ID:** TC001
**Test Name:** Login Functionality Test
**Failure Type:** Authentication Error

**Description:**
Users are unable to log into the application using valid credentials. The authentication service is returning 500 errors intermittently.

**Steps to Reproduce:**
1. Navigate to the login page at /login
2. Enter valid username: test@example.com
3. Enter valid password: SecurePass123
4. Click the "Sign In" button
5. Observe the error message

**Expected Result:**
User should be successfully authenticated and redirected to the dashboard.

**Actual Result:**
Server returns HTTP 500 error with message "Internal Server Error". User remains on login page.

**Environment Details:**
- Environment: Production
- Browser: Chrome 120.0.6099.109
- Test Run: 2025-01-15 10:30:00 UTC
- Test Suite: Authentication Tests

**Additional Information:**
- Issue affects approximately 15% of login attempts
- Error logs show database connection timeouts
- Issue started after deployment on 2025-01-14
- Impact: High - Users cannot access the application`,
                labels: ['bug', 'authentication', 'critical', 'production'],
                assignees: ['backend-team', 'devops-team']
            },
            {
                id: 'TC002',
                title: 'Payment Processing Test Failed',
                description: 'E-commerce checkout process failing',
                body: `**Test Case ID:** TC002
**Test Name:** Payment Processing Integration Test
**Failure Type:** Payment Gateway Timeout

**Description:**
The checkout process is failing during payment processing. Customers are unable to complete purchases due to payment gateway timeouts.

**Steps to Reproduce:**
1. Add items to shopping cart
2. Proceed to checkout
3. Fill in shipping information
4. Enter payment details (Credit Card: 4111 1111 1111 1111)
5. Click "Complete Purchase"
6. Wait for response

**Expected Result:**
Payment should be processed successfully and order confirmation should be displayed.

**Actual Result:**
Payment gateway times out after 30 seconds. Error message: "Payment processing failed, please try again."

**Environment Details:**
- Environment: Production
- Payment Gateway: Stripe
- Test Run: 2025-01-15 10:45:00 UTC
- Test Suite: E-commerce Tests

**Impact:**
- Affecting 25% of checkout attempts
- Revenue impact: $10,000+ in failed transactions per hour
- Customer complaints increasing

**Technical Details:**
- Gateway response time: >30 seconds (normal: <5 seconds)
- Error code: GATEWAY_TIMEOUT
- No issues reported by payment provider`,
                labels: ['bug', 'payment', 'critical', 'e-commerce', 'production'],
                assignees: ['payment-team', 'frontend-team', 'product-owner']
            }
        ];

        console.log('🎯 Creating real GitHub issues for failed test cases...');

        for (const testCase of failedTestCases) {
            try {
                const response = await axios.post(
                    `${this.baseUrl}/${this.encodedResourceId}/createIssue/${testCase.id}`,
                    {
                        title: testCase.title,
                        body: testCase.body,
                        labels: testCase.labels,
                        assignees: testCase.assignees
                    }
                );

                if (response.data.success) {
                    console.log(`✅ GitHub issue created for ${testCase.id}:`);
                    console.log(`   Issue #${response.data.githubIssue.number}: ${response.data.githubIssue.url}`);
                } else {
                    console.log(`❌ Failed to create GitHub issue for ${testCase.id}:`);
                    console.log(`   Error: ${response.data.error}`);
                }
            } catch (error) {
                console.error(`❌ Error creating issue for ${testCase.id}:`, error.response?.data);
            }
        }
    }
}

// Usage
const manager = new GitHubIntegratedTestManager();
manager.runCompleteWorkflow();
```

## PowerShell Example

```powershell
# Test GitHub Connection
$resourceId = "subscriptions/12345/resourceGroups/my-rg/providers/Microsoft.Web/sites/my-app"
$encodedResourceId = [System.Web.HttpUtility]::UrlEncode($resourceId)

# Test GitHub connection
$testUrl = "http://localhost:3000/$encodedResourceId/github/test"
$testResponse = Invoke-RestMethod -Uri $testUrl -Method GET
Write-Host "GitHub Connection Test:" -ForegroundColor Green
Write-Host "User: $($testResponse.authentication.user)" -ForegroundColor Yellow
Write-Host "Repository: $($testResponse.repository.full_name)" -ForegroundColor Yellow

# Create GitHub issue
$issueData = @{
    title = "Critical Production Issue - Test Case Failed"
    body = @"
**Test Case ID:** TC001
**Environment:** Production
**Priority:** Critical

**Issue Description:**
This is a critical issue discovered during automated testing.

**Test Failure Details:**
- Test Suite: Authentication Tests
- Expected: Successful login
- Actual: Server error 500
- Impact: Users cannot access the application

**Next Steps:**
1. Investigate server logs
2. Check database connectivity
3. Verify authentication service status
4. Deploy hotfix if necessary

**Created by:** Azure DevOps Test Plans API
**Timestamp:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC")
"@
    labels = @("bug", "critical", "production", "authentication")
    assignees = @("backend-team", "devops-lead")
} | ConvertTo-Json

$createUrl = "http://localhost:3000/$encodedResourceId/createIssue/TC001"
$createResponse = Invoke-RestMethod -Uri $createUrl -Method POST -Body $issueData -ContentType "application/json"

if ($createResponse.success) {
    Write-Host "✅ GitHub issue created successfully!" -ForegroundColor Green
    Write-Host "Issue URL: $($createResponse.githubIssue.url)" -ForegroundColor Cyan
    Write-Host "Issue Number: #$($createResponse.githubIssue.number)" -ForegroundColor Cyan
} else {
    Write-Host "❌ Failed to create GitHub issue" -ForegroundColor Red
    Write-Host "Error: $($createResponse.error)" -ForegroundColor Red
}
```

## Health Check with GitHub Status

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "clientInitialized": true,
  "cosmosDbConnected": true,
  "githubConnected": true,
  "githubUser": "your-github-username",
  "githubTokenConfigured": true
}
```

## Error Handling

The API now provides detailed error messages for GitHub integration issues:

- **401**: GitHub authentication failed - check token
- **403**: GitHub access forbidden - check token permissions
- **404**: Repository not found - check URL and access
- **422**: GitHub validation error - check issue data format
- **500**: General GitHub API error

The test case will still be updated in Cosmos DB even if GitHub issue creation fails, ensuring no data loss.
