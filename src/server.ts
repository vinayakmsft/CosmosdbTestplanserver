import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { AzureDevOpsTestPlansClient } from './AzureDevOpsTestPlansClient';
import { CosmosService, Connection, TestSuite, TestCase, TestPlan } from './cosmosService';
import { GitHubService, GitHubIssueData } from './githubService';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('combined')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Global Azure DevOps client instance
let adoClient: AzureDevOpsTestPlansClient | null = null;

// Global Cosmos DB service instance
let cosmosService: CosmosService | null = null;

// Initialize Azure DevOps client
async function initializeADOClient(): Promise<void> {
    try {
        adoClient = new AzureDevOpsTestPlansClient();
        await adoClient.initialize();
        console.log('Azure DevOps client initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Azure DevOps client:', error);
        process.exit(1);
    }
}

// Initialize Cosmos DB service
async function initializeCosmosService(): Promise<void> {
    try {
        cosmosService = new CosmosService();
        await cosmosService.initialize();
        console.log('Cosmos DB service initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Cosmos DB service:', error);
        process.exit(1);
    }
}

// Middleware to ensure client is initialized
const ensureClientInitialized = (req: Request, res: Response, next: NextFunction) => {
    if (!adoClient) {
        return res.status(500).json({ 
            error: 'Azure DevOps client not initialized',
            message: 'Server is starting up, please try again in a moment'
        });
    }
    next();
};

// Middleware to ensure Cosmos service is initialized
const ensureCosmosInitialized = (req: Request, res: Response, next: NextFunction) => {
    if (!cosmosService) {
        return res.status(500).json({ 
            error: 'Cosmos DB service not initialized',
            message: 'Server is starting up, please try again in a moment'
        });
    }
    next();
};

// Error handling middleware
const errorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
    console.error('API Error:', error);
    
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';
    
    res.status(statusCode).json({
        error: 'API Error',
        message: message,
        timestamp: new Date().toISOString(),
        path: req.path
    });
};

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
    const cosmosHealthy = cosmosService ? await cosmosService.healthCheck() : false;
    
    // Test GitHub connection if token is available
    let githubHealthy = false;
    let githubUser = null;
    
    try {
        if (process.env.GITHUB_TOKEN) {
            const githubService = new GitHubService();
            const githubTest = await githubService.testConnection();
            githubHealthy = githubTest.authenticated;
            githubUser = githubTest.user;
        }
    } catch (error) {
        console.error('GitHub health check failed:', error);
    }
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        clientInitialized: !!adoClient,
        cosmosDbConnected: cosmosHealthy,
        githubConnected: githubHealthy,
        githubUser: githubUser,
        githubTokenConfigured: !!process.env.GITHUB_TOKEN
    });
});

// API Documentation endpoint
app.get('/', (req: Request, res: Response) => {
    res.json({
        message: 'Azure DevOps Test Plans API Server',
        version: '1.0.0',
        endpoints: {
            'GET /health': 'Health check',
            'GET /api/testplans': 'Get all test plans',
            'GET /api/testplans/:id': 'Get test plan by ID',
            'POST /api/testplans': 'Create new test plan',
            'PUT /api/testplans/:id': 'Update test plan',
            'DELETE /api/testplans/:id': 'Delete test plan',
            'POST /api/testcases': 'Create new test case',
            'GET /api/testcases/:id': 'Get test case details by work item ID',
            'POST /api/testcases/batch': 'Get multiple test case details',
            'POST /api/testplans/:planId/suites/:suiteId/testcases': 'Add test cases to suite',
            'GET /api/testplans/:planId/suites/:suiteId/testcases': 'Get test cases from suite',
            'GET /api/builds/:buildId/testresults': 'Get test results for build',
            'POST /:resourceId/saveConnection': 'Save connection configuration',
            'GET /:resourceId': 'Get connection configuration',
            'GET /:resourceId/ado_plans': 'Get ADO test plans and suites',
            'POST /:resourceId/createIssue/:testCaseId': 'Create GitHub issue for test case (adds automated labels)',
            'GET /:resourceId/github/test': 'Test GitHub connection and repository access'
        },
        documentation: 'See README.md for detailed API documentation'
    });
});

