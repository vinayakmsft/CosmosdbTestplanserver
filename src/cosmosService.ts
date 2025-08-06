import { CosmosClient, Database, Container } from '@azure/cosmos';
import * as dotenv from 'dotenv';

dotenv.config();

export interface Connection {
    id?: string;
    resourceId: string;
    connectionId: string;
    github_url: string;
    prd: string;
    ado_url: string;
    website_url: string;
    _ts?: number;
}

export interface TestCase {
    name: string;
    steps: string[];
    issueId?: string;
    status?: string;
}

export interface TestSuite {
    id?: string;
    resourceId: string;
    name: string;
    testCaseId: string;
    testCases: TestCase[];
    _ts?: number;
}

export interface TestPlan {
    id?: string;
    resourceId: string;
    planId: number;
    name: string;
    description?: string;
    state?: string;
    iteration?: string;
    areaPath?: string;
    startDate?: Date;
    endDate?: Date;
    _ts?: number;
}

export class CosmosService {
    private client: CosmosClient;
    private database: Database;
    private connectionsContainer: Container;
    private testSuitesContainer: Container;
    private testPlansContainer: Container;
    private isInitialized: boolean = false;

    constructor() {
        const endpoint = process.env.COSMOS_DB_ENDPOINT;
        const key = process.env.COSMOS_DB_KEY;

        if (!endpoint || !key) {
            throw new Error('COSMOS_DB_ENDPOINT and COSMOS_DB_KEY must be set in environment variables');
        }

        this.client = new CosmosClient({ endpoint, key });
        this.database = this.client.database(process.env.COSMOS_DB_DATABASE || 'testagentcosmosdb');
        this.connectionsContainer = this.database.container('connections');
        this.testSuitesContainer = this.database.container('testSuites');
        this.testPlansContainer = this.database.container('testPlans');
    }

    async initialize(): Promise<void> {
        try {
            console.log('Initializing Cosmos DB...');
            
            // Create database if it doesn't exist
            const { database } = await this.client.databases.createIfNotExists({
                id: process.env.COSMOS_DB_DATABASE || 'testagentcosmosdb'
            });

            // Create containers if they don't exist
            await database.containers.createIfNotExists({
                id: 'connections',
                partitionKey: '/resourceId'
            });

            await database.containers.createIfNotExists({
                id: 'testSuites',
                partitionKey: '/resourceId'
            });

            await database.containers.createIfNotExists({
                id: 'testPlans',
                partitionKey: '/resourceId'
            });

            this.isInitialized = true;
            console.log('Cosmos DB initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Cosmos DB:', error);
            throw error;
        }
    }

    // Connection methods
    async saveConnection(connection: Connection): Promise<Connection> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            // Set the id to be the same as resourceId for easy retrieval
            const connectionToSave = {
                ...connection,
                id: connection.resourceId
            };

