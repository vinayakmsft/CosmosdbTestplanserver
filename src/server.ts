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
            'GET /:resourceId/ado_plans': 'Get ADO test plan and suites (requires ?testPlanId= query param, supports ?organization=&project= optional params)',
            'POST /:resourceId/createIssue': 'Create multiple GitHub issues for test cases (adds automated labels)',
            'GET /:resourceId/testPlans': 'Get cached test plans from database (no refresh - use ado_plans for fresh data)',
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
 * Get ADO test plan and suites
 * Query params: testPlanId (required), organization, project (optional)
 */
app.get('/:resourceId/ado_plans', ensureClientInitialized, ensureCosmosInitialized, async (req: Request, res: Response) => {
    try {
        let { resourceId } = req.params;
        
        // Decode the URL-encoded resourceId
        resourceId = decodeURIComponent(resourceId);

        // Extract query parameters for organization, project, and testPlanId


        // Check if connection exists
        const connection = await cosmosService!.getConnection(resourceId);
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found',
                message: `No connection found for resourceId: ${resourceId}. Please save connection first.`
            });
        }

        // Parse ADO URL to extract organization and project info as fallback
        const adoUrlMatch = connection.ado_url.match(/https:\/\/dev\.azure\.com\/([^\/]+)\/?(.*)?/);
        let organization = '';
        let project = '';
        let organizationParam="";
        let projectParam="";
        
        // Use query parameters if provided, otherwise fall back to connection URL
        if (organizationParam) {
            organization = organizationParam;
        } else if (adoUrlMatch) {
            organization = adoUrlMatch[1];
        }
        
        if (projectParam) {
            project = projectParam;
        } else if (adoUrlMatch) {
            project = adoUrlMatch[2] ? adoUrlMatch[2].replace(/\/$/, '') : '';
        }

        // Parse test plan ID if provided
        let testPlanId: number | undefined;
        let testPlanIdParam="";
        if (testPlanIdParam) {
            const parsedTestPlanId = parseInt(testPlanIdParam);
            if (!isNaN(parsedTestPlanId)) {
                testPlanId = parsedTestPlanId;
            }
        }

        // Validate that testPlanId is provided since we're using getTestPlan instead of getAllTestPlans
        if (!testPlanId) {
            return res.status(400).json({
                error: 'Missing required parameter',
                message: 'testPlanId query parameter is required when using getTestPlan API',
                example: `${req.originalUrl}?testPlanId=123`
            });
        }

        console.log(`Fetching test plans for ADO URL: ${connection.ado_url}`);
        console.log(`Organization: ${organization || 'not specified'}, Project: ${project || 'default from env'}, TestPlanId: ${testPlanId || 'all plans'}`);
        console.log(`Parameters from request - Organization: ${organizationParam || 'not provided'}, Project: ${projectParam || 'not provided'}, TestPlanId: ${testPlanIdParam || 'not provided'}`);

        let testPlans;
        //connection.ado_url ="https://devdiv.visualstudio.com";
        // Option 1: Create a new ADO client with the connection info
        if (connection.ado_url) {
            console.log('Creating new ADO client with connection-specific URL...');
            try {
                const connectionAdoClient = await AzureDevOpsTestPlansClient.createWithConnectionInfo(connection.ado_url);
                if (testPlanId) {
                    // Get specific test plan
                    const singleTestPlan = await connectionAdoClient.getTestPlan(testPlanId);
                    testPlans = singleTestPlan ? [singleTestPlan] : [];
                } else {
                    // If no testPlanId provided, we need to get a default test plan or throw an error
                    throw new Error('testPlanId is required when using getTestPlan API');
                }
                console.log(`Successfully fetched ${testPlans.length} test plan(s) from connection-specific ADO instance`);
            } catch (error) {
                console.warn('Failed to use connection-specific ADO client, falling back to default:', error);
                // Fallback to default client
                if (testPlanId) {
                    const singleTestPlan = await adoClient!.getTestPlan(testPlanId);
                    testPlans = singleTestPlan ? [singleTestPlan] : [];
                } else {
                    throw new Error('testPlanId is required when using getTestPlan API');
                }
            }
        } else {
            // Option 2: Use the existing default client
            console.log(`Using default ADO client configuration`);
            if (testPlanId) {
                const singleTestPlan = await adoClient!.getTestPlan(testPlanId);
                testPlans = singleTestPlan ? [singleTestPlan] : [];
            } else {
                throw new Error('testPlanId is required when using getTestPlan API');
            }
        }

        // Filter out null/undefined test plans
        testPlans = testPlans.filter(plan => plan != null);

        // Save test plans to Cosmos DB for this resourceId
        if (testPlans.length > 0) {
            const savedTestPlans = await cosmosService!.saveTestPlans(resourceId, testPlans);
            console.log(`📦 Saved test plan to Cosmos DB:`);
            console.log(`   - Test Plan ID: ${testPlans[0].id}`);
            console.log(`   - Document ID: ${savedTestPlans[0].id}`);
            console.log(`   - Name: ${testPlans[0].name}`);
        }

        // Transform the data following the specified order:
        // 1) Get test plan (already done above)
        // 2) Get test suites for the test plan
        // 3) Get test cases for each suite
        // 4) Get test case details for each test case
        const suites: any[] = [];
        
        console.log(`Processing single test plan to extract suites and test cases...`);
        
        // Since we're fetching only one test plan by ID, we don't need to loop
        if (testPlans.length > 0) {
            const plan = testPlans[0]; // Get the single test plan
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
                        testPlanId: plan.id, // Map test suite with test plan ID
                        testCases: transformedTestCases
                    });
                }
                
                console.log(`✅ Processed test plan ${plan.name}: found ${planWithSuitesAndTestCases.suites.length} suites with ${planWithSuitesAndTestCases.suites.reduce((total: number, suite: any) => total + suite.testCases.length, 0)} total test cases`);
                
            } catch (error) {
                console.warn(`⚠️ Could not process test plan ${plan.name} (ID: ${plan.id}):`, error);
            }
        } else {
            console.warn('No test plan found to process');
        }
        

        console.log(`🎯 Total suites created: ${suites.length} for test plan ID: ${testPlanId}`);
        console.log(`📊 Total test cases found: ${suites.reduce((total: any, suite: any) => total + suite.testCases.length, 0)}`);
        console.log(`📋 Test Plan ID mapped to all suites: ${testPlanId}`);
        console.log(`💾 Data saved to Cosmos DB with structured IDs based on test plan and suite identifiers`);

        // Save the suites to Cosmos DB (keeping the existing suite structure for compatibility)
        const cosmosTestSuites: TestSuite[] = suites.map((suite: any) => ({
            id: suite.id.toString(), // Use string ID for Cosmos DB
            resourceId,
            name: suite.name,
            testCaseId: suite.testCaseId,
            testplanid: suite.testPlanId, // Map test suite with test plan ID
            testCases: suite.testCases.map((tc: any) => ({
                testCaseId: tc.testCaseId, // Add testCaseId field to each test case
                name: tc.name,
                steps: tc.steps
            }))
        }));
        
        const savedTestSuites = await cosmosService!.saveTestSuites(resourceId, cosmosTestSuites);
        console.log(`📦 Saved ${savedTestSuites.length} test suites to Cosmos DB with test plan ID: ${testPlanId}`);
        savedTestSuites.forEach((suite, index) => {
            console.log(`   - Suite ${index + 1}: Document ID = ${suite.id}, Test Plan ID = ${suite.testplanid}`);
        });

        res.json({ 
            suites, 
            testPlanId: testPlanId,
            name: "playwright.microsoft.com Test Plan" 
        });
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
 * Get cached test plans from database for a resource
 * Note: This endpoint only returns cached data. For fresh data, use /:resourceId/ado_plans with testPlanId
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
            console.log(`${forceRefresh ? 'Force refresh requested' : hasOnlyFallbackData ? 'Fallback data detected' : 'No data found'}, but refresh functionality requires testPlanId parameter`);
            
            return res.status(400).json({
                error: 'Refresh requires specific test plan',
                message: 'To refresh test plan data, please use the /:resourceId/ado_plans endpoint with testPlanId query parameter',
                example: `Use GET /${resourceId}/ado_plans?testPlanId=123 to fetch a specific test plan`,
                suggestion: 'The testPlans endpoint now only returns cached data. Use ado_plans endpoint to fetch fresh data.'
            });
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
 * * POST /:resourceId/createIssue
 * Create GitHub issues for multiple test cases (automatically adds API tracking labels)
 * Body: { 
 *   testCases: [
 *     {
 *       testCaseId: string,
 *       testCases: string[]
 *     }
 *   ],
 *   labels?: string[],
 *   assignees?: string[]
 * }
 * */
