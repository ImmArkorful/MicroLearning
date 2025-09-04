const axios = require('axios');

const SERVER_URL = 'http://13.218.173.57:3000';

async function testRegistrationWithoutPreferences() {
  console.log('🧪 Testing registration WITHOUT topicPreferences...');
  
  const testUser = {
    email: `no_prefs_${Date.now()}@test.com`,
    password: 'password123'
    // No topicPreferences field at all
  };
  
  try {
    console.log('📝 Attempting registration for:', testUser.email);
    console.log('📤 Request payload:', JSON.stringify(testUser, null, 2));
    
    const response = await axios.post(`${SERVER_URL}/api/auth/register`, testUser, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
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
      console.log('📊 Error Response:', {
        status: error.response.status,
        error: error.response.data.error,
        data: error.response.data
      });
    } else if (error.request) {
      console.log('🌐 Network Error:', error.message);
    } else {
      console.log('💥 Unexpected Error:', error.message);
    }
    
    throw error;
  }
}

async function testLoginAfterRegistration(email, password) {
  console.log('\n🔐 Testing login for newly registered user:', email);
  
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

async function runNoPreferencesTests() {
  try {
    // Test registration without topicPreferences
    const registrationResult = await testRegistrationWithoutPreferences();
    
    // Test login with the newly created user
    if (registrationResult && registrationResult.user) {
      await testLoginAfterRegistration(registrationResult.user.email, 'password123');
    }
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Registration works without topicPreferences');
    console.log('   ✅ Login works after registration');
    console.log('   ✅ Server handles missing topicPreferences gracefully');
    console.log('\n💡 This confirms the server setup is working correctly');
    
  } catch (error) {
    console.log('\n💥 Test suite failed:', error.message);
    
    if (error.response && error.response.status === 500) {
      console.log('\n🔍 500 error suggests there might still be a server-side issue:');
      console.log('   1. Database connection problems');
      console.log('   2. Missing database tables');
      console.log('   3. Server configuration issues');
    }
  }
}

// Run the tests
runNoPreferencesTests();
