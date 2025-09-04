const axios = require('axios');

const SERVER_URL = 'http://13.218.173.57:3000';

async function testRegistration() {
  console.log('🧪 Testing user registration on server:', SERVER_URL);
  
  const testUser = {
    email: `testuser_${Date.now()}@example.com`,
    password: 'testpassword123',
    topicPreferences: ['science', 'technology']
  };
  
  try {
    console.log('📝 Attempting to register user:', testUser.email);
    
    const response = await axios.post(`${SERVER_URL}/api/auth/register`, testUser, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log('✅ Registration successful!');
    console.log('📊 Response:', {
      status: response.status,
      message: response.data.message,
      userId: response.data.user.id,
      email: response.data.user.email,
      hasToken: !!response.data.token
    });
    
    return response.data;
    
  } catch (error) {
    console.log('❌ Registration failed!');
    
    if (error.response) {
      // Server responded with error status
      console.log('📊 Error Response:', {
        status: error.response.status,
        error: error.response.data.error,
        data: error.response.data
      });
    } else if (error.request) {
      // Request was made but no response received
      console.log('🌐 Network Error:', {
        message: error.message,
        code: error.code
      });
    } else {
      // Something else happened
      console.log('💥 Unexpected Error:', {
        message: error.message,
        type: error.constructor.name
      });
    }
    
    throw error;
  }
}

async function testLogin(email, password) {
  console.log('\n🔐 Testing login for user:', email);
  
  try {
    const response = await axios.post(`${SERVER_URL}/api/auth/login`, {
      email,
      password
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Login successful!');
    console.log('📊 Response:', {
      status: response.status,
      message: response.data.message,
      userId: response.data.user.id,
      hasToken: !!response.data.token
    });
    
    return response.data;
    
  } catch (error) {
    console.log('❌ Login failed!');
    
    if (error.response) {
      console.log('📊 Error Response:', {
        status: error.response.status,
        error: error.response.data.error
      });
    } else {
      console.log('💥 Error:', error.message);
    }
    
    throw error;
  }
}

async function runTests() {
  try {
    // Test registration
    const registrationResult = await testRegistration();
    
    // Test login with the newly created user
    if (registrationResult && registrationResult.user) {
      await testLogin(registrationResult.user.email, 'testpassword123');
    }
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.log('\n💥 Test suite failed:', error.message);
  }
}

// Run the tests
runTests();
