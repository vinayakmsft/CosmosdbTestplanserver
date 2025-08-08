# Enhanced Test Case API Documentation

## Overview
The Enhanced Test Case API uses Azure OpenAI to automatically enhance basic test case steps by analyzing Product Requirements Documents (PRDs) and generating comprehensive, detailed test plans.

## API Endpoint

### POST /api/enhanceTestCase

Enhances test cases using Azure OpenAI based on test case steps and Product Requirements Document.

#### Request Headers
```
Content-Type: application/json
```

#### Request Body
```json
{
  "title": "User Login Test Case",
  "testCaseSteps": [
    "Navigate to login page",
    "Enter valid credentials",
    "Click login button",
    "Verify user is logged in"
  ],
  "prd": "Product Requirements Document content here...",
  "resourceId": "optional-resource-id-for-prd-lookup",
  "userPrompt": "Focus on accessibility testing and include WCAG compliance checks"
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | `string` | Yes | Title/name of the test case being enhanced |
| `testCaseSteps` | `string[]` | Yes | Array of basic test case steps |
| `prd` | `string` | Conditional | Product Requirements Document content. Required if not using resourceId |
| `resourceId` | `string` | Optional | If provided, will attempt to retrieve PRD from stored connection |
| `userPrompt` | `string` | Optional | Additional instructions to guide the AI model in generating enhanced test cases |

#### Response

Returns only the enhanced test cases in plain text format for human readability. No metadata, original test steps, or summary information is included.

**Content-Type**: `text/plain`

#### Example Request
```bash
curl -X POST http://localhost:3000/api/enhanceTestCase \
  -H "Content-Type: application/json" \
  -d '{
    "title": "User Profile Email Update Test",
    "testCaseSteps": [
      "Navigate to user profile page",
      "Click edit profile button",
      "Update email address",
      "Save changes"
    ],
    "prd": "The user profile feature allows authenticated users to view and modify their personal information including email, name, and preferences. The system should validate email format and ensure unique email addresses across users.",
    "userPrompt": "Focus on error handling scenarios and validation testing. Include test cases for invalid email formats, duplicate emails, and network failure conditions."
  }'
```

#### Example Response
```
TEST CASE 1: Valid Email Update - Happy Path
────────────────────────────────────────────────────────────

ID: TC-001
Priority: High
Tags: Functional, Validation, UI

DESCRIPTION:
Verify that authenticated users can successfully update their email address with
valid format and proper validation checks

PRECONDITIONS:
  • User is logged in to the system
  • User has existing profile data
  • Email domain validation is enabled

TEST STEPS:
  1. Navigate to the user profile page from dashboard
  2. Verify current email address is displayed
  3. Click the "Edit Profile" button
  4. Clear the existing email field
  5. Enter a new valid email address (e.g., user@example.com)
  6. Click "Save Changes" button
  7. Wait for confirmation message

EXPECTED RESULTS:
  • Profile page displays correctly
  • Edit mode is activated successfully
  • New email address is saved to database
  • Confirmation message displays "Profile updated successfully"
  • User receives verification email at new address
  • Old email address is no longer associated with account

AUTOMATION: Suitable for automation

TRACEABILITY:
  PRD Section: User Profile Management
  ADO Reference: US-001

TEST CASE 2: Invalid Email Format Validation
────────────────────────────────────────────────────────────

ID: TC-002
Priority: High
Tags: Functional, Validation, Negative

DESCRIPTION:
Verify system validates email format and prevents saving invalid email addresses

PRECONDITIONS:
  • User is logged in to the system
  • User has existing profile data

TEST STEPS:
  1. Navigate to user profile page
  2. Click "Edit Profile" button
  3. Enter invalid email format (e.g., "invalid-email")
  4. Attempt to save changes
  5. Verify validation error message appears
  6. Try various invalid formats (missing @, special characters, etc.)

EXPECTED RESULTS:
  • Validation error displays for each invalid format
  • Form cannot be submitted with invalid email
  • Original email address remains unchanged
  • Error messages are clear and helpful

AUTOMATION: Suitable for automation

TRACEABILITY:
  PRD Section: Input Validation
  ADO Reference: US-002
```
```
✅ Suitable for automation

---

### Test Case 2: Invalid Email Format Validation

