import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { AzureDevOpsTestPlansClient } from './AzureDevOpsTestPlansClient';
import { CosmosService, Connection, TestSuite, TestCase, TestPlan } from './cosmosService';
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
    
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        clientInitialized: !!adoClient,
        cosmosDbConnected: cosmosHealthy
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
            'POST /:resourceId/createIssue/:testCaseId': 'Create GitHub issue for test case'
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

// 404 handler for unknown routes
app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        availableEndpoints: '/'
    });
});

/**
 * POST /:resourceId/saveConnection
 * Save connection configuration
 * Body: { github_url, prd, ado_url, website_url }
 */
app.post('/:resourceId/saveConnection', ensureCosmosInitialized, async (req: Request, res: Response) => {
    try {
        const { resourceId } = req.params;
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
        const { resourceId } = req.params;
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
        const { resourceId } = req.params;

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

        // Transform the data to match the expected format for suites
        const suites: TestSuite[] = testPlans.map(plan => ({
            resourceId,
            name: plan.name || `Test Plan ${plan.id}`,
            testCaseId: plan.id?.toString() || '',
            testCases: [
                {
                    name: `Sample test case for ${plan.name}`,
                    steps: [
                        "Step 1: Navigate to application",
                        "Step 2: Perform test action",
                        "Step 3: Verify expected result"
                    ]
                }
            ]
        }));

        // Save the suites to Cosmos DB
        await cosmosService!.saveTestSuites(resourceId, suites);

        res.json({ suites, testPlans });
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
 * Create GitHub issue for test case
 * Body: { title, body, labels, assignees }
 */
app.post('/:resourceId/createIssue/:testCaseId', ensureCosmosInitialized, async (req: Request, res: Response) => {
    try {
        const { resourceId, testCaseId } = req.params;
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

        // Get existing suites for this resource
        let suites = await cosmosService!.getTestSuites(resourceId);
        
        // Find the test case and update it with issue information
        let issueCreated = false;
        const issueId = Math.random().toString(36).substr(2, 8); // Generate mock issue ID
        
        suites = suites.map((suite: TestSuite) => {
            if (suite.testCaseId === testCaseId) {
                suite.testCases = suite.testCases.map((testCase: TestCase) => ({
                    ...testCase,
                    issueId,
                    status: "Creating"
                }));
                issueCreated = true;
            }
            return suite;
        });

        if (!issueCreated) {
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
                        status: "Creating"
                    }
                ]
            };
            suites.push(newSuite);
        }

        // Update the stored suites in Cosmos DB
        await cosmosService!.saveTestSuites(resourceId, suites);

        // In a real implementation, you would create an actual GitHub issue here
        // using the GitHub API and the connection.github_url
        console.log(`Mock GitHub issue created: ${title} for test case ${testCaseId}`);
        console.log(`GitHub URL: ${connection.github_url}`);
        console.log(`Labels: ${labels?.join(', ')}`);
        console.log(`Assignees: ${assignees?.join(', ')}`);

        res.json({ suites });
    } catch (error: any) {
        console.error('Error creating GitHub issue:', error);
        res.status(500).json({
            error: 'Failed to create GitHub issue',
            details: error.message
        });
    }
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
