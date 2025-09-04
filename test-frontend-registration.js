const axios = require('axios');

const SERVER_URL = 'http://13.218.173.57:3000';

async function testFrontendRegistration() {
  console.log('🧪 Testing frontend registration (mimicking current app behavior)...');
  
  // This is exactly what the frontend now sends
  const frontendRequest = {
    email: `frontend_test_${Date.now()}@example.com`,
    password: 'password123'
    // No topicPreferences field - exactly like the updated frontend
  };
  
  console.log('📤 Frontend Request Payload:');
  console.log(JSON.stringify(frontendRequest, null, 2));
  console.log('\n🔍 Key Points:');
  console.log('   - No topicPreferences field');
  console.log('   - Only email and password');
  console.log('   - This should work without 500 errors');
  
  try {
    console.log('\n📝 Sending registration request...');
    
    const response = await axios.post(`${SERVER_URL}/api/auth/register`, frontendRequest, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LearnFlow-Frontend-Test/1.0'
      },
      timeout: 15000
    });
    
    console.log('\n✅ Registration SUCCESSFUL!');
    console.log('📊 Server Response:');
    console.log('   Status:', response.status);
    console.log('   Message:', response.data.message);
    console.log('   User ID:', response.data.user.id);
    console.log('   Email:', response.data.user.email);
    console.log('   Created At:', response.data.user.created_at);
    console.log('   Has Token:', !!response.data.token);
    
    if (response.data.token) {
      console.log('   Token Preview:', response.data.token.substring(0, 20) + '...');
    }
    
    return response.data;
    
  } catch (error) {
    console.log('\n❌ Registration FAILED!');
    console.log('🔍 Error Analysis:');
    
    if (error.response) {
      // Server responded with error status
      console.log('📊 Server Error Response:');
      console.log('   Status:', error.response.status);
      console.log('   Status Text:', error.response.statusText);
      console.log('   Error Message:', error.response.data?.error);
      console.log('   Full Response:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 500) {
        console.log('\n🚨 500 Internal Server Error Detected!');
        console.log('   This suggests a server-side issue:');
        console.log('   1. Database connection problem');
        console.log('   2. Missing or corrupted database tables');
        console.log('   3. Server configuration issue');
        console.log('   4. Environment variable problems');
      } else if (error.response.status === 400) {
        console.log('\n⚠️ 400 Bad Request Error Detected!');
        console.log('   This suggests a client-side issue:');
        console.log('   1. Invalid email format');
        console.log('   2. Password requirements not met');
        console.log('   3. Missing required fields');
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
    
    throw error;
  }
}

async function testLoginAfterRegistration(email, password) {
  console.log('\n🔐 Testing login for the newly registered user...');
  
  try {
    const loginResponse = await axios.post(`${SERVER_URL}/api/auth/login`, {
      email,
      password
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Login SUCCESSFUL!');
    console.log('📊 Login Response:');
    console.log('   Status:', loginResponse.status);
    console.log('   Message:', loginResponse.data.message);
    console.log('   User ID:', loginResponse.data.user.id);
    console.log('   Has Token:', !!loginResponse.data.token);
    
    return loginResponse.data;
    
  } catch (error) {
    console.log('❌ Login FAILED!');
    
    if (error.response) {
      console.log('📊 Login Error Response:');
      console.log('   Status:', error.response.status);
      console.log('   Error:', error.response.data.error);
    } else {
      console.log('💥 Login Error:', error.message);
    }
    
    throw error;
  }
}

async function runFrontendTests() {
  try {
    console.log('🚀 Starting Frontend Registration Test Suite...\n');
    
    // Test 1: Frontend-style registration
    const registrationResult = await testFrontendRegistration();
    
    // Test 2: Login with the newly created user
    if (registrationResult && registrationResult.user) {
      await testLoginAfterRegistration(registrationResult.user.email, 'password123');
    }
    
    console.log('\n🎉 Frontend Registration Test Suite COMPLETED SUCCESSFULLY!');
    console.log('\n📋 Test Results Summary:');
    console.log('   ✅ Registration works without topicPreferences');
    console.log('   ✅ Login works after registration');
    console.log('   ✅ Server handles frontend requests correctly');
    console.log('\n💡 This confirms the frontend changes are working!');
    console.log('   The app should now register users without navigation issues.');
    
  } catch (error) {
    console.log('\n💥 Frontend Registration Test Suite FAILED!');
    console.log('\n🔍 Debugging Information:');
    console.log('   Error Type:', error.constructor.name);
    console.log('   Error Message:', error.message);
    
    if (error.response) {
      console.log('\n📊 Next Steps for Debugging:');
      console.log('   1. Check server logs for detailed error information');
      console.log('   2. Verify database connection and table structure');
      console.log('   3. Check server environment variables');
      console.log('   4. Test database queries manually');
    }
  }
}

// Run the frontend registration tests
runFrontendTests();
