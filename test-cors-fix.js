const axios = require('axios');

const BASE_URL = 'http://13.218.173.57:3000/api';

// Create axios instance with same config as frontend
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

async function testCorsFix() {
  console.log('🚀 Testing CORS Fix...\n');
  
  try {
    // Test with a new email to avoid "already exists" error
    const timestamp = Date.now();
    const credentials = {
      email: `test_cors_${timestamp}@example.com`,
      password: 'password123'
    };
    
    console.log('📤 Testing registration with new email:');
    console.log(JSON.stringify(credentials, null, 2));
    console.log('\n🔍 Making request to:', `${BASE_URL}/auth/register`);
    
    const response = await api.post('/auth/register', credentials);
    
    console.log('\n✅ Registration SUCCESSFUL!');
    console.log('📊 Server Response:');
    console.log('   Status:', response.status);
    console.log('   Message:', response.data.message);
    console.log('   User ID:', response.data.user.id);
    console.log('   Email:', response.data.user.email);
    console.log('   Has Token:', !!response.data.token);
    
    console.log('\n🎉 CORS Fix is Working!');
    console.log('   The server is now accepting requests from mobile apps.');
    
  } catch (error) {
    console.log('\n❌ Test FAILED!');
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

testCorsFix();
