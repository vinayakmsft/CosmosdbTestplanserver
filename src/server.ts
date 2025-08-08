import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { AzureDevOpsTestPlansClient } from './AzureDevOpsTestPlansClient';
import { AzureOpenAIService, TestPlanRecommendation } from './AzureOpenAIService';
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
            'GET /:resourceId/testPlans': 'Get existing test plans from database (supports ?forceRefresh=true)',
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
        connection.ado_url ="https://devdiv.visualstudio.com";
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
                            testCaseIdField: testCase.testCaseId,
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
                            testCaseId: testCase.testCaseId || testCase.id, // Add testCaseId field
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
                        testCaseId: '17', // Add testCaseId field for fallback case
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
            id: suite.testPlanId || '', // Add required id field
            testplanid: suite.testPlanId || '', // Add required testplanid field
            resourceId,
            name: suite.name,
            testCaseId: suite.testCaseId,
            testCases: suite.testCases.map((tc: any) => ({
                testCaseId: tc.testCaseId, // Add testCaseId field to each test case
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
 * GET /:resourceId/testPlans
 * Get existing test plans from database for a resource
 * Query params: forceRefresh (boolean) - if true, re-fetch from ADO even if data exists
 */
app.get('/:resourceId/testPlans', ensureCosmosInitialized, async (req: Request, res: Response) => {
    try {
        let { resourceId } = req.params;
        const forceRefresh = req.query.forceRefresh === 'true';
        
        // Decode the URL-encoded resourceId
        resourceId = decodeURIComponent(resourceId);

        console.log(`Fetching existing test plans for resourceId: ${resourceId}, forceRefresh: ${forceRefresh}`);

        // Check if connection exists
        const connection = await cosmosService!.getConnection(resourceId);
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found',
                message: `No connection found for resourceId: ${resourceId}. Please save connection first.`
            });
        }

        // Get test suites from Cosmos DB
        const testSuites = await cosmosService!.getTestSuites(resourceId);
        
        // Check if we need to force refresh or if we have fallback data
        const hasOnlyFallbackData = testSuites && testSuites.length > 0 ? testSuites.every((suite: TestSuite) => 
            suite.testCases.every((testCase: TestCase) => 
                testCase.name.includes('could not be processed') ||
                testCase.name.includes('Error occurred while fetching') ||
                (testCase.steps && testCase.steps.some((step: string) => 
                    step.includes('Error occurred while fetching test cases') ||
                    step.includes('fallback test case 17') ||
                    step.includes('Please check the test plan configuration')
                ))
            )
        ) : false;

        console.log(`🔍 Fallback data detection: hasOnlyFallbackData=${hasOnlyFallbackData}, forceRefresh=${forceRefresh}, testSuites.length=${testSuites?.length || 0}`);

        if (forceRefresh || hasOnlyFallbackData || !testSuites || testSuites.length === 0) {
            console.log(`${forceRefresh ? 'Force refresh requested' : hasOnlyFallbackData ? 'Fallback data detected' : 'No data found'}, fetching fresh data from Azure DevOps...`);
            
            // Redirect to ado_plans endpoint logic but return the result directly
            try {
                if (!adoClient) {
                    return res.status(500).json({
                        error: 'Azure DevOps client not initialized',
                        message: 'Cannot refresh data from ADO, server not properly configured'
                    });
                }

                // Fetch fresh data from ADO (simplified version of ado_plans logic)
                let testPlans;
                
                // Parse ADO URL to get organization and project info
                const adoUrlMatch = connection.ado_url.match(/https:\/\/dev\.azure\.com\/([^\/]+)\/?(.*)?/);
                let canUseConnectionClient = false;
                
                if (adoUrlMatch) {
                    canUseConnectionClient = true;
                    console.log(`✅ Valid ADO URL format detected: ${connection.ado_url}`);
                } else {
                    console.log(`⚠️ ADO URL format not compatible with connection-specific client: ${connection.ado_url}`);
                }
                 connection.ado_url ="https://devdiv.visualstudio.com";
                if (canUseConnectionClient && connection.ado_url !== process.env.AZURE_DEVOPS_ORG_URL) {
                    console.log('Creating new ADO client with connection-specific URL for refresh...');
                    try {
                        const connectionAdoClient = await AzureDevOpsTestPlansClient.createWithConnectionInfo(connection.ado_url);
                        testPlans = await connectionAdoClient.getAllTestPlans(true, true);
                        console.log(`✅ Successfully fetched ${testPlans.length} test plans using connection-specific client`);
                    } catch (error) {
                        console.warn('Failed to use connection-specific ADO client, falling back to default:', error);
                        testPlans = await adoClient!.getAllTestPlans(true, true);
                    }
                } else {
                    console.log('Using default ADO client for refresh...');
                    testPlans = await adoClient!.getAllTestPlans(true, true);
                }

                // Process and save the fresh data (same as ado_plans endpoint)
                const suites: any[] = [];
                for (const plan of testPlans) {
                    try {
                        let planWithSuitesAndTestCases;
                        
                        // Use the same client selection logic as above
                        if (canUseConnectionClient && connection.ado_url !== process.env.AZURE_DEVOPS_ORG_URL) {
                            console.log(`🔄 Processing plan ${plan.name} with connection-specific client...`);
                            const connectionAdoClient = await AzureDevOpsTestPlansClient.createWithConnectionInfo(connection.ado_url);
                            planWithSuitesAndTestCases = await connectionAdoClient.getTestPlanWithSuitesAndTestCases(plan.id!);
                        } else {
                            console.log(`🔄 Processing plan ${plan.name} with default client...`);
                            planWithSuitesAndTestCases = await adoClient!.getTestPlanWithSuitesAndTestCases(plan.id!);
                        }
                        
                        for (const suite of planWithSuitesAndTestCases.suites) {
                            console.log(`📋 Processing suite: ${suite.name} with ${suite.testCases.length} test cases`);
                            
                            const transformedTestCases = suite.testCases.map((testCase: any) => {
                                console.log(`📝 Processing test case: ${testCase.fields?.title || 'Untitled'} (ID: ${testCase.id})`);
                                
                                let steps: string[] = [];
                                if (testCase.parsedSteps && testCase.parsedSteps.length > 0) {
                                    console.log(`✅ Found ${testCase.parsedSteps.length} parsed steps for test case ${testCase.id}`);
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
                                    console.log(`⚠️ No parsed steps found for test case ${testCase.id}`);
                                    steps = ["No test steps available"];
                                }
                                
                                return {
                                    testCaseId: testCase.testCaseId || testCase.id,
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
                    } catch (error) {
                        console.error(`❌ Could not process test plan ${plan.name} during refresh:`, error);
                        // Skip fallback for refresh - if it fails, don't save bad data
                        // This prevents saving more fallback error data
                    }
                }

                if (suites.length === 0) {
                    console.warn('⚠️ No suites were successfully processed during refresh');
                    return res.status(500).json({
                        error: 'Failed to refresh test plans',
                        message: 'No test plans could be processed successfully. Check Azure DevOps connection and permissions.',
                        details: 'All test plans failed to process during refresh attempt'
                    });
                }

                // Save the fresh suites to Cosmos DB
                const cosmosTestSuites: TestSuite[] = suites.map((suite: any) => ({
                    id: suite.testPlanId || '', // Add required id field
                    testplanid: suite.testPlanId || '', // Add required testplanid field
                    resourceId,
                    name: suite.name,
                    testCaseId: suite.testCaseId,
                    testCases: suite.testCases.map((tc: any) => ({
                        testCaseId: tc.testCaseId,
                        name: tc.name,
                        steps: tc.steps
                    }))
                }));
                await cosmosService!.saveTestSuites(resourceId, cosmosTestSuites);

                console.log(`✅ Refreshed and saved ${suites.length} suites with fresh data from ADO`);
                
                // Continue with the fresh data
                const freshTestSuites = cosmosTestSuites;
                return res.json({
                    suites: freshTestSuites.map((suite: TestSuite) => ({
                        name: suite.name,
                        testCaseId: suite.testCaseId,
                        testCases: suite.testCases.map((testCase: TestCase, index: number) => {
                            let enhancedSteps: any[] = [];
                            if (testCase.steps && Array.isArray(testCase.steps)) {
                                enhancedSteps = testCase.steps.map((step: string, stepIndex: number) => {
                                    const stepMatch = step.match(/^Step (\d+):\s*(.+?)(?:\s*-\s*Expected:\s*(.+))?$/);
                                    if (stepMatch) {
                                        const stepNumber = stepMatch[1];
                                        const stepDescription = stepMatch[2];
                                        const expectedResult = stepMatch[3];
                                        
                                        return {
                                            stepName: `Step ${stepNumber}`,
                                            stepDescription: expectedResult ? 
                                                `${stepDescription} - Expected: ${expectedResult}` : 
                                                stepDescription
                                        };
                                    } else {
                                        return {
                                            stepName: `Step ${stepIndex + 1}`,
                                            stepDescription: step
                                        };
                                    }
                                });
                            }

                            return {
                                testCaseId: testCase.testCaseId || `${suite.testCaseId}-${index + 1}`,
                                name: testCase.name,
                                steps: testCase.steps || [],
                                status: testCase.status || 'Not Started',
                                issueId: testCase.issueId || '',
                                issueUrl: testCase.githubUrl || '',
                                enhanced_Steps: enhancedSteps
                            };
                        })
                    })),
                    refreshed: true,
                    message: 'Data refreshed from Azure DevOps'
                });

            } catch (refreshError: any) {
                console.error('Failed to refresh data from ADO:', refreshError);
                return res.status(500).json({
                    error: 'Failed to refresh data from Azure DevOps',
                    details: refreshError.message,
                    suggestion: 'Check Azure DevOps connection settings and permissions'
                });
            }
        }
        
        if (!testSuites || testSuites.length === 0) {
            return res.json({
                suites: [],
                message: 'No test plans found for this resource. Please fetch test plans from Azure DevOps first.'
            });
        }

        console.log(`Found ${testSuites.length} test suite(s) for resourceId: ${resourceId}`);

        // Transform the data to match the requested format
        const suites = testSuites.map((suite: TestSuite) => ({
            name: suite.name,
            testCaseId: suite.testCaseId,
            testCases: suite.testCases.map((testCase: TestCase, index: number) => {
                // Parse steps to create enhanced_Steps format
                let enhancedSteps: any[] = [];
                if (testCase.steps && Array.isArray(testCase.steps)) {
                    enhancedSteps = testCase.steps.map((step: string, stepIndex: number) => {
                        // Extract step name and description from the step string
                        const stepMatch = step.match(/^Step (\d+):\s*(.+?)(?:\s*-\s*Expected:\s*(.+))?$/);
                        if (stepMatch) {
                            const stepNumber = stepMatch[1];
                            const stepDescription = stepMatch[2];
                            const expectedResult = stepMatch[3];
                            
                            return {
                                stepName: `Step ${stepNumber}`,
                                stepDescription: expectedResult ? 
                                    `${stepDescription} - Expected: ${expectedResult}` : 
                                    stepDescription
                            };
                        } else {
                            return {
                                stepName: `Step ${stepIndex + 1}`,
                                stepDescription: step
                            };
                        }
                    });
                }

                return {
                    testCaseId: testCase.testCaseId || `${suite.testCaseId}-${index + 1}`, // Use stored testCaseId or create one
                    name: testCase.name,
                    steps: testCase.steps || [],
                    status: testCase.status || 'Not Started',
                    issueId: testCase.issueId || '',
                    issueUrl: testCase.githubUrl || '',
                    enhanced_Steps: enhancedSteps
                };
            })
        }));

        console.log(`Returning ${suites.length} suite(s) with ${suites.reduce((total, suite) => total + suite.testCases.length, 0)} total test cases`);

        res.json({ suites });
    } catch (error: any) {
        console.error('Error fetching existing test plans:', error);
        res.status(500).json({
            error: 'Failed to fetch existing test plans',
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
            const newSuite = {
                id: 'github_issue_suite', // Add required id field
                testplanid: 'github_issue_suite', // Add required testplanid field
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

// POST /api/testplans/recommendations - Generate test plan recommendations based on PRD
app.post('/api/testplans/recommendations', ensureClientInitialized, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { prd, testPlanId } = req.body;
        
        // Validate required fields
        if (!prd) {
            return res.status(400).json({
                success: false,
                error: 'PRD (Product Requirements Document) is required'
            });
        }
        
        // Use testPlanId from request body or fallback to environment variable
        const planId = testPlanId || process.env.TEST_PLAN_ID;
        if (!planId) {
            return res.status(400).json({
                success: false,
                error: 'Test Plan ID is required either in request body or TEST_PLAN_ID environment variable'
            });
        }
        
        console.log(`Generating recommendations for test plan ${planId} with PRD length: ${prd.length} characters`);
        
        // Fetch existing test plans from Azure DevOps
        let existingTestPlans: any[] = [];
        try {
            // Get test plan details
            const testPlanResponse = await adoClient!.getTestPlan(planId);
            
            // Get test cases from the test plan
            if (testPlanResponse && testPlanResponse.rootSuite?.id) {
                const testCasesResponse = await adoClient!.getTestCaseList(planId, testPlanResponse.rootSuite.id);
                existingTestPlans = testCasesResponse || [];
            }
            
            console.log(`Found ${existingTestPlans.length} existing test cases in test plan ${planId}`);
        } catch (adoError) {
            console.warn('Could not fetch existing test plans from Azure DevOps:', adoError);
            // Continue with empty existing plans - this allows the API to work even if ADO fetch fails
        }
        
        // Initialize Azure OpenAI service
        const openAIService = new AzureOpenAIService();
        
        // Generate recommendations using Azure OpenAI
        const recommendations = await openAIService.generateTestPlanRecommendations(
            prd,
            existingTestPlans,
            planId
        );
        
        console.log(`Generated ${recommendations.length} test plan recommendations`);
        
        res.json({
            success: true,
            data: {
                testPlanId: planId,
                prdLength: prd.length,
                existingTestCasesCount: existingTestPlans.length,
                recommendations,
                generatedAt: new Date().toISOString()
            }
        });
        
    } catch (error: any) {
        console.error('Error generating test plan recommendations:', error);
        
        // Provide more specific error messages
        let errorMessage = 'Failed to generate test plan recommendations';
        let statusCode = 500;
        
        if (error.message?.includes('Azure OpenAI configuration missing')) {
            errorMessage = 'Azure OpenAI service is not properly configured';
            statusCode = 503;
        } else if (error.message?.includes('Failed to generate recommendations')) {
            errorMessage = error.message;
            statusCode = 502;
        } else if (error.message?.includes('Failed to parse recommendations')) {
            errorMessage = 'Azure OpenAI returned invalid response format';
            statusCode = 502;
        }
        
        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API for running the playwright script

/**
 * GET /:resource/:testPlan/run/:testCaseId
 * Run the sample Playwright test in headed mode with single Chromium browser and wait for completion
 */
app.get('/:resource/:testPlan/run/:testCaseId', async (req: Request, res: Response) => {
    try {
        const { resource, testPlan, testCaseId } = req.params;
        
        console.log(`🎭 Starting Playwright test execution in headed mode for resource: ${resource}, testPlan: ${testPlan}, testCaseId: ${testCaseId}`);
        
        const startTime = new Date().toISOString();
        const { spawn } = require('child_process');
        const path = require('path');
        
        // Try different approaches to run Playwright
        let command: string;
        let args: string[];
        
        // First, try to use the local node_modules/.bin/playwright
        const localPlaywright = path.join(process.cwd(), 'node_modules', '.bin', 'playwright.cmd');
        const localPlaywrightJs = path.join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
        const fs = require('fs');
        
        if (fs.existsSync(localPlaywright)) {
            // Use local Playwright installation (Windows) - run only on chromium project
            command = localPlaywright;
            args = ['test', 'tests/sample.spec.ts', '--headed', '--project=chromium', '--workers=1'];
            console.log('Using local Playwright installation:', localPlaywright, 'with single chromium browser');
        } else if (fs.existsSync(localPlaywrightJs)) {
            // Use Node.js to run Playwright directly - run only on chromium project
            command = process.execPath; // Use current Node.js executable
            args = [localPlaywrightJs, 'test', 'tests/sample.spec.ts', '--headed', '--project=chromium', '--workers=1'];
            console.log('Using Node.js to run Playwright:', localPlaywrightJs, 'with single chromium browser');
        } else {
            // Fallback to npx with full path resolution - run only on chromium project
            command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
            args = ['playwright', 'test', 'tests/sample.spec.ts', '--headed', '--project=chromium', '--workers=1'];
            console.log('Using npx command:', command, 'with single chromium browser');
        }
        
        // Run the test and wait for completion
        const testProcess = spawn(command, args, {
            cwd: process.cwd(),
            stdio: 'pipe',
            shell: true // This helps with Windows path resolution
        });

        let stdout = '';
        let stderr = '';
        let lastOutputTime = Date.now();

        testProcess.stdout.on('data', (data: Buffer) => {
            const output = data.toString();
            stdout += output;
            lastOutputTime = Date.now();
            console.log(`📤 [STDOUT] ${output.trim()}`);
        });

        testProcess.stderr.on('data', (data: Buffer) => {
            const output = data.toString();
            stderr += output;
            lastOutputTime = Date.now();
            console.error(`📤 [STDERR] ${output.trim()}`);
        });

        // Progress monitoring - log every 30 seconds to show the test is still running
        const progressInterval = setInterval(() => {
            const runningTime = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
            console.log(`🎭 Playwright test still running... (${runningTime}s elapsed) for resource: ${resource}, testPlan: ${testPlan}, testCaseId: ${testCaseId}`);
        }, 30000);

        // Wait for the test to complete
        const exitCode = await new Promise<number>((resolve, reject) => {
            testProcess.on('spawn', () => {
                console.log('✅ Playwright process spawned successfully');
            });

            testProcess.on('close', (code: number) => {
                clearInterval(progressInterval);
                resolve(code);
            });

            testProcess.on('error', (err: Error) => {
                clearInterval(progressInterval);
                reject(err);
            });
        });

        const success = exitCode === 0;
        console.log(`✅ Test execution completed in  with ${success ? 'success' : 'failure'}`);

        // Return response after test completion
        res.json({
            success: success,
            message: success ? 'Playwright test execution completed successfully' : 'Playwright test execution failed',
            testFile: 'tests/sample.spec.ts',
            mode: 'headed',
            browser: 'chromium',
            workers: 1,
            resource: resource,
            testPlan: testPlan,
            testCaseId: testCaseId,
            exitCode: exitCode,
            startTime: startTime,
            stdout: stdout.slice(-5000), // Limit stdout to last 5000 characters to prevent huge responses
            stderr: stderr.slice(-2000), // Limit stderr to last 2000 characters
            fullOutputLength: {
                stdout: stdout.length,
                stderr: stderr.length
            }
        });

    } catch (error: any) {
        console.error('❌ API error in Playwright test execution:', error);
        res.status(500).json({
            error: 'Failed to run Playwright test',
            details: error.message,
            message: 'An error occurred while running the Playwright test'
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