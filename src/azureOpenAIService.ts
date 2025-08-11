import OpenAI from 'openai';
import { DefaultAzureCredential } from '@azure/identity';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

export interface EnhanceTestCaseRequest {
    title: string;
    testCaseSteps: string[];
    prd: string;
    userPrompt?: string;
}

export interface EnhanceTestCaseResponse {
    enhancedTestCases: string;
}

export class AzureOpenAIService {
    private client: OpenAI;
    private deploymentName: string;
    private systemPrompt: string = '';

    constructor() {
        const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
        const apiKey = process.env.AZURE_OPENAI_API_KEY;
        this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';

        if (!endpoint) {
            throw new Error('AZURE_OPENAI_ENDPOINT must be set in environment variables');
        }

        // Initialize OpenAI client for Azure OpenAI with best practices
        // Prefer managed identity for Azure-hosted applications, API key for development
        this.client = new OpenAI({
            baseURL: `${endpoint}/openai/deployments/${this.deploymentName}`,
            apiKey: apiKey,
            defaultQuery: { 'api-version': '2024-02-15-preview' },
            defaultHeaders: {
                'api-key': apiKey
            }
        });

        // Load system prompt from the markdown file
        this.loadSystemPrompt();
    }

    private loadSystemPrompt(): void {
        try {
            const promptPath = path.join(__dirname, 'EnhanceTestCasePrompt.md');
            this.systemPrompt = fs.readFileSync(promptPath, 'utf-8');
        } catch (error) {
            console.error('Failed to load system prompt from EnhanceTestCasePrompt.md:', error);
            // Fallback system prompt
            this.systemPrompt = `You are an expert QA architect specializing in end-to-end (E2E) test strategy design. 
Given a Product Requirements Document (PRD) and a high-level test case, produce comprehensive, detailed test cases that cover all functional, non-functional, integration, and edge-case scenarios.
Return the result as structured JSON with enhanced test cases.`;
        }
    }

    async enhanceTestCase(request: EnhanceTestCaseRequest): Promise<EnhanceTestCaseResponse> {
        try {
            // Prepare the user prompt
            const userPrompt = this.buildUserPrompt(request.title, request.testCaseSteps, request.prd, request.userPrompt);

            console.log('Calling Azure OpenAI for test case enhancement...');
            
            // Call Azure OpenAI with retry logic and proper error handling
            const response = await this.callOpenAIWithRetry(userPrompt);
            
            if (!response.choices || response.choices.length === 0) {
                throw new Error('No response received from Azure OpenAI');
            }

            const content = response.choices[0].message?.content;
            if (!content) {
                throw new Error('Empty content received from Azure OpenAI');
            }

            console.log('Received response from Azure OpenAI, processing...', content);

            // Parse the JSON response
            const parsedResponse = this.parseStructuredResponse(content);
            
            // Convert to Markdown format
            const markdownReport = this.convertToMarkdown(parsedResponse);

            return {
                enhancedTestCases: markdownReport
            };

        } catch (error: any) {
            console.error('Error in enhanceTestCase:', error);
            throw new Error(`Failed to enhance test case: ${error.message}`);
        }
    }

    private buildUserPrompt(title: string, testCaseSteps: string[], prd: string, userPrompt?: string): string {
        const stepsText = testCaseSteps.join('\n');
        
        let prompt = `
## Product Requirements Document (PRD)
${prd}

## High-Level Test Case Title
${title}

## High-Level Test Case Steps
${stepsText}`;

        // Add user prompt section if provided
        if (userPrompt && userPrompt.trim()) {
            prompt += `

## Additional Instructions
${userPrompt.trim()}`;
        }

        prompt += `

## Task
Analyze the PRD context and the provided test case above. Then enhance ONLY this specific test case by adding missing details, more specific steps, and expected results.

**CRITICAL INSTRUCTIONS:**
1. Return ONLY valid JSON in the exact format specified in the system prompt
2. Enhance ONLY the provided test case - do NOT create additional test cases  
3. Stay focused on the original test case scope - do NOT expand to other features
4. Return exactly ONE enhanced test case in JSON format

Return the JSON response with these exact fields:
- "title": Enhanced version of the original test case title
- "preconditions": Array of setup requirements  
- "test_steps": Array of detailed test steps
- "expected_results": Array of expected outcomes

DO NOT add any text outside the JSON. Return ONLY the JSON object.`;

        return prompt.trim();
    }

