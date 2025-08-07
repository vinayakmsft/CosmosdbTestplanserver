# Cosmos DB Setup Guide

This application now uses Azure Cosmos DB for persistent storage instead of in-memory cache. Follow these steps to set up Cosmos DB.

## Prerequisites

1. Azure subscription
2. Azure Cosmos DB account

## Setting up Azure Cosmos DB

### Option 1: Using Azure Portal

1. **Create a Cosmos DB Account:**
   - Go to [Azure Portal](https://portal.azure.com)
   - Create a new resource → Databases → Azure Cosmos DB
   - Choose "Core (SQL)" API
   - Configure account settings (resource group, account name, region)
   - Review and create

2. **Get Connection Details:**
   - Go to your Cosmos DB account → Settings → Keys
   - Copy the URI (endpoint)
   - Copy the Primary Key

3. **Update Environment Variables:**
   ```bash
   COSMOS_DB_ENDPOINT=https://your-account-name.documents.azure.com:443/
   COSMOS_DB_KEY=your-primary-key-here
   COSMOS_DB_DATABASE=TestPlansDB
   ```

### Option 2: Using Azure CLI

```bash
# Login to Azure
az login

# Create resource group (if not exists)
az group create --name MyResourceGroup --location "East US"

# Create Cosmos DB account
az cosmosdb create \
  --resource-group MyResourceGroup \
  --name my-testplans-cosmosdb \
  --kind GlobalDocumentDB \
  --locations regionName="East US" failoverPriority=0 isZoneRedundant=False

# Get connection string
az cosmosdb keys list \
  --resource-group MyResourceGroup \
  --name my-testplans-cosmosdb \
  --type connection-strings

# Get endpoint and key
az cosmosdb show \
  --resource-group MyResourceGroup \
  --name my-testplans-cosmosdb \
  --query documentEndpoint

az cosmosdb keys list \
  --resource-group MyResourceGroup \
  --name my-testplans-cosmosdb \
  --query primaryMasterKey
```

## Database Structure

The application automatically creates the following structure:

- **Database:** `TestPlansDB` (configurable via environment variable)
- **Containers:**
  - `connections` - Stores connection configurations (partitioned by `resourceId`)
  - `testSuites` - Stores test suites and test cases (partitioned by `resourceId`)

## Environment Configuration

Update your `.env` file with the Cosmos DB details:

```bash
# Cosmos DB Configuration
COSMOS_DB_ENDPOINT=https://your-cosmos-account.documents.azure.com:443/
COSMOS_DB_KEY=your_cosmos_db_primary_key_here
COSMOS_DB_DATABASE=TestPlansDB
```

## API Changes

All APIs now use Cosmos DB for persistent storage:

1. **POST /:resourceId/saveConnection** - Saves connection to Cosmos DB
2. **GET /:resourceId** - Retrieves connection from Cosmos DB
3. **GET /:resourceId/ado_plans** - Saves test suites to Cosmos DB
4. **POST /:resourceId/createIssue/:testCaseId** - Updates test cases in Cosmos DB

## Health Check

The health check endpoint now includes Cosmos DB connectivity status:

```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "clientInitialized": true,
  "cosmosDbConnected": true
}
```

## Local Development

For local development, you can use the Cosmos DB Emulator:

1. Download and install [Azure Cosmos DB Emulator](https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator)
2. Start the emulator
3. Use these local settings:

```bash
COSMOS_DB_ENDPOINT=https://localhost:8081
COSMOS_DB_DATABASE=TestPlansDB
```

## Troubleshooting

- **Connection Issues:** Verify endpoint URL and key
- **Database Not Found:** The application creates it automatically
- **Permission Issues:** Ensure the key has read/write permissions
- **Network Issues:** Check firewall settings and network connectivity

## Cost Management

- Use the free tier (400 RU/s, 5 GB storage) for development
- Monitor usage in Azure Portal
- Set up budget alerts
- Consider using serverless billing for sporadic usage
