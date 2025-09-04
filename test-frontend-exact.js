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

async function testFrontendRegistration() {
  console.log('🚀 Testing Frontend Registration (Exact Frontend Behavior)...\n');
  
  try {
    // Test with the exact same data the user has in their RegisterScreen
    const credentials = {
      email: 'e.arkorful3@gmail.com',
      password: 'password20'
    };
    
    console.log('📤 Frontend Request Payload:');
    console.log(JSON.stringify(credentials, null, 2));
    console.log('\n🔍 Making request to:', `${BASE_URL}/auth/register`);
    
    const response = await api.post('/auth/register', credentials);
    
    console.log('\n✅ Registration SUCCESSFUL!');
    console.log('📊 Server Response:');
    console.log('   Status:', response.status);
    console.log('   Message:', response.data.message);
    console.log('   User ID:', response.data.user.id);
    console.log('   Email:', response.data.user.email);
    console.log('   Created At:', response.data.user.created_at);
    console.log('   Has Token:', !!response.data.token);
    console.log('   Token Preview:', response.data.token.substring(0, 50) + '...');
    
    // Test if we can use the token to make an authenticated request
    console.log('\n🔐 Testing token authentication...');
    const authResponse = await api.get('/user/profile', {
      headers: {
        'Authorization': `Bearer ${response.data.token}`
      }
    });
    
    console.log('✅ Token authentication successful!');
    console.log('   Profile endpoint status:', authResponse.status);
    
  } catch (error) {
    console.log('\n❌ Registration FAILED!');
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

testFrontendRegistration();
