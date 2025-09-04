const axios = require('axios');

const SERVER_URL = 'http://13.218.173.57:3000';

async function testRegistrationDetailed() {
  console.log('🧪 Testing user registration with detailed error reporting...');
  
  const testUser = {
    email: `testuser_${Date.now()}@example.com`,
    password: 'testpassword123',
    topicPreferences: ['science', 'technology']
  };
  
  try {
    console.log('📝 Attempting to register user:', testUser.email);
    console.log('📤 Request payload:', JSON.stringify(testUser, null, 2));
    
    const response = await axios.post(`${SERVER_URL}/api/auth/register`, testUser, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LearnFlow-Test-Client/1.0'
      },
      timeout: 15000 // 15 second timeout
    });
    
    console.log('✅ Registration successful!');
    console.log('📊 Response:', {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data
    });
    
    return response.data;
    
  } catch (error) {
    console.log('❌ Registration failed!');
    console.log('🔍 Error details:');
    
    if (error.response) {
      // Server responded with error status
      console.log('📊 Server Response Error:');
      console.log('   Status:', error.response.status);
      console.log('   Status Text:', error.response.statusText);
      console.log('   Headers:', error.response.headers);
      console.log('   Data:', error.response.data);
      
      // Try to get more details if available
      if (error.response.data && error.response.data.error) {
        console.log('   Error Message:', error.response.data.error);
      }
      
    } else if (error.request) {
      // Request was made but no response received
      console.log('🌐 Network Error:');
      console.log('   Message:', error.message);
      console.log('   Code:', error.code);
      console.log('   Request:', error.request);
      
    } else {
      // Something else happened
      console.log('💥 Unexpected Error:');
      console.log('   Message:', error.message);
      console.log('   Type:', error.constructor.name);
      console.log('   Stack:', error.stack);
    }
    
    // Additional error information
    console.log('\n🔍 Additional Error Info:');
    console.log('   Is Axios Error:', error.isAxiosError);
    console.log('   Config:', {
      url: error.config?.url,
      method: error.config?.method,
      baseURL: error.config?.baseURL,
      timeout: error.config?.timeout
    });
    
    throw error;
  }
}

async function testDatabaseConnection() {
  console.log('\n🗄️ Testing if we can get database-related error details...');
  
  try {
    // Try to get any server logs or error details
    const response = await axios.get(`${SERVER_URL}/api/health`, {
      timeout: 5000
    });
    console.log('✅ Server is responding to health checks');
    
    // Try to make a request that might trigger database operations
    console.log('🔍 Testing if server can handle basic requests...');
    
  } catch (error) {
    console.log('❌ Server health check failed:', error.message);
  }
}

async function runDetailedTests() {
  try {
    await testDatabaseConnection();
    await testRegistrationDetailed();
    
    console.log('\n🎉 Detailed tests completed!');
    
  } catch (error) {
    console.log('\n💥 Test suite failed with detailed error information above');
    
    // Provide suggestions based on the error
    if (error.response && error.response.status === 500) {
      console.log('\n💡 Suggestions for 500 Internal Server Error:');
      console.log('   1. Check server logs for database connection errors');
      console.log('   2. Verify PostgreSQL is running on the server');
      console.log('   3. Check database credentials in server .env file');
      console.log('   4. Ensure database tables exist and are properly configured');
    }
  }
}

// Run the detailed tests
runDetailedTests();
