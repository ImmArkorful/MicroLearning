const axios = require('axios');

const BASE_URL = 'http://13.218.173.57:3000/api';

async function testMobileOrigin() {
  console.log('📱 Testing Mobile App Origin Handling...\n');
  
  try {
    // Test with a new email
    const timestamp = Date.now();
    const credentials = {
      email: `mobile_test_${timestamp}@example.com`,
      password: 'password123'
    };
    
    console.log('📤 Testing registration with mobile app simulation:');
    console.log(JSON.stringify(credentials, null, 2));
    console.log('\n🔍 Making request WITHOUT origin header (like mobile apps)...');
    
    // Make request without origin header (simulating mobile app)
    const response = await axios.post(`${BASE_URL}/auth/register`, credentials, {
      headers: {
        'Content-Type': 'application/json',
        // No origin header - this simulates mobile app behavior
      }
    });
    
    console.log('\n✅ Mobile App Registration SUCCESSFUL!');
    console.log('📊 Server Response:');
    console.log('   Status:', response.status);
    console.log('   Message:', response.data.message);
    console.log('   User ID:', response.data.user.id);
    console.log('   Email:', response.data.user.email);
    console.log('   Has Token:', !!response.data.token);
    
    console.log('\n🎉 Mobile App Origin Handling is Working!');
    console.log('   The server now accepts requests from mobile apps without origin headers.');
    
  } catch (error) {
    console.log('\n❌ Mobile App Test FAILED!');
    console.log('Error type:', error.constructor.name);
    console.log('Error message:', error.message);
    
    if (error.response) {
      console.log('Response status:', error.response.status);
      console.log('Response data:', error.response.data);
    } else if (error.request) {
      console.log('No response received');
      console.log('Request details:', error.request);
    } else {
      console.log('Error details:', error);
    }
  }
}

testMobileOrigin();