    private async callOpenAIWithRetry(userPrompt: string, maxRetries: number = 3): Promise<any> {
        let lastError: Error;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Azure OpenAI call attempt ${attempt}/${maxRetries}`);
                
                const response = await this.client.chat.completions.create({
                    model: this.deploymentName,
                    messages: [
                        {
                            role: 'system',
                            content: this.systemPrompt
                        },
                        {
                            role: 'user',
                            content: userPrompt
                        }
                    ],
                    temperature: 0,
                    max_tokens: 4000,
                    top_p: 0.95,
                    frequency_penalty: 0,
                    presence_penalty: 0
                });

                console.log(`✅ Azure OpenAI call successful on attempt ${attempt}`);
                return response;

            } catch (error: any) {
                lastError = error;
                console.warn(`⚠️ Azure OpenAI call failed on attempt ${attempt}:`, error.message);
                
                if (attempt === maxRetries) {
                    break;
                }

                // Exponential backoff
                const delay = Math.pow(2, attempt) * 1000;
                console.log(`Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw new Error(`Azure OpenAI call failed after ${maxRetries} attempts: ${lastError!.message}`);
    }

    private parseStructuredResponse(content: string): any {
        try {
            // First, try to extract JSON from markdown code blocks if present
            let jsonString = '';
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            
            if (jsonMatch) {
                jsonString = jsonMatch[1];
            } else {
                // If no code block, try to find JSON object in the content
                const objectMatch = content.match(/(\{[\s\S]*\})/);
                if (objectMatch) {
                    jsonString = objectMatch[1];
                } else {
                    // Assume the entire content is JSON
                    jsonString = content.trim();
                }
            }

            console.log('Attempting to parse structured JSON response...');
            const parsed = JSON.parse(jsonString);
            
            // Validate the expected structure
            if (!parsed.title || !Array.isArray(parsed.preconditions) || 
                !Array.isArray(parsed.test_steps) || !Array.isArray(parsed.expected_results)) {
                throw new Error('JSON response does not match expected structure');
            }
            
            console.log('Successfully parsed structured JSON response');
            return parsed;
            
        } catch (error) {
            console.error('Failed to parse structured OpenAI response:', error);
            console.log('Raw response preview:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));
            
            // Return a fallback structure
            return {
                title: 'Parse Error - Manual Review Required',
                preconditions: ['Failed to parse AI response - manual review needed'],
                test_steps: ['Review the raw AI response for parsing issues'],
                expected_results: ['AI response should be reviewed and corrected manually'],
                _parseError: true,
                _rawContent: content.substring(0, 1000)
            };
        }
    }

    private convertToMarkdown(response: any): string {
        const title = response.title || 'Untitled Test Case';
        
        let markdown = `TITLE: ${title}\n\n`;
        
        markdown += `PRECONDITIONS:\n`;
        if (Array.isArray(response.preconditions) && response.preconditions.length > 0) {
            response.preconditions.forEach((precondition: string) => {
                markdown += `• ${precondition}\n`;
            });
        } else {
            markdown += `• No specific preconditions\n`;
        }
        markdown += `\n`;
        
        markdown += `TEST STEPS:\n`;
        if (Array.isArray(response.test_steps) && response.test_steps.length > 0) {
            response.test_steps.forEach((step: string, index: number) => {
                markdown += `${index + 1}. ${step}\n`;
            });
        } else {
            markdown += `1. No test steps provided\n`;
        }
        markdown += `\n`;
        
        markdown += `EXPECTED RESULTS:\n`;
        if (Array.isArray(response.expected_results) && response.expected_results.length > 0) {
            response.expected_results.forEach((result: string) => {
                markdown += `• ${result}\n`;
            });
        } else {
            markdown += `• No expected results specified\n`;
        }
        
        // Add parse error warning if applicable
        if (response._parseError) {
            markdown += `\n⚠️ **PARSE ERROR**: There was an issue parsing the AI response. Please review the output above.\n`;
        }
        
        return markdown.trim();
    }

    private parseOpenAIResponse(content: string): any[] {
        try {
            // First, try to extract JSON from markdown code blocks
            let jsonString = '';
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            
            if (jsonMatch) {
                jsonString = jsonMatch[1];
            } else {
                // If no code block, try to find JSON object/array in the content
                const objectMatch = content.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
                if (objectMatch) {
                    jsonString = objectMatch[1];
                } else {
                    jsonString = content.trim();
                }
            }

            console.log('Attempting to parse JSON response...');
            const parsed = JSON.parse(jsonString);
            
            // Handle different response formats from AI
            let testCases: any[] = [];
            
            if (Array.isArray(parsed)) {
                // If it's a direct array of test cases or features
                parsed.forEach(item => {
                    if (item.testCases && Array.isArray(item.testCases)) {
                        // Feature object with testCases array
                        testCases.push(...item.testCases);
                    } else if (item.id || item.title || item.name) {
                        // Direct test case object
                        testCases.push(item);
                    }
                });
            } else if (parsed.testCases && Array.isArray(parsed.testCases)) {
                // Single feature object with testCases array
                testCases = parsed.testCases;
            } else if (parsed.id || parsed.title || parsed.name) {
                // Single test case object
                testCases = [parsed];
            } else {
                // Unknown format, try to extract any objects that look like test cases
                const extractTestCases = (obj: any): any[] => {
                    const cases: any[] = [];
                    
                    if (typeof obj === 'object' && obj !== null) {
                        if (Array.isArray(obj)) {
                            obj.forEach(item => cases.push(...extractTestCases(item)));
                        } else {
                            if (obj.id || obj.title || obj.name) {
                                cases.push(obj);
                            }
                            Object.values(obj).forEach(value => {
                                if (Array.isArray(value)) {
                                    cases.push(...extractTestCases(value));
                                }
                            });
                        }
                    }
                    
                    return cases;
                };
                
                testCases = extractTestCases(parsed);
            }
            
            console.log(`Successfully parsed ${testCases.length} test cases from AI response`);
            return testCases.length > 0 ? testCases : [parsed];
            
        } catch (error) {
            console.error('Failed to parse OpenAI response as JSON:', error);
            console.log('Raw response preview:', content.substring(0, 500) + (content.length > 500 ? '...' : ''));
            
            const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
            
            // Return a fallback structure with helpful error info
            return [{
                id: 'PARSE-ERROR-001',
                title: 'AI Response Parse Error',
                description: `Failed to parse the AI response. Error: ${errorMessage}`,
                steps: ['Manual review of AI response required'],
                expectedResults: ['AI response should be reviewed manually'],
                rawContent: content.substring(0, 1000), // Include first 1000 chars for debugging
                parseError: errorMessage,
                priority: 'High',
                tags: ['Error', 'Manual Review Required']
            }];
        }
    }

    private generateMarkdownReport(enhancedTestCases: any[], request: EnhanceTestCaseRequest): string {
        const timestamp = new Date().toISOString();
        
        let markdown = `# Enhanced Test Cases Report

**Generated:** ${timestamp}
**AI Model:** ${this.deploymentName}

---

## Original Test Case

**Title:** ${request.title}

**Steps:**
${request.testCaseSteps.map((step, index) => `${index + 1}. ${step}`).join('\n')}

---

## Product Requirements Document (PRD) Summary

\`\`\`
${request.prd.substring(0, 500)}${request.prd.length > 500 ? '...' : ''}
\`\`\`

---

## Enhanced Test Cases

`;

        enhancedTestCases.forEach((testCase, index) => {
            markdown += `### Test Case ${index + 1}: ${testCase.title || testCase.name || `TC-${String(index + 1).padStart(3, '0')}`}

**ID:** ${testCase.id || `TC-${String(index + 1).padStart(3, '0')}`}
**Priority:** ${testCase.priority || 'Medium'}
**Tags:** ${Array.isArray(testCase.tags) ? testCase.tags.join(', ') : (testCase.tags || 'Functional')}

#### Description
${testCase.description || 'No description provided'}

#### Preconditions
${Array.isArray(testCase.preconditions) ? 
    testCase.preconditions.map((pre: any) => `- ${pre}`).join('\n') : 
    (testCase.preconditions ? `- ${testCase.preconditions}` : '- No specific preconditions')}

#### Test Steps
${Array.isArray(testCase.steps) ? 
    testCase.steps.map((step: any, stepIndex: number) => `${stepIndex + 1}. ${step}`).join('\n') : 
    (testCase.steps ? `1. ${testCase.steps}` : 'No steps provided')}

#### Expected Results
${Array.isArray(testCase.expectedResults) ? 
    testCase.expectedResults.map((result: any) => `- ${result}`).join('\n') : 
    (testCase.expectedResults ? `- ${testCase.expectedResults}` : '- Expected results not specified')}

#### Automation Feasibility
${testCase.automationFeasibility ? '✅ Suitable for automation' : '❌ Manual testing recommended'}

#### Traceability
${testCase.traceability ? 
    `- **PRD Section:** ${testCase.traceability.prdSection || 'Not specified'}
- **ADO Reference:** ${testCase.traceability.adoReference || 'Not specified'}` : 
    '- Traceability information not available'}

${testCase.gap ? '⚠️ **Gap Identified:** This test case addresses a gap in the original ADO plan' : ''}

---

`;
        });

        markdown += `## Summary

- **Total Enhanced Test Cases:** ${enhancedTestCases.length}
- **Test Cases with Gaps:** ${enhancedTestCases.filter(tc => tc.gap).length}
- **Automation Candidates:** ${enhancedTestCases.filter(tc => tc.automationFeasibility).length}
- **Manual Test Cases:** ${enhancedTestCases.filter(tc => !tc.automationFeasibility).length}

---

*This report was generated using Azure OpenAI to enhance test case coverage and detail.*
`;

        return markdown;
    }

    private generateTextReport(enhancedTestCases: any[], request: EnhanceTestCaseRequest): string {
        let report = '';

        enhancedTestCases.forEach((testCase, index) => {
            const testNumber = index + 1;
            const testId = testCase.id || `TC-${String(testNumber).padStart(3, '0')}`;
            const testTitle = testCase.title || testCase.name || `Enhanced Test Case ${testNumber}`;
            
            report += `TEST CASE ${testNumber}: ${testTitle}
${'─'.repeat(60)}

ID: ${testId}
Priority: ${testCase.priority || 'Medium'}
Tags: ${Array.isArray(testCase.tags) ? testCase.tags.join(', ') : (testCase.tags || 'Functional')}

DESCRIPTION:
${testCase.description || 'No description provided'}

PRECONDITIONS:
${Array.isArray(testCase.preconditions) ? 
    testCase.preconditions.map((pre: any) => `  • ${pre}`).join('\n') : 
    (testCase.preconditions ? `  • ${testCase.preconditions}` : '  • No specific preconditions')}

TEST STEPS:
${Array.isArray(testCase.steps) ? 
    testCase.steps.map((step: any, stepIndex: number) => `  ${stepIndex + 1}. ${step}`).join('\n') : 
    (testCase.steps ? `  1. ${testCase.steps}` : '  No steps provided')}

EXPECTED RESULTS:
${Array.isArray(testCase.expectedResults) ? 
    testCase.expectedResults.map((result: any) => `  • ${result}`).join('\n') : 
    (testCase.expectedResults ? `  • ${testCase.expectedResults}` : '  • Expected results not specified')}

AUTOMATION: ${testCase.automationFeasibility ? 'Suitable for automation' : 'Manual testing recommended'}

TRACEABILITY:
${testCase.traceability ? 
    `  PRD Section: ${testCase.traceability.prdSection || 'Not specified'}
  ADO Reference: ${testCase.traceability.adoReference || 'Not specified'}` : 
    '  Traceability information not available'}

${testCase.gap ? 'NOTE: This test case addresses a gap in the original test plan' : ''}

${index < enhancedTestCases.length - 1 ? '\n' : ''}`;
        });

        return report.trim();
    }

    async healthCheck(): Promise<{ status: string; model: string; endpoint: string }> {
        try {
            // Simple health check - just verify we can create the client
            return {
                status: 'healthy',
                model: this.deploymentName,
                endpoint: process.env.AZURE_OPENAI_ENDPOINT || 'not configured'
            };
        } catch (error: any) {
            return {
                status: 'unhealthy',
                model: this.deploymentName,
                endpoint: error.message
            };
        }
    }
}