// Test Plans API Routes

/**
 * GET /api/testplans
 * Get all test plans
 * Query params: filterActivePlans (boolean), includePlanDetails (boolean)
 */
app.get('/api/testplans', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const filterActivePlans = req.query.filterActivePlans !== 'false'; // default true
        const includePlanDetails = req.query.includePlanDetails === 'true'; // default false
        
        const testPlans = await adoClient!.getAllTestPlans(filterActivePlans, includePlanDetails);
        
        res.json({
            success: true,
            data: testPlans,
            count: testPlans.length,
            filters: { filterActivePlans, includePlanDetails }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/testplans/:id
 * Get test plan by ID
 */
app.get('/api/testplans/:id', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const testPlanId = parseInt(req.params.id);
        
        if (isNaN(testPlanId)) {
            return res.status(400).json({ 
                error: 'Invalid test plan ID',
                message: 'Test plan ID must be a number'
            });
        }
        
        const testPlan = await adoClient!.getTestPlan(testPlanId);
        
        if (!testPlan) {
            return res.status(404).json({ 
                error: 'Test plan not found',
                message: `Test plan with ID ${testPlanId} not found`
            });
        }
        
        res.json({
            success: true,
            data: testPlan
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/testplans
 * Create new test plan
 * Body: { name, iteration, description?, startDate?, endDate?, areaPath? }
 */
app.post('/api/testplans', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, iteration, description, startDate, endDate, areaPath } = req.body;
        
        if (!name || !iteration) {
            return res.status(400).json({ 
                error: 'Missing required fields',
                message: 'name and iteration are required'
            });
        }
        
        const testPlan = await adoClient!.createTestPlan(name, iteration, description, startDate, endDate, areaPath);
        
        res.status(201).json({
            success: true,
            data: testPlan,
            message: 'Test plan created successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * PUT /api/testplans/:id
 * Update test plan
 * Body: TestPlanUpdateParams
 */
app.put('/api/testplans/:id', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const testPlanId = parseInt(req.params.id);
        
        if (isNaN(testPlanId)) {
            return res.status(400).json({ 
                error: 'Invalid test plan ID',
                message: 'Test plan ID must be a number'
            });
        }
        
        const updates = req.body;
        
        if (!updates.iteration) {
            return res.status(400).json({ 
                error: 'Missing required field',
                message: 'iteration is required for updates'
            });
        }
        
        const updatedTestPlan = await adoClient!.updateTestPlan(testPlanId, updates);
        
        res.json({
            success: true,
            data: updatedTestPlan,
            message: 'Test plan updated successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * DELETE /api/testplans/:id
 * Delete test plan
 */
app.delete('/api/testplans/:id', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const testPlanId = parseInt(req.params.id);
        
        if (isNaN(testPlanId)) {
            return res.status(400).json({ 
                error: 'Invalid test plan ID',
                message: 'Test plan ID must be a number'
            });
        }
        
        await adoClient!.deleteTestPlan(testPlanId);
        
        res.json({
            success: true,
            message: 'Test plan deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/testcases
 * Create new test case
 * Body: { title, steps?, priority?, areaPath?, iterationPath? }
 */
app.post('/api/testcases', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { title, steps, priority, areaPath, iterationPath } = req.body;
        
        if (!title) {
            return res.status(400).json({ 
                error: 'Missing required field',
                message: 'title is required'
            });
        }
        
        const testCase = await adoClient!.createTestCase(title, steps, priority, areaPath, iterationPath);
        
        res.status(201).json({
            success: true,
            data: testCase,
            message: 'Test case created successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/testcases/:id
 * Get test case details by work item ID
 */
app.get('/api/testcases/:id', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid test case ID' });
        }

        const testCaseDetails = await adoClient!.getTestCaseDetails(id);
        res.json(testCaseDetails);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/testcases/batch
 * Get multiple test case details
 * Body: { ids: number[] }
 */
app.post('/api/testcases/batch', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { ids } = req.body;
        
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required and cannot be empty' });
        }

        if (ids.length > 100) {
            return res.status(400).json({ error: 'Maximum 100 test case IDs allowed per request' });
        }

        // Validate all IDs are numbers
        const validIds = ids.filter(id => Number.isInteger(id) && id > 0);
        if (validIds.length !== ids.length) {
            return res.status(400).json({ error: 'All IDs must be positive integers' });
        }

        const testCaseDetails = await adoClient!.getMultipleTestCaseDetails(validIds);
        res.json(testCaseDetails);
    } catch (error) {
        next(error);
    }
});

/**
 * POST /api/testplans/:planId/suites/:suiteId/testcases
 * Add test cases to suite
 * Body: { testCaseIds: string[] | string }
 */
app.post('/api/testplans/:planId/suites/:suiteId/testcases', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const planId = parseInt(req.params.planId);
        const suiteId = parseInt(req.params.suiteId);
        const { testCaseIds } = req.body;
        
        if (isNaN(planId) || isNaN(suiteId)) {
            return res.status(400).json({ 
                error: 'Invalid IDs',
                message: 'Plan ID and Suite ID must be numbers'
            });
        }
        
        if (!testCaseIds) {
            return res.status(400).json({ 
                error: 'Missing required field',
                message: 'testCaseIds is required'
            });
        }
        
        const result = await adoClient!.addTestCasesToSuite(planId, suiteId, testCaseIds);
        
        res.json({
            success: true,
            data: result,
            message: 'Test cases added to suite successfully'
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/testplans/:planId/suites/:suiteId/testcases
 * Get test cases from suite
 */
app.get('/api/testplans/:planId/suites/:suiteId/testcases', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const planId = parseInt(req.params.planId);
        const suiteId = parseInt(req.params.suiteId);
        
        if (isNaN(planId) || isNaN(suiteId)) {
            return res.status(400).json({ 
                error: 'Invalid IDs',
                message: 'Plan ID and Suite ID must be numbers'
            });
        }
        
        const testCases = await adoClient!.getTestCaseList(planId, suiteId);
        
        res.json({
            success: true,
            data: testCases,
            count: testCases.length,
            planId,
            suiteId
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/builds/:buildId/testresults
 * Get test results for build
 */
app.get('/api/builds/:buildId/testresults', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const buildId = parseInt(req.params.buildId);
        
        if (isNaN(buildId)) {
            return res.status(400).json({ 
                error: 'Invalid build ID',
                message: 'Build ID must be a number'
            });
        }
        
        const testResults = await adoClient!.getTestResultsFromBuildId(buildId);
        
        res.json({
            success: true,
            data: testResults,
            buildId
        });
    } catch (error) {
        next(error);
    }
});

/**
 * POST /:resourceId/saveConnection
 * Save connection configuration
 * Body: { github_url, prd, ado_url, website_url }
 */
app.post('/:resourceId/saveConnection', ensureCosmosInitialized, async (req: Request, res: Response) => {
    try {
        let { resourceId } = req.params;
        
        // Decode the URL-encoded resourceId
        resourceId = decodeURIComponent(resourceId);
        
        const { github_url, prd, ado_url, website_url } = req.body;

        // Validate required fields
        if (!github_url || !prd || !ado_url || !website_url) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'github_url, prd, ado_url, and website_url are required'
            });
        }

        // Generate a connection ID
        const connectionId = Math.random().toString(36).substr(2, 10);

        // Create connection object
        const connection: Connection = {
            resourceId,
            connectionId,
            github_url,
            prd,
            ado_url,
            website_url
        };

        // Save connection to Cosmos DB
        await cosmosService!.saveConnection(connection);

        res.json({
            message: "Connection saved successfully",
            status: "success",
            resourceId,
            connectionId
        });
    } catch (error: any) {
        console.error('Error saving connection:', error);
        res.status(500).json({
            error: 'Failed to save connection',
            details: error.message
        });
    }
});

/**
 * GET /:resourceId
 * Get connection configuration
 */
app.get('/:resourceId', ensureCosmosInitialized, async (req: Request, res: Response) => {
    try {
        let { resourceId } = req.params;
        
        // Decode the URL-encoded resourceId
        resourceId = decodeURIComponent(resourceId);
        
        const connection = await cosmosService!.getConnection(resourceId);

        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found',
                message: `No connection found for resourceId: ${resourceId}`
            });
        }

        res.json({
            github_url: connection.github_url,
            prd: connection.prd,
            ado_url: connection.ado_url,
            website_url: connection.website_url,
            resourceId: connection.resourceId,
            connectionId: connection.connectionId
        });
    } catch (error: any) {
        console.error('Error fetching connection:', error);
        res.status(500).json({
            error: 'Failed to fetch connection',
            details: error.message
        });
    }
});

/**
 * GET /:resourceId/ado_plans
 * Get ADO test plans and suites
 */
app.get('/:resourceId/ado_plans', ensureClientInitialized, ensureCosmosInitialized, async (req: Request, res: Response) => {
    try {
        let { resourceId } = req.params;
        
        // Decode the URL-encoded resourceId
        resourceId = decodeURIComponent(resourceId);

        // Check if connection exists
        const connection = await cosmosService!.getConnection(resourceId);
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found',
                message: `No connection found for resourceId: ${resourceId}. Please save connection first.`
            });
        }

        // Parse ADO URL to extract organization and project info
        const adoUrlMatch = connection.ado_url.match(/https:\/\/dev\.azure\.com\/([^\/]+)\/?(.*)?/);
        let organization = '';
        let project = '';
        
        if (adoUrlMatch) {
            organization = adoUrlMatch[1];
            project = adoUrlMatch[2] ? adoUrlMatch[2].replace(/\/$/, '') : '';
        }

        console.log(`Fetching test plans for ADO URL: ${connection.ado_url}`);
        console.log(`Organization: ${organization}, Project: ${project || 'default from env'}`);

        let testPlans;
        
        // Option 1: Create a new ADO client with the connection info
        if (connection.ado_url && connection.ado_url !== process.env.AZURE_DEVOPS_ORG_URL) {
            console.log('Creating new ADO client with connection-specific URL...');
            try {
                const connectionAdoClient = await AzureDevOpsTestPlansClient.createWithConnectionInfo(connection.ado_url);
                testPlans = await connectionAdoClient.getAllTestPlans(true, true);
                console.log(`Successfully fetched ${testPlans.length} test plans from connection-specific ADO instance`);
            } catch (error) {
                console.warn('Failed to use connection-specific ADO client, falling back to default:', error);
                // Fallback to default client
                testPlans = await adoClient!.getAllTestPlans(true, true);
            }
        } else {
            // Option 2: Use the existing default client
            console.log(`Using default ADO client configuration`);
            testPlans = await adoClient!.getAllTestPlans(true, true);
        }

        // Save test plans to Cosmos DB for this resourceId
        await cosmosService!.saveTestPlans(resourceId, testPlans);

        // Transform the data following the specified order:
        // 1) Get test plans (already done above)
        // 2) Get test suites for each test plan
        // 3) Get test cases for each suite
        // 4) Get test case details for each test case
        const suites: any[] = [];
        
        console.log(`Processing ${testPlans.length} test plans to extract suites and test cases...`);
        
        for (const plan of testPlans) {
            try {
                console.log(`Step 1: Processing test plan: ${plan.name} (ID: ${plan.id})`);
                
                let planWithSuitesAndTestCases;
                
                // Use connection-specific client if available, otherwise use default
                if (connection.ado_url && connection.ado_url !== process.env.AZURE_DEVOPS_ORG_URL) {
                    const connectionAdoClient = await AzureDevOpsTestPlansClient.createWithConnectionInfo(connection.ado_url);
                    planWithSuitesAndTestCases = await connectionAdoClient.getTestPlanWithSuitesAndTestCases(plan.id!);
                } else {
                    planWithSuitesAndTestCases = await adoClient!.getTestPlanWithSuitesAndTestCases(plan.id!);
                }
                
                // Step 2 & 3: Process each suite and its test cases
                for (const suite of planWithSuitesAndTestCases.suites) {
                    console.log(`Step 2: Processing suite: ${suite.name} (ID: ${suite.id})`);
                    
                    const transformedTestCases = suite.testCases.map((testCase: any) => {
                        console.log(`Step 4: Processing test case ID ${testCase.id}: "${testCase.fields?.title || 'Untitled'}"`, {
                            testCaseId: testCase.id,
                            title: testCase.fields?.title,
                            hasSteps: !!(testCase.parsedSteps && testCase.parsedSteps.length > 0),
                            stepCount: testCase.parsedSteps?.length || 0
                        });
                        
                        // Transform parsed steps into simple string array
                        let steps: string[] = [];
                        if (testCase.parsedSteps && testCase.parsedSteps.length > 0) {
                            steps = testCase.parsedSteps.map((step: any, index: number) => {
                                if (step.action && step.expectedResult) {
                                    return `Step ${index + 1}: ${step.action} - Expected: ${step.expectedResult}`;
                                } else if (step.action) {
                                    return `Step ${index + 1}: ${step.action}`;
                                } else {
                                    return `Step ${index + 1}: No action specified`;
                                }
                            });
                        } else {
                            steps = ["No test steps available"];
                        }
                        
                        return {
                            name: testCase.fields?.title || 'Untitled Test Case',
                            steps: steps
                        };
                    });

                    suites.push({
                        name: `${plan.name} - ${suite.name}`,
                        testCaseId: `${plan.id}-${suite.id}`,
                        testCases: transformedTestCases
                    });
                }
                
                console.log(`✅ Processed test plan ${plan.name}: found ${planWithSuitesAndTestCases.suites.length} suites with ${planWithSuitesAndTestCases.suites.reduce((total: number, suite: any) => total + suite.testCases.length, 0)} total test cases`);
                
            } catch (error) {
                console.warn(`⚠️ Could not process test plan ${plan.name} (ID: ${plan.id}):`, error);
                
                // Fallback: create a suite with error information
                suites.push({
                    name: plan.name || `Test Plan ${plan.id}`,
                    testCaseId: plan.id?.toString() || '17',
                    testCases: [{
                        name: `Test plan "${plan.name}" could not be processed`,
                        steps: [
                            "Error occurred while fetching test cases from Azure DevOps - using fallback test case 17",
                            "Please check the test plan configuration and permissions",
                            "Manual verification may be required"
                        ]
                    }]
                });
            }
        }

        console.log(`🎯 Total suites created: ${suites.length}`);
        console.log(`📊 Total test cases found: ${suites.reduce((total: any, suite: any) => total + suite.testCases.length, 0)}`);

        // Save the suites to Cosmos DB (keeping the existing suite structure for compatibility)
        const cosmosTestSuites: TestSuite[] = suites.map((suite: any) => ({
            resourceId,
            name: suite.name,
            testCaseId: suite.testCaseId,
            testCases: suite.testCases.map((tc: any) => ({
                name: tc.name,
                steps: tc.steps
            }))
        }));
        await cosmosService!.saveTestSuites(resourceId, cosmosTestSuites);

        res.json({ suites });
    } catch (error: any) {
        console.error('Error fetching ADO plans:', error);
        res.status(500).json({
            error: 'Failed to fetch ADO plans',
            details: error.message
        });
    }
});

/**
 * POST /:resourceId/createIssue/:testCaseId
 * Create GitHub issue for test case (automatically adds API tracking labels)
 * Body: { title, body, labels, assignees }
 */
app.post('/:resourceId/createIssue/:testCaseId', ensureCosmosInitialized, async (req: Request, res: Response) => {
    try {
        let { resourceId, testCaseId } = req.params;
        
        // Decode the URL-encoded resourceId
        resourceId = decodeURIComponent(resourceId);
        
        const { title, body, labels, assignees } = req.body;

        // Check if connection exists
        const connection = await cosmosService!.getConnection(resourceId);
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found',
                message: `No connection found for resourceId: ${resourceId}. Please save connection first.`
            });
        }

        // Validate required fields
        if (!title || !body) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'title and body are required'
            });
        }

        // Validate GitHub URL
        if (!connection.github_url) {
            return res.status(400).json({
                error: 'GitHub URL not configured',
                message: 'GitHub URL is required in the connection configuration'
            });
        }

        let githubIssue = null;
        let issueCreationStatus = 'Failed';
        let errorDetails = null;

        try {
            // Initialize GitHub service
            const githubService = new GitHubService();
            
            // Test GitHub connection first
            const connectionTest = await githubService.testConnection();
            if (!connectionTest.authenticated) {
                throw new Error('GitHub authentication failed. Please check GITHUB_TOKEN environment variable.');
            }

            console.log(`✅ GitHub authenticated as: ${connectionTest.user}`);
            
            // Validate assignees if provided (don't add automatic bot assignment)
            let validatedAssignees: string[] = [];
            if (assignees && assignees.length > 0) {
                validatedAssignees = await githubService.validateAssignees(connection.github_url, assignees);
                if (validatedAssignees.length !== assignees.length) {
                    console.warn('Some assignees were filtered out due to repository access permissions');
                }
                console.log(`📋 Final assignees list: ${validatedAssignees.join(', ')}`);
            } else {
                console.log('📋 No assignees specified for this issue');
            }            // Prepare issue data with automatic API labels
            const apiLabels = ['ado-test-api', 'automated-issue'];
            const allLabels = [...new Set([...(labels || []), ...apiLabels])]; // Merge and deduplicate labels
            
            const issueData: GitHubIssueData = {
                title,
                body: `${body}

---
**Test Case Information:**
- **Test Case ID:** ${testCaseId}
- **Resource ID:** ${resourceId}
- **ADO URL:** ${connection.ado_url}
- **Website:** ${connection.website_url}
- **Environment:** ${connection.prd}
- **Created:** ${new Date().toISOString()}

*This issue was automatically created from Azure DevOps Test Plans API*`,
                labels: allLabels,
                assignees: validatedAssignees
            };

            // Create the GitHub issue
            githubIssue = await githubService.createIssue(connection.github_url, issueData);
            issueCreationStatus = 'Created';
            
            console.log(`🎉 GitHub issue created successfully: ${githubIssue.html_url}`);

        } catch (githubError: any) {
            console.error('GitHub issue creation failed:', githubError);
            errorDetails = githubError.message;
            issueCreationStatus = 'Failed';
            
            // Don't return error here, we'll still update the test suite with failure info
        }

        // Get existing suites for this resource
        let suites = await cosmosService!.getTestSuites(resourceId);
        
        // Find the test case and update it with issue information
        let issueUpdated = false;
        const issueId = githubIssue ? githubIssue.number.toString() : Math.random().toString(36).substr(2, 8);
        
        suites = suites.map((suite: TestSuite) => {
            if (suite.testCaseId === testCaseId) {
                suite.testCases = suite.testCases.map((testCase: TestCase) => ({
                    ...testCase,
                    issueId,
                    status: issueCreationStatus,
                    ...(githubIssue && {
                        githubUrl: githubIssue.html_url,
                        githubIssueNumber: githubIssue.number,
                        githubIssueId: githubIssue.id
                    }),
                    ...(errorDetails && { errorDetails })
                }));
                issueUpdated = true;
            }
            return suite;
        });

        if (!issueUpdated) {
            // If test case not found, create a new suite entry
            const newSuite: TestSuite = {
                resourceId,
                name: "GitHub Issue Suite",
                testCaseId,
                testCases: [
                    {
                        name: title,
                        steps: [body],
                        issueId,
                        status: issueCreationStatus,
                        ...(githubIssue && {
                            githubUrl: githubIssue.html_url,
                            githubIssueNumber: githubIssue.number,
                            githubIssueId: githubIssue.id
                        }),
                        ...(errorDetails && { errorDetails })
                    }
                ]
            };
            suites.push(newSuite);
        }

        // Update the stored suites in Cosmos DB
        await cosmosService!.saveTestSuites(resourceId, suites);

        // Prepare response
        const response: any = {
            success: issueCreationStatus === 'Created',
            message: issueCreationStatus === 'Created' 
                ? 'GitHub issue created successfully' 
                : 'Failed to create GitHub issue, but test case updated',
            testCaseId,
            resourceId,
            status: issueCreationStatus,
            suites
        };

        if (githubIssue) {
            response.githubIssue = {
                id: githubIssue.id,
                number: githubIssue.number,
                title: githubIssue.title,
                url: githubIssue.html_url,
                state: githubIssue.state,
                created_at: githubIssue.created_at
            };
        }

        if (errorDetails) {
            response.error = errorDetails;
        }

        // Return appropriate status code
        const statusCode = issueCreationStatus === 'Created' ? 201 : 500;
        res.status(statusCode).json(response);

    } catch (error: any) {
        console.error('Error in createIssue endpoint:', error);
        res.status(500).json({
            error: 'Failed to create GitHub issue',
            details: error.message,
            success: false
        });
    }
});

/**
 * GET /:resourceId/github/test
 * Test GitHub connection and repository access
 */
app.get('/:resourceId/github/test', ensureCosmosInitialized, async (req: Request, res: Response) => {
    try {
        let { resourceId } = req.params;
        
        // Decode the URL-encoded resourceId
        resourceId = decodeURIComponent(resourceId);

        // Check if connection exists
        const connection = await cosmosService!.getConnection(resourceId);
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found',
                message: `No connection found for resourceId: ${resourceId}. Please save connection first.`
            });
        }

        if (!connection.github_url) {
            return res.status(400).json({
                error: 'GitHub URL not configured',
                message: 'GitHub URL is required in the connection configuration'
            });
        }

        try {
            const githubService = new GitHubService();
            
            // Test authentication
            const authTest = await githubService.testConnection();
            if (!authTest.authenticated) {
                return res.status(401).json({
                    error: 'GitHub authentication failed',
                    message: 'Please check your GITHUB_TOKEN environment variable',
                    authenticated: false
                });
            }

            // Get repository information
            const repoInfo = await githubService.getRepositoryInfo(connection.github_url);
            
            // Get available labels
            const labels = await githubService.getRepositoryLabels(connection.github_url);

            res.json({
                success: true,
                message: 'GitHub connection successful',
                authentication: {
                    authenticated: true,
                    user: authTest.user,
                    scopes: authTest.scopes
                },
                repository: {
                    name: repoInfo.name,
                    full_name: repoInfo.full_name,
                    description: repoInfo.description,
                    private: repoInfo.private,
                    has_issues: repoInfo.has_issues,
                    url: repoInfo.html_url
                },
                availableLabels: labels.slice(0, 10), // Show first 10 labels
                totalLabels: labels.length,
                githubUrl: connection.github_url
            });

        } catch (githubError: any) {
            res.status(500).json({
                error: 'GitHub connection test failed',
                details: githubError.message,
                githubUrl: connection.github_url,
                success: false
            });
        }

    } catch (error: any) {
        console.error('Error testing GitHub connection:', error);
        res.status(500).json({
            error: 'Failed to test GitHub connection',
            details: error.message
        });
    }
});

// 404 handler for unknown routes (MUST BE LAST)
app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        availableEndpoints: '/'
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
async function startServer() {
    try {
        // Initialize Cosmos DB service first
        await initializeCosmosService();
        
        // Initialize Azure DevOps client
        await initializeADOClient();
        
        // Start the server
        app.listen(PORT, () => {
            console.log(`🚀 Azure DevOps Test Plans API Server running on port ${PORT}`);
            console.log(`📚 API Documentation: http://localhost:${PORT}`);
            console.log(`🔍 Health Check: http://localhost:${PORT}/health`);
            console.log(`📋 Test Plans: http://localhost:${PORT}/api/testplans`);
            console.log(`💾 Cosmos DB: Connected and ready`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

// Start the server
startServer();

export default app;
