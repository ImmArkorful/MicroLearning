const axios = require('axios');

const LOCAL_IP = '192.168.0.183';
const SERVER_URL = `http://${LOCAL_IP}:3000`;

async function testLocalIPConnectivity() {
  console.log('🔍 Testing local IP connectivity...\n');
  console.log(`📡 Testing connection to: ${SERVER_URL}\n`);
  
  try {
    // Test 1: Basic connectivity
    console.log('📡 Test 1: Basic connectivity...');
    const healthResponse = await axios.get(`${SERVER_URL}/health`);
    console.log('✅ Health check successful:', healthResponse.status, healthResponse.data);
    
    // Test 2: API endpoint
    console.log('\n📡 Test 2: API endpoint...');
    const apiResponse = await axios.get(`${SERVER_URL}/api/health`);
    console.log('✅ API health check successful:', apiResponse.status, apiResponse.data);
    
    console.log('\n🎉 Local IP connectivity test completed successfully!');
    console.log(`   The server is reachable at ${LOCAL_IP}:3000`);
    console.log('   Your mobile app should now be able to connect!');
    
  } catch (error) {
    console.log('\n❌ Local IP connectivity test failed!');
    console.log('Error type:', error.constructor.name);
    console.log('Error message:', error.message);
    
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    } else if (error.request) {
      console.log('No response received - network issue');
      console.log('This suggests the server is not accessible on the local network');
    } else {
      console.log('Other error:', error);
    }
  }
}

testLocalIPConnectivity();