**ID:** TC-002
**Priority:** High
**Tags:** Functional, Validation, Negative

#### Description
Verify system validates email format and prevents saving invalid email addresses

#### Test Steps
1. Navigate to user profile page
2. Click "Edit Profile" button
3. Enter invalid email format (e.g., "invalid-email")
4. Attempt to save changes
5. Verify validation error message appears
6. Try various invalid formats (missing @, special characters, etc.)

#### Expected Results
- Validation error displays for each invalid format
- Form cannot be submitted with invalid email
This report was generated using Azure OpenAI to enhance test case coverage and detail.
================================================================================
```

## Environment Variables

To use the Enhanced Test Case API, configure these environment variables:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://your-openai-instance.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key-here
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4

# Existing variables (still required)
COSMOS_DB_ENDPOINT=https://your-cosmos-db.documents.azure.com:443/
COSMOS_DB_KEY=your-cosmos-key
COSMOS_DB_DATABASE=testagentcosmosdb
```

## Health Check

The `/health` endpoint now includes Azure OpenAI service status:

```json
{
  "status": "healthy",
  "azureOpenAIConnected": true,
  "azureOpenAIModel": "gpt-4",
  "azureOpenAIConfigured": true
}
```

## Error Handling

### Common Error Responses

#### 400 Bad Request - Missing Test Steps
```json
{
  "error": "Missing or invalid required field",
  "message": "testCaseSteps is required and must be a non-empty array"
}
```

#### 400 Bad Request - Missing PRD
```json
{
  "error": "Missing required field", 
  "message": "prd is required (either in request body or associated with resourceId)"
}
```

#### 500 Internal Server Error - OpenAI Not Configured
```json
{
  "error": "Azure OpenAI service not initialized",
  "message": "Azure OpenAI service is not configured or failed to initialize. Check environment variables."
}
```

## Integration with Existing Workflow

1. **Retrieve test cases** from Azure DevOps using existing endpoints
2. **Extract test case steps** from the retrieved data
3. **Get PRD content** from stored connections or provide directly
4. **Call enhance API** to get comprehensive test cases
5. **Use enhanced test cases** for automated test generation or manual testing

## User Prompt Customization

The optional `userPrompt` parameter allows you to provide specific instructions to guide the AI model in generating enhanced test cases. This enables you to focus on particular testing aspects or requirements.

### Example Use Cases

#### Security Testing Focus
```json
{
  "userPrompt": "Focus on security testing aspects including authentication, authorization, input validation, and potential security vulnerabilities. Include both positive and negative security test scenarios."
}
```

#### Performance Testing Focus  
```json
{
  "userPrompt": "Generate test cases that focus on performance and load testing scenarios. Include stress testing, concurrent user testing, and response time validation."
}
```

#### Accessibility Testing Focus
```json
{
  "userPrompt": "Include accessibility testing scenarios following WCAG guidelines. Focus on screen reader compatibility, keyboard navigation, and color contrast requirements."
}
```

#### Mobile-Specific Testing
```json
{
  "userPrompt": "Generate test cases specifically for mobile testing including touch interactions, responsive design validation, and mobile-specific user flows."
}
```

### Benefits of Custom User Prompts

- **Targeted Testing**: Focus on specific testing domains (security, performance, accessibility, etc.)
- **Domain Expertise**: Include specialized testing requirements for your industry or use case  
- **Test Strategy Alignment**: Align generated test cases with your overall test strategy
- **Compliance Requirements**: Include specific compliance or regulatory requirements
- **Risk-Based Testing**: Emphasize high-risk areas or critical business flows

## Best Practices

1. **PRD Quality**: Provide detailed, well-structured PRDs for better enhancement results
2. **Step Clarity**: Use clear, specific language in original test case steps
3. **Resource Management**: Use resourceId when possible to avoid duplicating PRD content
4. **Error Handling**: Always check health endpoint before making enhancement requests
5. **Rate Limiting**: Be mindful of Azure OpenAI API rate limits for production use
6. **User Prompt Specificity**: Make user prompts specific and actionable for better targeted results

## Security Considerations

- API keys are required for Azure OpenAI access
- PRD content may contain sensitive business information
- Consider using managed identity for Azure-hosted deployments
- Implement proper authentication and authorization for production use
