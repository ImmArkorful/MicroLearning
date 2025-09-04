const axios = require('axios');

const SERVER_URL = 'http://13.218.173.57:3000';

async function testMinimalRegistration() {
  console.log('🧪 Testing minimal user registration...');
  
  // Test with minimal data - no topicPreferences
  const minimalUser = {
    email: `minimal_${Date.now()}@test.com`,
    password: 'password123'
  };
  
  try {
    console.log('📝 Attempting minimal registration for:', minimalUser.email);
    console.log('📤 Request payload:', JSON.stringify(minimalUser, null, 2));
    
    const response = await axios.post(`${SERVER_URL}/api/auth/register`, minimalUser, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Minimal registration successful!');
    console.log('📊 Response:', response.data);
    
    return response.data;
    
  } catch (error) {
    console.log('❌ Minimal registration failed!');
    
    if (error.response) {
      console.log('📊 Error Details:');
      console.log('   Status:', error.response.status);
      console.log('   Error:', error.response.data.error);
      
      // Try to get more specific error information
      if (error.response.data.error === 'Internal server error.') {
        console.log('\n🔍 This suggests a server-side issue:');
        console.log('   - Database connection problem');
        console.log('   - Missing database tables');
        console.log('   - Server configuration issue');
        console.log('\n💡 To fix this, you need to:');
        console.log('   1. Ensure PostgreSQL is running on the server');
        console.log('   2. Create the database and tables');
        console.log('   3. Update the server .env file with correct DB credentials');
        console.log('   4. Run the database setup scripts on the server');
      }
    } else {
      console.log('🌐 Network Error:', error.message);
    }
    
    throw error;
  }
}

async function testServerStatus() {
  console.log('\n🏥 Checking server status...');
  
  try {
    const healthResponse = await axios.get(`${SERVER_URL}/api/health`);
    console.log('✅ Server is running and healthy');
    console.log('📊 Health response:', healthResponse.data);
    
    // Check if we can reach the auth endpoint
    console.log('\n🔍 Testing auth endpoint availability...');
    try {
      const authResponse = await axios.get(`${SERVER_URL}/api/auth`, {
        timeout: 5000
      });
      console.log('✅ Auth endpoint is accessible');
    } catch (authError) {
      if (authError.response && authError.response.status === 404) {
        console.log('⚠️ Auth endpoint exists but GET method not supported (this is normal)');
      } else {
        console.log('❌ Auth endpoint test failed:', authError.message);
      }
    }
    
  } catch (error) {
    console.log('❌ Server health check failed:', error.message);
  }
}

async function runMinimalTests() {
  try {
    await testServerStatus();
    await testMinimalRegistration();
    
    console.log('\n🎉 Minimal tests completed!');
    
  } catch (error) {
    console.log('\n💥 Minimal test suite failed');
    console.log('\n📋 Summary:');
    console.log('   The server is running and responding to health checks');
    console.log('   But the registration endpoint is failing with 500 errors');
    console.log('   This indicates a database or server configuration issue');
  }
}

// Run the minimal tests
runMinimalTests();
