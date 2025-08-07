const fs = require('fs');
const https = require('https');

// Read the PRD content from file
const prdContent = fs.readFileSync('MPT-PRD.md', 'utf8');

// Prepare the request data
const requestData = JSON.stringify({
    prd: prdContent,
    testPlanId: "2541627"
});

// Request options
const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/testplans/recommendations',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData)
    }
};

console.log('🚀 Testing Recommendations API...');
console.log(`📄 PRD Length: ${prdContent.length} characters`);
console.log(`🎯 Target: http://localhost:3000/api/testplans/recommendations`);

// Make the request
const http = require('http'); // Use http instead of https for localhost
const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            
            console.log('\n✅ Full API Response:');
            console.log('='.repeat(80));
            console.log(JSON.stringify(response, null, 2));
            console.log('='.repeat(80));
            
            console.log('\n📊 Response Summary:');
            console.log(`Success: ${response.success}`);
            console.log(`PRD Length: ${response.data?.prdLength} characters`);
            console.log(`Existing Test Cases: ${response.data?.existingTestCasesCount}`);
            console.log(`Generated Recommendations: ${response.data?.recommendations?.length}`);
            console.log(`Generated At: ${response.data?.generatedAt}`);
            
            console.log('\n🎉 Test completed successfully!');
        } catch (error) {
            console.error('❌ Error parsing response:', error);
            console.error('Raw response:', data);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Request error:', error);
});

// Write data to request body
req.write(requestData);
req.end();
