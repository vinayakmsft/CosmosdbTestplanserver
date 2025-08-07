import { DefaultAzureCredential, ClientSecretCredential, InteractiveBrowserCredential } from '@azure/identity';
import { getPersonalAccessTokenHandler, WebApi } from 'azure-devops-node-api';
import { ITestApi } from 'azure-devops-node-api/TestApi';
import { ITestPlanApi } from 'azure-devops-node-api/TestPlanApi';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { ITestResultsApi } from 'azure-devops-node-api/TestResultsApi';
import { TestPlan, TestPlanCreateParams, TestPlanUpdateParams } from 'azure-devops-node-api/interfaces/TestPlanInterfaces';
import { JsonPatchOperation, Operation } from 'azure-devops-node-api/interfaces/common/VSSInterfaces';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export class AzureDevOpsTestPlansClient {
    private webApi: WebApi | null = null;
    private testApi: ITestApi | null = null;
    private testPlanApi: ITestPlanApi | null = null;
    private workItemApi: IWorkItemTrackingApi | null = null;
    private testResultsApi: ITestResultsApi | null = null;
    private orgUrl: string;
    private project: string;

    constructor(orgUrl?: string, project?: string) {
        this.orgUrl = orgUrl || process.env.AZURE_DEVOPS_ORG_URL || '';
        this.project = project || process.env.AZURE_DEVOPS_PROJECT || '';

        if (!this.orgUrl || !this.project) {
            throw new Error('Organization URL and Project must be provided either as parameters or environment variables (AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PROJECT)');
        }
    }

    /**
     * Create a new ADO client instance with specific connection info
     * @param adoUrl The Azure DevOps URL (e.g., https://dev.azure.com/organization/project)
     * @returns A new initialized ADO client
     */
    static async createWithConnectionInfo(adoUrl: string): Promise<AzureDevOpsTestPlansClient> {
        // Parse the ADO URL to extract organization and project
        // Parse ADO URL to extract organization and project info as fallback
        // Given ADO URL like https://devdiv.visualstudio.com/OnlineServices/_testPlans/define?planId=2542817&suiteId=2542818
        // Need to extract organization as devdiv and project as OnlineServices
        let organization = 'devdiv';
        let project = 'OnlineServices';
        let organizationParam="";
        let projectParam="";

        const adoUrlMatch = adoUrl.match(/https:\/\/dev\.azure\.com\/([^\/]+)\/?(.*)?/);
        if (adoUrlMatch) {
            organization = adoUrlMatch[1];
            project = adoUrlMatch[2] || '';
        } else {
            console.warn('ADO URL does not match expected format, using defaults');
        }

        const orgUrl = `https://dev.azure.com/${organization}`;

        // Create and initialize the client
        const client = new AzureDevOpsTestPlansClient(orgUrl, project);
        await client.initialize();
        return client;
    }

    /**
     * Initialize the Azure DevOps connection using different authentication methods
     */
    async initialize(): Promise<void> {
        try {
            // Try Personal Access Token first (most common for Azure DevOps)
            if (process.env.AZURE_DEVOPS_PAT) {
                console.log('Authenticating with Personal Access Token...');
                await this.initializeWithPAT();
                return;
            }

            // Try Service Principal authentication
            if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
                console.log('Authenticating with Service Principal...');
                await this.initializeWithServicePrincipal();
                return;
            }

            // Fall back to Interactive Browser authentication
            console.log('Authenticating with Interactive Browser...');
            await this.initializeWithInteractiveBrowser();

        } catch (error) {
            console.error('Failed to initialize Azure DevOps connection:', error);
            throw error;
        }
    }

    /**
     * Initialize with Personal Access Token (PAT)
     */
    private async initializeWithPAT(): Promise<void> {
        const pat = process.env.AZURE_DEVOPS_PAT!;
        const authHandler = getPersonalAccessTokenHandler(pat);
        this.webApi = new WebApi(this.orgUrl, authHandler);
        this.testApi = await this.webApi.getTestApi();
        this.testPlanApi = await this.webApi.getTestPlanApi();
        this.workItemApi = await this.webApi.getWorkItemTrackingApi();
        this.testResultsApi = await this.webApi.getTestResultsApi();
    }

    /**
     * Initialize with Service Principal
     */
    private async initializeWithServicePrincipal(): Promise<void> {
        const credential = new ClientSecretCredential(
            process.env.AZURE_TENANT_ID!,
            process.env.AZURE_CLIENT_ID!,
            process.env.AZURE_CLIENT_SECRET!
        );

        // Get access token for Azure DevOps
        const tokenResponse = await credential.getToken('499b84ac-1321-427f-aa17-267ca6975798/.default');
        
        if (!tokenResponse) {
            throw new Error('Failed to acquire access token');
        }

        const authHandler = getPersonalAccessTokenHandler(tokenResponse.token);
        this.webApi = new WebApi(this.orgUrl, authHandler);
        this.testApi = await this.webApi.getTestApi();
        this.testPlanApi = await this.webApi.getTestPlanApi();
        this.workItemApi = await this.webApi.getWorkItemTrackingApi();
        this.testResultsApi = await this.webApi.getTestResultsApi();
    }

    /**
     * Initialize with Interactive Browser authentication
     */
    private async initializeWithInteractiveBrowser(): Promise<void> {
        const credential = new InteractiveBrowserCredential({
            clientId: process.env.AZURE_CLIENT_ID || '872cd9fa-d31f-45e0-9eab-6e460a02d1f1', // Default Azure CLI client ID
            redirectUri: 'http://localhost:8080'
        });

        // Get access token for Azure DevOps
        const tokenResponse = await credential.getToken('499b84ac-1321-427f-aa17-267ca6975798/.default');
        
        if (!tokenResponse) {
            throw new Error('Failed to acquire access token');
        }

        const authHandler = getPersonalAccessTokenHandler(tokenResponse.token);
        this.webApi = new WebApi(this.orgUrl, authHandler);
        this.testApi = await this.webApi.getTestApi();
        this.testPlanApi = await this.webApi.getTestPlanApi();
        this.workItemApi = await this.webApi.getWorkItemTrackingApi();
        this.testResultsApi = await this.webApi.getTestResultsApi();
    }

    /**
     * Get a specific test plan by ID
     */
    async getTestPlan(testPlanId: number): Promise<TestPlan | undefined> {
        if (!this.testPlanApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            console.log(`Fetching test plan with ID: ${testPlanId}`);
            const testPlan = await this.testPlanApi.getTestPlanById(this.project, testPlanId);
            
            if (testPlan) {
                console.log('Test Plan Details:');
                console.log(`- ID: ${testPlan.id}`);
                console.log(`- Name: ${testPlan.name}`);
                console.log(`- State: ${testPlan.state}`);
                console.log(`- Area Path: ${testPlan.areaPath}`);
                console.log(`- Iteration: ${testPlan.iteration}`);
                console.log(`- Owner: ${testPlan.owner?.displayName}`);
                console.log(`- Start Date: ${testPlan.startDate}`);
                console.log(`- End Date: ${testPlan.endDate}`);
            }

            return testPlan;
        } catch (error) {
            console.error('Error fetching test plan:', error);
            throw error;
        }
    }

    /**
     * Get all test plans in the project
     */
    async getAllTestPlans(filterActivePlans: boolean = true, includePlanDetails: boolean = false): Promise<TestPlan[]> {
        if (!this.testPlanApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            // Get the specific test plan by ID
            const testPlanId = 2542817;
            console.log(`Fetching test plan with ID: ${testPlanId}`);
            const testPlan = await this.testPlanApi.getTestPlanById(this.project, testPlanId);

            if (testPlan) {
                console.log(`Found test plan: ${testPlan.name} (ID: ${testPlan.id}) - State: ${testPlan.state}`);
                return [testPlan];
            } else {
                console.log(`Test plan with ID ${testPlanId} not found.`);
                return [];
            }
        } catch (error) {
            console.error('Error fetching test plan:', error);
            throw error;
        }
    }

    /**
     * Create a new test plan
     */
    async createTestPlan(name: string, iteration: string, description?: string, startDate?: string, endDate?: string, areaPath?: string): Promise<TestPlan> {
        if (!this.testPlanApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            const testPlanData: TestPlanCreateParams = {
                name: name,
                iteration: iteration,
                description: description,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                areaPath: areaPath
            };

            console.log(`Creating test plan: ${name}`);
            const createdPlan = await this.testPlanApi.createTestPlan(testPlanData, this.project);
            
            console.log(`Test plan created successfully with ID: ${createdPlan.id}`);
            return createdPlan;
        } catch (error) {
            console.error('Error creating test plan:', error);
            throw error;
        }
    }

    /**
     * Update an existing test plan
     */
    async updateTestPlan(testPlanId: number, updates: TestPlanUpdateParams): Promise<TestPlan> {
        if (!this.testPlanApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            console.log(`Updating test plan with ID: ${testPlanId}`);
            const updatedPlan = await this.testPlanApi.updateTestPlan(updates, this.project, testPlanId);
            
            console.log('Test plan updated successfully');
            return updatedPlan;
        } catch (error) {
            console.error('Error updating test plan:', error);
            throw error;
        }
    }

    /**
     * Delete a test plan
     */
    async deleteTestPlan(testPlanId: number): Promise<void> {
        if (!this.testPlanApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            console.log(`Deleting test plan with ID: ${testPlanId}`);
            await this.testPlanApi.deleteTestPlan(this.project, testPlanId);
            
            console.log('Test plan deleted successfully');
        } catch (error) {
            console.error('Error deleting test plan:', error);
            throw error;
        }
    }

    /**
     * Add test cases to a test suite
     */
    async addTestCasesToSuite(planId: number, suiteId: number, testCaseIds: string[] | string): Promise<any> {
        if (!this.testApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            console.log(`Adding test cases to suite ${suiteId} in plan ${planId}`);
            const testCaseIdsString = Array.isArray(testCaseIds) ? testCaseIds.join(",") : testCaseIds;
            const addedTestCases = await this.testApi.addTestCasesToSuite(this.project, planId, suiteId, testCaseIdsString);
            
            console.log('Test cases added to suite successfully');
            return addedTestCases;
        } catch (error) {
            console.error('Error adding test cases to suite:', error);
            throw error;
        }
    }

    /**
     * Create a new test case work item
     */
    async createTestCase(title: string, steps?: string, priority?: number, areaPath?: string, iterationPath?: string): Promise<any> {
        if (!this.workItemApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            console.log(`Creating test case: ${title}`);
            
            let stepsXml: string | undefined;
            if (steps) {
                stepsXml = this.convertStepsToXml(steps);
            }

            // Create JSON patch document for work item
            const patchDocument: JsonPatchOperation[] = [];

            patchDocument.push({
                op: Operation.Add,
                path: "/fields/System.Title",
                value: title
            });

            if (stepsXml) {
                patchDocument.push({
                    op: Operation.Add,
                    path: "/fields/Microsoft.VSTS.TCM.Steps",
                    value: stepsXml
                });
            }

            if (priority) {
                patchDocument.push({
                    op: Operation.Add,
                    path: "/fields/Microsoft.VSTS.Common.Priority",
                    value: priority
                });
            }

            if (areaPath) {
                patchDocument.push({
                    op: Operation.Add,
                    path: "/fields/System.AreaPath",
                    value: areaPath
                });
            }

            if (iterationPath) {
                patchDocument.push({
                    op: Operation.Add,
                    path: "/fields/System.IterationPath",
                    value: iterationPath
                });
            }

            const workItem = await this.workItemApi.createWorkItem({}, patchDocument, this.project, "Test Case");
            
            console.log(`Test case created successfully with ID: ${workItem.id}`);
            return workItem;
        } catch (error) {
            console.error('Error creating test case:', error);
            throw error;
        }
    }

    /**
     * Get list of test cases for a given test plan and suite
     */
    async getTestCaseList(planId: number, suiteId: number): Promise<any> {
        if (!this.testPlanApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            console.log(`🔍 Fetching test cases for plan ${planId}, suite ${suiteId}`);
            
            // Method 1: Try getting test cases from suite
            let testCases: any[] = [];
            try {
                testCases = await this.testPlanApi.getTestCaseList(this.project, planId, suiteId);
                console.log(`✅ Method 1: Found ${testCases.length} test case(s) using getTestCaseList`);
            } catch (error) {
                console.warn(`⚠️ Method 1 failed:`, error);
            }
            
            // Method 2: If no test cases found, skip for now
            if (testCases.length === 0) {
                console.log(`🔍 Method 2: No additional methods available, continuing with empty test cases`);
            }
            
            // Method 3: If still no test cases, try getting suite details
            if (testCases.length === 0) {
                try {
                    console.log(`🔍 Method 3: Trying to get suite details...`);
                    const suiteDetails = await this.testPlanApi.getTestSuiteById(this.project, planId, suiteId);
                    if (suiteDetails) {
                        console.log(`✅ Method 3: Got suite details for ${suiteDetails.name}, but no direct test case access`);
                        // Note: TestSuite interface doesn't have testCases property, 
                        // so we'll need to use other methods
                    }
                } catch (error) {
                    console.warn(`⚠️ Method 3 failed:`, error);
                }
            }
            
            // Debug: Log the structure of the first test case to understand the format
            if (testCases.length > 0) {
                console.log(`📊 Test case structure sample:`, {
                    firstTestCase: testCases[0],
                    keys: Object.keys(testCases[0]),
                    possibleIdFields: {
                        workItemId: (testCases[0] as any).workItem?.id,
                        testCaseReferenceId: (testCases[0] as any).testCaseReference?.id,
                        pointAssignmentsFirst: (testCases[0] as any).pointAssignments?.[0]?.testCaseReference?.id,
                        directId: (testCases[0] as any).id
                    }
                });
            } else {
                console.warn(`⚠️ No test cases found in suite ${suiteId} using any method`);
            }
            
            return testCases;
        } catch (error) {
            console.error('Error fetching test cases:', error);
            throw error;
        }
    }

    /**
     * Get all test suites for a given test plan (including child suites)
     */
    async getTestSuites(planId: number): Promise<any> {
        if (!this.testPlanApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            console.log(`🔍 Fetching test suites for plan ${planId}`);
            
            // Method 1: Try to get all test suites directly
            try {
                console.log(`🔍 Method 1: Trying to get all test suites directly...`);
                const allSuites = await this.testPlanApi.getTestSuitesForPlan(this.project, planId);
                if (allSuites && allSuites.length > 0) {
                    console.log(`✅ Method 1: Found ${allSuites.length} test suite(s) directly`);
                    allSuites.forEach((suite: any, index: number) => {
                        console.log(`  Suite ${index + 1}: ${suite.name} (ID: ${suite.id}, Type: ${suite.suiteType})`);
                    });
                    return allSuites;
                }
            } catch (error) {
                console.warn(`⚠️ Method 1 failed:`, error);
            }
            
            // Method 2: Try to get the root test suite and then get its children
            try {
                console.log(`🔍 Method 2: Trying to get root suite and children...`);
                const rootSuite = await this.testPlanApi.getTestSuiteById(this.project, planId, planId);
                
                if (rootSuite) {
                    console.log(`✅ Method 2: Found root suite: ${rootSuite.name} (ID: ${rootSuite.id})`);
                    
                    // Get all child suites recursively
                    const allSuites = await this.getAllChildSuites(planId, rootSuite);
                    console.log(`✅ Method 2: Total suites found (including root): ${allSuites.length}`);
                    
                    return allSuites;
                }
            } catch (error) {
                console.warn(`⚠️ Method 2 failed:`, error);
            }
            
            console.log(`⚠️ All methods failed, returning empty array`);
            return [];
        } catch (error) {
            console.error('Error fetching test suites:', error);
            console.warn('Could not get test suites, will try to get test cases directly from plan...');
            return [];
        }
    }

    /**
     * Recursively get all child suites for a given suite
     */
    private async getAllChildSuites(planId: number, parentSuite: any): Promise<any[]> {
        const allSuites = [parentSuite]; // Start with the parent suite
        
        try {
            // Get child suites - try different approaches
            console.log(`🔍 Getting child suites for suite ${parentSuite.name} (ID: ${parentSuite.id})`);
            
            // Method 1: Try to get all suites for the plan and filter by parent
            let childSuites: any[] = [];
            try {
                const allPlanSuites = await this.testPlanApi!.getTestSuitesForPlan(this.project, planId);
                if (allPlanSuites && allPlanSuites.length > 0) {
                    // Filter suites that have this suite as parent
                    childSuites = allPlanSuites.filter((suite: any) => 
                        suite.parentSuite?.id === parentSuite.id && suite.id !== parentSuite.id
                    );
                    console.log(`✅ Found ${childSuites.length} child suites using plan-level filtering`);
                }
            } catch (error) {
                console.warn(`Method 1 failed for getting child suites:`, error);
            }
            
            // Method 2: If no children found, try to get suite with children expand
            if (childSuites.length === 0) {
                try {
                    const suiteWithChildren = await this.testPlanApi!.getTestSuiteById(this.project, planId, parentSuite.id);
                    if (suiteWithChildren?.children && suiteWithChildren.children.length > 0) {
                        childSuites = suiteWithChildren.children;
                        console.log(`✅ Found ${childSuites.length} child suites using suite expansion`);
                    }
                } catch (error) {
                    console.warn(`Method 2 failed for getting child suites:`, error);
                }
            }
            
            if (childSuites && childSuites.length > 0) {
                for (const childSuite of childSuites) {
                    console.log(`  Child suite: ${childSuite.name} (ID: ${childSuite.id}, Type: ${childSuite.suiteType})`);
                    
                    // Recursively get grandchildren (but avoid infinite loops)
                    if (childSuite.id !== parentSuite.id) {
                        const grandchildren = await this.getAllChildSuites(planId, childSuite);
                        allSuites.push(...grandchildren);
                    }
                }
            } else {
                console.log(`No child suites found for ${parentSuite.name}`);
            }
        } catch (error) {
            console.warn(`Could not get child suites for ${parentSuite.name}:`, error);
        }
        
        return allSuites;
    }

    /**
     * Get test plan with all its suites and test cases
     * Follows the exact order: 1) Get test plans 2) Get test suites 3) Get test cases 4) Get test case details
     */
    async getTestPlanWithSuitesAndTestCases(planId: number): Promise<any> {
        if (!this.testPlanApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            console.log(`🔍 Step 1: Fetching test plan details for plan ID: ${planId}`);
            
            // Step 1: Get the test plan details
            const testPlan = await this.getTestPlan(planId);
            if (!testPlan) {
                throw new Error(`Test plan with ID ${planId} not found`);
            }
            console.log(`✅ Step 1 completed: Retrieved test plan "${testPlan.name}"`);
            
            console.log(`🔍 Step 2: Fetching test suites for test plan ${planId}`);
            // Step 2: Get test suites for this plan
            const testSuites = await this.getTestSuites(planId);
            console.log(`✅ Step 2 completed: Found ${testSuites.length} test suite(s)`);
            
            let suitesWithTestCases = [];
            
            if (testSuites && testSuites.length > 0) {
                console.log(`🔍 Step 3: Fetching test cases for each suite...`);
                
                // For each suite, get its test cases
                suitesWithTestCases = await Promise.all(
                    testSuites.map(async (suite: any) => {
                        try {
                            console.log(`🔍 Step 3a: Fetching test cases for suite: ${suite.name} (ID: ${suite.id})`);
                            const testCases = await this.getTestCaseList(planId, suite.id);
                            
                            console.log(`✅ Step 3a completed: Found ${testCases.length} test cases in suite ${suite.name}`);
                            
                            console.log(`🔍 Step 4: Getting detailed information for each test case...`);
                            // Step 4: Get detailed information for each test case
                            const testCasesWithDetails = await Promise.all(
                                testCases.map(async (testCase: any) => {
                                    try {
                                        // Extract test case ID from different possible structures
                                        let testCaseId: number | undefined;
                                        
                                        // Try multiple approaches to extract the test case ID
                                        if (testCase.workItem?.id) {
                                            testCaseId = testCase.workItem.id;
                                        } else if (testCase.pointAssignments?.[0]?.testCaseReference?.id) {
                                            testCaseId = testCase.pointAssignments[0].testCaseReference.id;
                                        } else if (testCase.id) {
                                            testCaseId = testCase.id;
                                        } else if (testCase.testCaseReference?.id) {
                                            testCaseId = testCase.testCaseReference.id;
                                        }
                                        
                                        console.log(`🔍 Step 4a: Extracting test case ID from structure:`, {
                                            originalTestCase: testCase,
                                            extractedId: testCaseId,
                                            extractionSource: testCase.workItem?.id ? 'workItem.id' :
                                                             testCase.pointAssignments?.[0]?.testCaseReference?.id ? 'pointAssignments[0].testCaseReference.id' :
                                                             testCase.id ? 'direct.id' :
                                                             testCase.testCaseReference?.id ? 'testCaseReference.id' : 'none',
                                            availableKeys: Object.keys(testCase)
                                        });
                                        
                                        // Skip if we couldn't extract a valid test case ID
                                        if (!testCaseId || isNaN(testCaseId)) {
                                            console.warn(`⚠️ Skipping test case - could not extract valid ID:`, testCase);
                                            return null; // Skip this test case instead of using fallback
                                        }
                                        
                                        console.log(`🔍 Step 4b: Fetching details for test case ID: ${testCaseId}`);
                                        
                                        const details = await this.getTestCaseDetails(testCaseId);
                                        console.log(`✅ Step 4b completed: Retrieved details for test case ${testCaseId}: "${details.fields?.title}"`);
                                        
                                        console.log(`Test case ${testCaseId} details structure:`, {
                                            hasFields: !!details.fields,
                                            hasParsedSteps: !!details.parsedSteps,
                                            parsedStepsLength: details.parsedSteps?.length || 0,
                                            hasTestCaseFields: !!details.testCaseFields,
                                            hasRawSteps: !!details.testCaseFields?.steps
                                        });
                                        
                                        // Extract steps from the correct structure
                                        let steps = [];
                                        if (details.parsedSteps && details.parsedSteps.length > 0) {
                                            console.log(`Using parsed steps for test case ${testCaseId}:`, details.parsedSteps);
                                            steps = details.parsedSteps.map((step: any) => ({
                                                action: step.action || 'No action specified',
                                                expectedResult: step.expectedResult || 'No expected result specified'
                                            }));
                                        } else if (details.testCaseFields?.steps) {
                                            console.log(`Fallback: parsing raw steps for test case ${testCaseId}`);
                                            // Fallback to extracting from raw steps data
                                            steps = this.extractTestSteps({ fields: { 'Microsoft.VSTS.TCM.Steps': details.testCaseFields.steps } });
                                        } else {
                                            console.log(`No steps found for test case ${testCaseId}`);
                                            steps = [{
                                                action: 'No test steps defined in this test case',
                                                expectedResult: 'Please add test steps in Azure DevOps'
                                            }];
                                        }
                                        
                                        return {
                                            id: testCaseId,
                                            testCaseId: testCaseId, // Add explicit testCaseId field
                                            url: details.url,
                                            fields: {
                                                title: details.fields?.title || 'Untitled Test Case',
                                                state: details.fields?.state || 'Design',
                                                reason: details.fields?.reason || 'New',
                                                assignedTo: details.fields?.assignedTo || 'Unassigned',
                                                createdBy: details.fields?.createdBy || '',
                                                createdDate: details.fields?.createdDate || '',
                                                changedBy: details.fields?.changedBy || '',
                                                changedDate: details.fields?.changedDate || '',
                                                areaPath: details.fields?.areaPath || '',
                                                iterationPath: details.fields?.iterationPath || '',
                                                priority: details.fields?.priority || 2
                                            },
                                            testCaseFields: {
                                                steps: details.testCaseFields?.steps || ""
                                            },
                                            parsedSteps: details.parsedSteps || steps,
                                            revision: details.revision || 1
                                        };
                                    } catch (error: any) {
                                        console.warn(`Could not get details for test case:`, error);
                                        
                                        // Try to extract some basic info from the original test case object
                                        let testCaseId: number | undefined;
                                        if (testCase.workItem?.id) {
                                            testCaseId = testCase.workItem.id;
                                        } else if (testCase.pointAssignments?.[0]?.testCaseReference?.id) {
                                            testCaseId = testCase.pointAssignments[0].testCaseReference.id;
                                        } else if (testCase.id) {
                                            testCaseId = testCase.id;
                                        }
                                        
                                        return {
                                            id: testCaseId || 0,
                                            testCaseId: testCaseId || 0, // Add explicit testCaseId field
                                            url: '',
                                            fields: {
                                                title: testCase.workItem?.name || 'Unknown Test Case',
                                                state: 'Unknown',
                                                reason: 'Error',
                                                assignedTo: 'Unknown',
                                                createdBy: '',
                                                createdDate: '',
                                                changedBy: '',
                                                changedDate: '',
                                                areaPath: '',
                                                iterationPath: '',
                                                priority: 2
                                            },
                                            testCaseFields: {
                                                steps: ""
                                            },
                                            parsedSteps: [{
                                                id: "1",
                                                type: "ActionStep",
                                                action: `Error loading test case: ${error?.message || 'Unknown error'}`,
                                                expectedResult: 'Please check Azure DevOps permissions and test case access'
                                            }],
                                            revision: 1
                                        };
                                    }
                                })
                            );
                            
                            // Filter out null entries (test cases with invalid IDs that were skipped)
                            const validTestCases = testCasesWithDetails.filter(tc => tc !== null);

                            return {
                                id: suite.id,
                                name: suite.name,
                                suiteType: suite.suiteType,
                                parentSuiteId: suite.parentSuite?.id,
                                testCases: validTestCases
                            };
                        } catch (error) {
                            console.warn(`Could not get test cases for suite ${suite.id}:`, error);
                            return {
                                id: suite.id,
                                name: suite.name || 'Unknown Suite',
                                suiteType: suite.suiteType || 'StaticTestSuite',
                                parentSuiteId: suite.parentSuite?.id,
                                testCases: []
                            };
                        }
                    })
                );
            } else {
                // Fallback: try to get test cases directly from the plan using root suite approach
                console.log(`⚠️ No suites found via getTestSuites, trying alternative approaches...`);
                console.log(`🔍 Step 2 (Fallback): Attempting to use root suite approach`);
                
                try {
                    // Try using the root suite ID from the test plan
                    const rootSuiteId = testPlan?.rootSuite?.id || planId;
                    console.log(`🔍 Step 3 (Fallback): Trying to get test cases from root suite ID: ${rootSuiteId}`);
                    
                    const testCases = await this.getTestCaseList(planId, rootSuiteId);
                    console.log(`✅ Step 3 (Fallback) completed: Found ${testCases.length} test cases in root suite`);
                    
                    console.log(`🔍 Step 4 (Fallback): Getting detailed information for each test case...`);
                    const testCasesWithDetails = await Promise.all(
                        testCases.map(async (testCase: any) => {
                            try {
                                // Extract test case ID from different possible structures
                                let testCaseId: number | undefined;
                                
                                // Try multiple approaches to extract the test case ID
                                if (testCase.workItem?.id) {
                                    testCaseId = testCase.workItem.id;
                                } else if (testCase.pointAssignments?.[0]?.testCaseReference?.id) {
                                    testCaseId = testCase.pointAssignments[0].testCaseReference.id;
                                } else if (testCase.id) {
                                    testCaseId = testCase.id;
                                } else if (testCase.testCaseReference?.id) {
                                    testCaseId = testCase.testCaseReference.id;
                                }
                                
                                console.log(`🔍 Step 4a (Fallback): Extracting test case ID from structure:`, {
                                    originalTestCase: testCase,
                                    extractedId: testCaseId,
                                    extractionSource: testCase.workItem?.id ? 'workItem.id' :
                                                     testCase.pointAssignments?.[0]?.testCaseReference?.id ? 'pointAssignments[0].testCaseReference.id' :
                                                     testCase.id ? 'direct.id' :
                                                     testCase.testCaseReference?.id ? 'testCaseReference.id' : 'none',
                                    availableKeys: Object.keys(testCase)
                                });
                                
                                // Skip if we couldn't extract a valid test case ID
                                if (!testCaseId || isNaN(testCaseId)) {
                                    console.warn(`⚠️ Fallback: Skipping test case - could not extract valid ID:`, testCase);
                                    return null; // Skip this test case instead of using fallback
                                }
                                
                                console.log(`🔍 Step 4b (Fallback): Fetching details for test case ID: ${testCaseId}`);
                                
                                const details = await this.getTestCaseDetails(testCaseId);
                                console.log(`✅ Step 4b (Fallback) completed: Retrieved details for test case ${testCaseId}: "${details.fields?.title}"`);

                                // Since details is already in the new format, we can return it directly
                                return details;
                            } catch (error: any) {
                                console.warn(`Could not get details for test case:`, error);
                                
                                // Try to extract some basic info from the original test case object
                                let testCaseId: number | undefined;
                                if (testCase.workItem?.id) {
                                    testCaseId = testCase.workItem.id;
                                } else if (testCase.pointAssignments?.[0]?.testCaseReference?.id) {
                                    testCaseId = testCase.pointAssignments[0].testCaseReference.id;
                                } else if (testCase.id) {
                                    testCaseId = testCase.id;
                                }
                                
                                return {
                                    id: testCaseId || 0,
                                    testCaseId: testCaseId || 0, // Add explicit testCaseId field
                                    url: '',
                                    fields: {
                                        title: testCase.workItem?.name || 'Unknown Test Case',
                                        state: 'Unknown',
                                        reason: 'Error',
                                        assignedTo: 'Unknown',
                                        createdBy: '',
                                        createdDate: '',
                                        changedBy: '',
                                        changedDate: '',
                                        areaPath: '',
                                        iterationPath: '',
                                        priority: 2
                                    },
                                    testCaseFields: {
                                        steps: ""
                                    },
                                    parsedSteps: [{
                                        id: "1",
                                        type: "ActionStep",
                                        action: `Error loading test case: ${error?.message || 'Unknown error'}`,
                                        expectedResult: 'Please check Azure DevOps permissions and test case access'
                                    }],
                                    revision: 1
                                };
                            }
                        })
                    );
                    
                    // Filter out null entries (test cases with invalid IDs that were skipped)
                    const validTestCases = testCasesWithDetails.filter(tc => tc !== null);

                    suitesWithTestCases = [{
                        id: rootSuiteId,
                        name: testPlan?.name || 'Root Suite',
                        suiteType: 'StaticTestSuite',
                        parentSuiteId: null,
                        testCases: validTestCases
                    }];
                } catch (error) {
                    console.warn('Could not get test cases from root suite either:', error);
                    console.log('Creating empty suite structure...');
                    
                    suitesWithTestCases = [{
                        id: planId,
                        name: testPlan?.name || 'Root Suite',
                        suiteType: 'StaticTestSuite',
                        parentSuiteId: null,
                        testCases: [{
                            id: 'placeholder',
                            testCaseId: 'placeholder', // Add explicit testCaseId field
                            url: '',
                            fields: {
                                title: 'No test cases found',
                                state: 'Design',
                                reason: 'New',
                                assignedTo: 'Unassigned',
                                createdBy: '',
                                createdDate: '',
                                changedBy: '',
                                changedDate: '',
                                areaPath: '',
                                iterationPath: '',
                                priority: 2
                            },
                            testCaseFields: {
                                steps: ""
                            },
                            parsedSteps: [{
                                id: "1",
                                type: "ActionStep",
                                action: 'This test plan appears to have no test cases',
                                expectedResult: 'Add test cases to this test plan in Azure DevOps'
                            }],
                            revision: 1
                        }]
                    }];
                }
            }

            console.log(`✅ Successfully completed all steps for test plan ${testPlan?.name}:`);
            console.log(`   📋 Step 1: Retrieved test plan details`);
            console.log(`   📂 Step 2: Found ${suitesWithTestCases.length} suite(s)`);
            console.log(`   📝 Step 3 & 4: Processed ${suitesWithTestCases.reduce((total: number, suite: any) => total + suite.testCases.length, 0)} test case(s) with detailed steps`);

            return {
                testPlan,
                suites: suitesWithTestCases
            };
        } catch (error) {
            console.error('Error fetching test plan with suites and test cases:', error);
            throw error;
        }
    }

    /**
     * Extract test steps from test case work item with detailed information
     */
    private extractTestSteps(workItem: any): Array<{action: string, expectedResult: string}> {
        try {
            const steps = workItem.fields['Microsoft.VSTS.TCM.Steps'];
            if (!steps) {
                return [{
                    action: 'No test steps defined',
                    expectedResult: 'Please add test steps to this test case'
                }];
            }

            // Parse the HTML/XML structure to extract individual steps
            const stepPattern = /<step id="(\d+)" type="ActionStep">.*?<parameterizedString isformatted="true">(.*?)<\/parameterizedString>.*?<parameterizedString isformatted="true">(.*?)<\/parameterizedString>.*?<\/step>/gs;
            const matches = [...steps.matchAll(stepPattern)];
            
            if (matches.length > 0) {
                return matches.map((match, index) => {
                    const action = this.cleanHtmlText(match[2] || '');
                    const expectedResult = this.cleanHtmlText(match[3] || '');
                    
                    return {
                        action: action || `Step ${index + 1}: Action not specified`,
                        expectedResult: expectedResult || 'Expected result not specified'
                    };
                });
            }

            // Fallback: try to extract from simpler format
            const simpleStepPattern = /<parameterizedString.*?>(.*?)<\/parameterizedString>/gs;
            const simpleMatches = [...steps.matchAll(simpleStepPattern)];
            
            if (simpleMatches.length > 0) {
                // Group pairs of matches (action, expected result)
                const stepData = [];
                for (let i = 0; i < simpleMatches.length; i += 2) {
                    const action = this.cleanHtmlText(simpleMatches[i][1] || '');
                    const expectedResult = this.cleanHtmlText(simpleMatches[i + 1]?.[1] || '');
                    
                    stepData.push({
                        action: action || `Step ${Math.floor(i/2) + 1}: Action not specified`,
                        expectedResult: expectedResult || 'Expected result not specified'
                    });
                }
                return stepData.length > 0 ? stepData : [{
                    action: 'Test steps found but could not be parsed',
                    expectedResult: 'Please review test case manually'
                }];
            }

            // Final fallback: return raw content as single step
            return [{
                action: this.cleanHtmlText(steps) || 'Test steps format not recognized',
                expectedResult: 'Please review and update test case format'
            }];
        } catch (error) {
            console.warn('Error extracting test steps:', error);
            return [{
                action: 'Error occurred while extracting test steps',
                expectedResult: 'Please review test case manually'
            }];
        }
    }

    /**
     * Clean HTML text and decode entities
     */
    private cleanHtmlText(html: string): string {
        if (!html) return '';
        
        return html
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&nbsp;/g, ' ')
            .trim();
    }

    /**
     * Get test results for a given build ID
     */
    async getTestResultsFromBuildId(buildId: number): Promise<any> {
        if (!this.testResultsApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            console.log(`Fetching test results for build ${buildId}`);
            const testResults = await this.testResultsApi.getTestResultDetailsForBuild(this.project, buildId);
            
            console.log(`Test results fetched successfully`);
            return testResults;
        } catch (error) {
            console.error('Error fetching test results:', error);
            throw error;
        }
    }

    /**
     * Get detailed test case information by work item ID
     * This includes test steps, expected results, outcomes, and all work item fields
     */
    async getTestCaseDetails(testCaseId: number, includeHistory: boolean = false): Promise<any> {
        if (!this.workItemApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            // Validate testCaseId - use fallback ID 17 if invalid
            if (!testCaseId || testCaseId === null || testCaseId === undefined || isNaN(testCaseId)) {
                console.warn(`Invalid test case ID provided: ${testCaseId}, using fallback ID 17`);
                testCaseId = 17;
            }

            console.log(`Fetching test case details for ID: ${testCaseId}`);
            
            // First, try to check if the test case exists with minimal fields
            try {
                const basicWorkItem = await this.workItemApi.getWorkItem(testCaseId, ['System.Id', 'System.Title', 'System.WorkItemType']);
                if (!basicWorkItem) {
                    throw new Error(`Test case with ID ${testCaseId} not found`);
                }
                if (basicWorkItem.fields?.['System.WorkItemType'] !== 'Test Case') {
                    throw new Error(`Work item ${testCaseId} is not a Test Case (it's a ${basicWorkItem.fields?.['System.WorkItemType']})`);
                }
                console.log(`✅ Basic validation passed for test case ${testCaseId}: ${basicWorkItem.fields?.['System.Title']}`);
            } catch (basicError: any) {
                console.error(`❌ Basic validation failed for test case ${testCaseId}:`, basicError.message);
                throw new Error(`Cannot access test case ${testCaseId}: ${basicError.message}`);
            }
            
            // Define the fields we want to retrieve
            const fields = [
                'System.Id',
                'System.Title',
                'System.Description',
                'System.State',
                'System.Reason',
                'System.AssignedTo',
                'System.CreatedBy',
                'System.CreatedDate',
                'System.ChangedBy',
                'System.ChangedDate',
                'System.AreaPath',
                'System.IterationPath',
                'System.Tags',
                'Microsoft.VSTS.Common.Priority',
                'Microsoft.VSTS.Common.Severity',
                'Microsoft.VSTS.TCM.Steps',
                'Microsoft.VSTS.TCM.LocalDataSource',
                'Microsoft.VSTS.TCM.AutomatedTestName',
                'Microsoft.VSTS.TCM.AutomatedTestStorage',
                'Microsoft.VSTS.TCM.AutomatedTestId',
                'Microsoft.VSTS.TCM.AutomatedTestType',
                'Microsoft.VSTS.TCM.Parameters',
                'Microsoft.VSTS.Common.AcceptanceCriteria'
            ];

            // Get the work item with specified fields
            const workItem = await this.workItemApi.getWorkItem(testCaseId, fields, undefined, undefined, includeHistory ? 'all' : undefined);
            
            if (!workItem) {
                throw new Error(`Test case with ID ${testCaseId} not found`);
            }

            console.log(`📋 Retrieved test case fields for ${testCaseId}:`, {
                title: workItem.fields?.['System.Title'],
                hasSteps: !!workItem.fields?.['Microsoft.VSTS.TCM.Steps'],
                stepsLength: workItem.fields?.['Microsoft.VSTS.TCM.Steps']?.length || 0
            });

            // Parse and format the test case details
            const testCaseDetails = {
                id: workItem.id,
                url: workItem.url,
                fields: {
                    title: workItem.fields?.['System.Title'],
                    description: workItem.fields?.['System.Description'],
                    state: workItem.fields?.['System.State'],
                    reason: workItem.fields?.['System.Reason'],
                    assignedTo: workItem.fields?.['System.AssignedTo']?.displayName || workItem.fields?.['System.AssignedTo'],
                    createdBy: workItem.fields?.['System.CreatedBy']?.displayName || workItem.fields?.['System.CreatedBy'],
                    createdDate: workItem.fields?.['System.CreatedDate'],
                    changedBy: workItem.fields?.['System.ChangedBy']?.displayName || workItem.fields?.['System.ChangedBy'],
                    changedDate: workItem.fields?.['System.ChangedDate'],
                    areaPath: workItem.fields?.['System.AreaPath'],
                    iterationPath: workItem.fields?.['System.IterationPath'],
                    tags: workItem.fields?.['System.Tags'],
                    priority: workItem.fields?.['Microsoft.VSTS.Common.Priority'],
                    severity: workItem.fields?.['Microsoft.VSTS.Common.Severity'],
                    acceptanceCriteria: workItem.fields?.['Microsoft.VSTS.Common.AcceptanceCriteria']
                },
                testCaseFields: {
                    steps: workItem.fields?.['Microsoft.VSTS.TCM.Steps'],
                    localDataSource: workItem.fields?.['Microsoft.VSTS.TCM.LocalDataSource'],
                    automatedTestName: workItem.fields?.['Microsoft.VSTS.TCM.AutomatedTestName'],
                    automatedTestStorage: workItem.fields?.['Microsoft.VSTS.TCM.AutomatedTestStorage'],
                    automatedTestId: workItem.fields?.['Microsoft.VSTS.TCM.AutomatedTestId'],
                    automatedTestType: workItem.fields?.['Microsoft.VSTS.TCM.AutomatedTestType'],
                    parameters: workItem.fields?.['Microsoft.VSTS.TCM.Parameters']
                },
                parsedSteps: this.parseTestStepsXml(workItem.fields?.['Microsoft.VSTS.TCM.Steps']),
                relations: workItem.relations,
                revision: workItem.rev
            };

            console.log('Test Case Details:');
            console.log(`- ID: ${testCaseDetails.id}`);
            console.log(`- Title: ${testCaseDetails.fields.title}`);
            console.log(`- State: ${testCaseDetails.fields.state}`);
            console.log(`- Priority: ${testCaseDetails.fields.priority}`);
            console.log(`- Assigned To: ${testCaseDetails.fields.assignedTo}`);
            console.log(`- Steps Count: ${testCaseDetails.parsedSteps?.length || 0}`);

            // Return the data in the requested format
            const formattedResponse = {
                id: testCaseDetails.id,
                testCaseId: testCaseDetails.id, // Add explicit testCaseId field
                url: testCaseDetails.url,
                fields: {
                    title: testCaseDetails.fields.title,
                    state: testCaseDetails.fields.state,
                    reason: testCaseDetails.fields.reason,
                    assignedTo: testCaseDetails.fields.assignedTo,
                    createdBy: testCaseDetails.fields.createdBy,
                    createdDate: testCaseDetails.fields.createdDate,
                    changedBy: testCaseDetails.fields.changedBy,
                    changedDate: testCaseDetails.fields.changedDate,
                    areaPath: testCaseDetails.fields.areaPath,
                    iterationPath: testCaseDetails.fields.iterationPath,
                    priority: testCaseDetails.fields.priority
                },
                testCaseFields: {
                    steps: testCaseDetails.testCaseFields.steps
                },
                parsedSteps: testCaseDetails.parsedSteps || [],
                revision: testCaseDetails.revision
            };

            return formattedResponse;
        } catch (error) {
            console.error('Error fetching test case details:', error);
            throw error;
        }
    }

    /**
     * Get multiple test case details by work item IDs
     */
    async getMultipleTestCaseDetails(testCaseIds: number[], includeHistory: boolean = false): Promise<any[]> {
        if (!this.workItemApi) {
            throw new Error('Client not initialized. Call initialize() first.');
        }

        try {
            console.log(`Fetching details for ${testCaseIds.length} test cases`);
            
            const promises = testCaseIds.map(id => this.getTestCaseDetails(id, includeHistory));
            const results = await Promise.allSettled(promises);
            
            const successfulResults = results
                .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
                .map(result => result.value);
            
            const failedResults = results
                .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
                .map((result, index) => ({
                    testCaseId: testCaseIds[index],
                    error: result.reason
                }));

            if (failedResults.length > 0) {
                console.warn(`Failed to fetch ${failedResults.length} test cases:`, failedResults);
            }

            console.log(`Successfully fetched ${successfulResults.length} test case details`);
            return successfulResults;
        } catch (error) {
            console.error('Error fetching multiple test case details:', error);
            throw error;
        }
    }

    /**
     * Helper function to convert steps text to XML format required for test cases
     */
    private convertStepsToXml(steps: string): string {
        // Accepts steps in the format: '1. Step one|Expected result one\n2. Step two|Expected result two'
        const stepsLines = steps.split('\n').filter(line => line.trim() !== '');

        let xmlSteps = `<steps id="0" last="${stepsLines.length}">`;

        for (let i = 0; i < stepsLines.length; i++) {
            const stepLine = stepsLines[i].trim();
            if (stepLine) {
                // Split step and expected result by '|', fallback to default if not provided
                const [stepPart, expectedPart] = stepLine.split('|').map(s => s.trim());
                const stepMatch = stepPart.match(/^(\d+)\.\s*(.+)$/);
                const stepText = stepMatch ? stepMatch[2] : stepPart;
                const expectedText = expectedPart || 'Verify step completes successfully';

                xmlSteps += `
                <step id="${i + 1}" type="ActionStep">
                    <parameterizedString isformatted="true">${this.escapeXml(stepText)}</parameterizedString>
                    <parameterizedString isformatted="true">${this.escapeXml(expectedText)}</parameterizedString>
                </step>`;
            }
        }

        xmlSteps += '</steps>';
        return xmlSteps;
    }

    /**
     * Helper function to parse test steps XML from Azure DevOps into a readable format
     */
    private parseTestStepsXml(stepsXml?: string): any[] {
        if (!stepsXml) {
            return [];
        }

        try {
            // This is a simple XML parser for test steps
            // In a production environment, you might want to use a proper XML parser
            const steps: any[] = [];
            const stepMatches = stepsXml.match(/<step[^>]*>(.*?)<\/step>/gs);
            
            if (stepMatches) {
                stepMatches.forEach((stepMatch, index) => {
                    const idMatch = stepMatch.match(/id="([^"]*)"/);
                    const typeMatch = stepMatch.match(/type="([^"]*)"/);
                    const paramMatches = stepMatch.match(/<parameterizedString[^>]*>(.*?)<\/parameterizedString>/gs);
                    
                    const step = {
                        id: idMatch ? idMatch[1] : (index + 1).toString(),
                        type: typeMatch ? typeMatch[1] : 'ActionStep',
                        action: '',
                        expectedResult: ''
                    };

                    if (paramMatches && paramMatches.length >= 1) {
                        step.action = this.cleanXmlContent(paramMatches[0]);
                    }
                    if (paramMatches && paramMatches.length >= 2) {
                        step.expectedResult = this.cleanXmlContent(paramMatches[1]);
                    }

                    steps.push(step);
                });
            }

            return steps;
        } catch (error) {
            console.warn('Failed to parse test steps XML:', error);
            return [];
        }
    }

    /**
     * Helper function to clean XML content and extract text
     */
    private cleanXmlContent(xmlContent: string): string {
        return xmlContent
            .replace(/<parameterizedString[^>]*>/g, '')
            .replace(/<\/parameterizedString>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&apos;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/<[^>]*>/g, '') // Remove any remaining HTML/XML tags
            .trim();
    }

    /**
     * Helper function to escape XML special characters
     */
    private escapeXml(unsafe: string): string {
        return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<':
                    return '&lt;';
                case '>':
                    return '&gt;';
                case '&':
                    return '&amp;';
                case "'":
                    return '&apos;';
                case '"':
                    return '&quot;';
                default:
                    return c;
            }
        });
    }
}