app.post('/:resourceId/createIssue', ensureCosmosInitialized, async (req: Request, res: Response) => {
    try {
        let { resourceId } = req.params;
        
        // Decode the URL-encoded resourceId
        resourceId = decodeURIComponent(resourceId);
        
        const { testCases, labels, assignees } = req.body;

        // Check if connection exists
        const connection = await cosmosService!.getConnection(resourceId);
        if (!connection) {
            return res.status(404).json({
                error: 'Connection not found',
                message: `No connection found for resourceId: ${resourceId}. Please save connection first.`
            });
        }

        // Validate required fields
        if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'testCases array is required and cannot be empty'
            });
        }

        // Validate GitHub URL
        if (!connection.github_url) {
            return res.status(400).json({
                error: 'GitHub URL not configured',
                message: 'GitHub URL is required in the connection configuration'
            });
        }

        // Initialize GitHub service
        const githubService = new GitHubService();
        
        // Test GitHub connection first
        let connectionTest;
        try {
            connectionTest = await githubService.testConnection();
            if (!connectionTest.authenticated) {
                throw new Error('GitHub authentication failed. Please check GITHUB_TOKEN environment variable.');
            }
            console.log(`✅ GitHub authenticated as: ${connectionTest.user}`);
        } catch (authError: any) {
            return res.status(401).json({
                error: 'GitHub authentication failed',
                message: authError.message,
                success: false
            });
        }

        // Validate assignees if provided
        let validatedAssignees: string[] = [];
        if (assignees && assignees.length > 0) {
            try {
                validatedAssignees = await githubService.validateAssignees(connection.github_url, assignees);
                if (validatedAssignees.length !== assignees.length) {
                    console.warn('Some assignees were filtered out due to repository access permissions');
                }
                console.log(`📋 Final assignees list: ${validatedAssignees.join(', ')}`);
            } catch (assigneeError) {
                console.warn('Error validating assignees:', assigneeError);
                validatedAssignees = [];
            }
        } else {
            console.log('📋 No assignees specified for these issues');
        }

        // Get existing suites for this resource
        let suites = await cosmosService!.getTestSuites(resourceId);
        
        if (!suites) {
            return res.status(404).json({
                error: 'Test suite not found',
                message: "",
                success: false
            });
        }

        let totalProcessed = 0;
        let totalSuccessful = 0;

        for (const testCaseGroup of testCases) {
            const { testCaseId: groupTestCaseId, testCases: testCaseNames } = testCaseGroup;
            
            if (!groupTestCaseId || !testCaseNames || !Array.isArray(testCaseNames)) {
                console.warn(`Skipping invalid test case group:`, testCaseGroup);
                continue;
            }

            // Process each test case name in the group
            for (const testCaseName of testCaseNames) {
                totalProcessed++;
                
                let githubIssue = null;
                let issueCreationStatus = 'Generating test case';
                let errorDetails = null;

                console.log(`🔄 Processing test case: "${testCaseName}" for testCaseId: ${groupTestCaseId}`);

                try {
                    // Prepare issue data with automatic API labels
                    const apiLabels = ['ado-test-api', 'automated-issue', 'test-case'];
                    const allLabels = [...new Set([...(labels || []), ...apiLabels])]; // Merge and deduplicate labels
                    
                    const issueData: GitHubIssueData = {
                        title: `Test Case: ${testCaseName}`,
                        body: `## Test Case Details

**Test Case Name:** ${testCaseName}
**Test Case ID:** ${groupTestCaseId}
**Status:** Generating test case

### Test Information
This GitHub issue was automatically created for the test case "${testCaseName}" from Azure DevOps Test Plans.

### Next Steps
- [ ] Review test case requirements
- [ ] Generate detailed test steps
- [ ] Execute test case
- [ ] Document results

---
**Resource Information:**
- **Test Case ID:** ${groupTestCaseId}
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
                    issueCreationStatus = 'Generating test case';
                    totalSuccessful++;
                    
                    console.log(`🎉 GitHub issue created successfully: ${githubIssue.html_url}`);

                } catch (githubError: any) {
                    console.error(`GitHub issue creation failed for "${testCaseName}":`, githubError);
                    errorDetails = githubError.message;
                    issueCreationStatus = 'Failed to generate test case';
                }

                // Update the specific test case in the suites
                let testCaseUpdated = false;
                const issueId = githubIssue ? githubIssue.number.toString() : Math.random().toString(36).substr(2, 8);

                suites = suites.map((suite: TestSuite) => {
                    if (suite.testCaseId === groupTestCaseId) {
                        suite.testCases = suite.testCases.map((testCase: TestCase) => {
                            if (testCase.name === testCaseName) {
                                testCaseUpdated = true;
                                return {
                                    ...testCase,
                                    issueId,
                                    status: issueCreationStatus,
                                    ...(githubIssue && {
                                        githubUrl: githubIssue.html_url,
                                        githubIssueNumber: githubIssue.number,
                                        githubIssueId: githubIssue.id
                                    }),
                                    ...(errorDetails && { errorDetails })
                                };
                            }
                            return testCase;
                        });
                    }
                    return suite;
                });

                // If test case wasn't found in existing suites, create a new suite entry
                if (!testCaseUpdated) {
                    // return 404 error
                    console.warn(`Test case "${testCaseName}" not found in existing suites, creating new entry`);
                    continue;

                }
            }
        }

        // Update the stored suites in Cosmos DB
        await cosmosService!.saveTestSuites(resourceId, suites);

        // Prepare response
        const response: any = {
            success: totalSuccessful > 0,
            message: `Processed ${totalProcessed} test cases. ${totalSuccessful} GitHub issues created successfully.`,
            summary: {
                totalProcessed,
                totalSuccessful,
                totalFailed: totalProcessed - totalSuccessful
            },
            resourceId,
            suites
        };

        // Return appropriate status code
        const statusCode = totalSuccessful > 0 ? 201 : 500;
        res.status(statusCode).json(response);

    } catch (error: any) {
        console.error('Error in createIssue endpoint:', error);
        res.status(500).json({
            error: 'Failed to create GitHub issues',
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