            const { resource } = await this.connectionsContainer.items.upsert(connectionToSave);
            return resource as unknown as Connection;
        } catch (error) {
            console.error('Error saving connection to Cosmos DB:', error);
            throw error;
        }
    }

    async getConnection(resourceId: string): Promise<Connection | null> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            const { resource } = await this.connectionsContainer.item(resourceId, resourceId).read<Connection>();
            return resource || null;
        } catch (error: any) {
            if (error.code === 404) {
                return null; // Connection not found
            }
            console.error('Error getting connection from Cosmos DB:', error);
            throw error;
        }
    }

    async deleteConnection(resourceId: string): Promise<void> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            await this.connectionsContainer.item(resourceId, resourceId).delete();
        } catch (error: any) {
            if (error.code !== 404) {
                console.error('Error deleting connection from Cosmos DB:', error);
                throw error;
            }
        }
    }

    // Test Suites methods
    async saveTestSuites(resourceId: string, suites: TestSuite[]): Promise<TestSuite[]> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            const savedSuites: TestSuite[] = [];

            for (const suite of suites) {
                const suiteToSave = {
                    ...suite,
                    id: `${resourceId}_${suite.testCaseId}`,
                    resourceId
                };

                const { resource } = await this.testSuitesContainer.items.upsert(suiteToSave);
                savedSuites.push(resource as unknown as TestSuite);
            }

            return savedSuites;
        } catch (error) {
            console.error('Error saving test suites to Cosmos DB:', error);
            throw error;
        }
    }

    async getTestSuites(resourceId: string): Promise<TestSuite[]> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            const querySpec = {
                query: 'SELECT * FROM c WHERE c.resourceId = @resourceId',
                parameters: [
                    {
                        name: '@resourceId',
                        value: resourceId
                    }
                ]
            };

            const { resources } = await this.testSuitesContainer.items.query<TestSuite>(querySpec).fetchAll();
            return resources;
        } catch (error) {
            console.error('Error getting test suites from Cosmos DB:', error);
            throw error;
        }
    }

    async updateTestSuite(resourceId: string, testCaseId: string, updates: Partial<TestSuite>): Promise<TestSuite | null> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            const suiteId = `${resourceId}_${testCaseId}`;
            
            // Get existing suite
            const { resource: existingSuite } = await this.testSuitesContainer.item(suiteId, resourceId).read<TestSuite>();
            
            if (!existingSuite) {
                return null;
            }

            // Merge updates
            const updatedSuite = {
                ...existingSuite,
                ...updates,
                id: suiteId,
                resourceId
            };

            const { resource } = await this.testSuitesContainer.item(suiteId, resourceId).replace(updatedSuite);
            return resource as TestSuite;
        } catch (error: any) {
            if (error.code === 404) {
                return null;
            }
            console.error('Error updating test suite in Cosmos DB:', error);
            throw error;
        }
    }

    async deleteTestSuites(resourceId: string): Promise<void> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            const querySpec = {
                query: 'SELECT c.id FROM c WHERE c.resourceId = @resourceId',
                parameters: [
                    {
                        name: '@resourceId',
                        value: resourceId
                    }
                ]
            };

            const { resources } = await this.testSuitesContainer.items.query(querySpec).fetchAll();
            
            for (const item of resources) {
                await this.testSuitesContainer.item(item.id, resourceId).delete();
            }
        } catch (error) {
            console.error('Error deleting test suites from Cosmos DB:', error);
            throw error;
        }
    }

    // Test Plans methods
    async saveTestPlans(resourceId: string, testPlans: any[]): Promise<TestPlan[]> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            const savedPlans: TestPlan[] = [];

            for (const plan of testPlans) {
                const planToSave: TestPlan = {
                    id: `${resourceId}_${plan.id}`,
                    resourceId,
                    planId: plan.id,
                    name: plan.name,
                    description: plan.description,
                    state: plan.state,
                    iteration: plan.iteration,
                    areaPath: plan.areaPath,
                    startDate: plan.startDate ? new Date(plan.startDate) : undefined,
                    endDate: plan.endDate ? new Date(plan.endDate) : undefined
                };

                const { resource } = await this.testPlansContainer.items.upsert(planToSave);
                savedPlans.push(resource as unknown as TestPlan);
            }

            return savedPlans;
        } catch (error) {
            console.error('Error saving test plans to Cosmos DB:', error);
            throw error;
        }
    }

    async getTestPlans(resourceId: string): Promise<TestPlan[]> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            const querySpec = {
                query: 'SELECT * FROM c WHERE c.resourceId = @resourceId',
                parameters: [
                    {
                        name: '@resourceId',
                        value: resourceId
                    }
                ]
            };

            const { resources } = await this.testPlansContainer.items.query<TestPlan>(querySpec).fetchAll();
            return resources;
        } catch (error) {
            console.error('Error getting test plans from Cosmos DB:', error);
            throw error;
        }
    }

    async updateTestPlan(resourceId: string, planId: number, updates: Partial<TestPlan>): Promise<TestPlan | null> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            const testPlanId = `${resourceId}_${planId}`;
            
            // Get existing plan
            const { resource: existingPlan } = await this.testPlansContainer.item(testPlanId, resourceId).read<TestPlan>();
            
            if (!existingPlan) {
                return null;
            }

            // Merge updates
            const updatedPlan = {
                ...existingPlan,
                ...updates,
                id: testPlanId,
                resourceId
            };

            const { resource } = await this.testPlansContainer.item(testPlanId, resourceId).replace(updatedPlan);
            return resource as TestPlan;
        } catch (error: any) {
            if (error.code === 404) {
                return null;
            }
            console.error('Error updating test plan in Cosmos DB:', error);
            throw error;
        }
    }

    async deleteTestPlans(resourceId: string): Promise<void> {
        try {
            if (!this.isInitialized) {
                throw new Error('CosmosService not initialized. Call initialize() first.');
            }

            const querySpec = {
                query: 'SELECT c.id FROM c WHERE c.resourceId = @resourceId',
                parameters: [
                    {
                        name: '@resourceId',
                        value: resourceId
                    }
                ]
            };

            const { resources } = await this.testPlansContainer.items.query(querySpec).fetchAll();
            
            for (const item of resources) {
                await this.testPlansContainer.item(item.id, resourceId).delete();
            }
        } catch (error) {
            console.error('Error deleting test plans from Cosmos DB:', error);
            throw error;
        }
    }

    // Health check method
    async healthCheck(): Promise<boolean> {
        try {
            if (!this.isInitialized) {
                return false;
            }

            // Simple read operation to check connectivity
            await this.database.read();
            return true;
        } catch (error) {
            console.error('Cosmos DB health check failed:', error);
            return false;
        }
    }
}
