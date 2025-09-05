const axios = require('axios');

const SERVER_URL = 'http://13.218.173.57:3000';

async function testServerConnectivity() {
  console.log('🔍 Testing server connectivity...\n');
  
  try {
    // Test 1: Basic connectivity
    console.log('📡 Test 1: Basic connectivity...');
    const healthResponse = await axios.get(`${SERVER_URL}/health`);
    console.log('✅ Health check successful:', healthResponse.status, healthResponse.data);
    
    // Test 2: API endpoint
    console.log('\n📡 Test 2: API endpoint...');
    const apiResponse = await axios.get(`${SERVER_URL}/api/health`);
    console.log('✅ API health check successful:', apiResponse.status, apiResponse.data);
    
    // Test 3: Registration endpoint (should fail with 400, not network error)
    console.log('\n📡 Test 3: Registration endpoint...');
    try {
      const regResponse = await axios.post(`${SERVER_URL}/api/auth/register`, {
        email: 'test_connectivity@example.com',
        password: 'password123'
      });
      console.log('✅ Registration successful:', regResponse.status, regResponse.data);
    } catch (regError) {
      if (regError.response) {
        console.log('✅ Registration endpoint reachable (expected error):', regError.response.status, regError.response.data);
      } else {
        console.log('❌ Registration endpoint network error:', regError.message);
      }
    }
    
    console.log('\n🎉 Server connectivity test completed successfully!');
    console.log('   The server is reachable from your machine.');
    console.log('   The issue is likely in the mobile app network configuration.');
    
  } catch (error) {
    console.log('\n❌ Server connectivity test failed!');
    console.log('Error type:', error.constructor.name);
    console.log('Error message:', error.message);
    
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    } else if (error.request) {
      console.log('No response received - network issue');
      console.log('This suggests the server is not reachable from your machine');
    } else {
      console.log('Other error:', error);
    }
  }
}

testServerConnectivity();
