const axios = require('axios');

const SERVER_URL = 'http://13.218.173.57:3000';

async function testServerHealth() {
  console.log('🏥 Testing server health at:', SERVER_URL);
  
  try {
    // Test basic connectivity
    console.log('🔍 Testing basic connectivity...');
    const healthResponse = await axios.get(`${SERVER_URL}/health`, {
      timeout: 5000
    });
    console.log('✅ Health check successful:', healthResponse.data);
    
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
  }
  
  try {
    // Test API health endpoint
    console.log('\n🔍 Testing API health endpoint...');
    const apiHealthResponse = await axios.get(`${SERVER_URL}/api/health`, {
      timeout: 5000
    });
    console.log('✅ API health check successful:', apiHealthResponse.data);
    
  } catch (error) {
    console.log('❌ API health check failed:', error.message);
  }
  
  try {
    // Test root endpoint
    console.log('\n🔍 Testing root endpoint...');
    const rootResponse = await axios.get(`${SERVER_URL}/`, {
      timeout: 5000
    });
    console.log('✅ Root endpoint successful:', rootResponse.data);
    
  } catch (error) {
    console.log('❌ Root endpoint failed:', error.message);
  }
}

testServerHealth();
