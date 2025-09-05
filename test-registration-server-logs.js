const axios = require('axios');

const SERVER_URL = 'http://13.218.173.57:3000';

async function testRegistrationServerLogs() {
  console.log('🔍 Testing if registration requests reach the server...\n');
  
  try {
    // Test 1: Try to register with existing email (should get 400 error)
    console.log('📡 Test 1: Registration with existing email...');
    console.log('   This should generate server logs showing the registration attempt');
    
    try {
      const response = await axios.post(`${SERVER_URL}/api/auth/register`, {
        email: 'e.arkorful3@gmail.com', // Your existing email
        password: 'password20'
      });
      
      console.log('✅ Registration successful (unexpected):', response.status, response.data);
      
    } catch (error) {
      if (error.response) {
        console.log('✅ Registration request reached server (expected 400 error):');
        console.log('   Status:', error.response.status);
        console.log('   Message:', error.response.data);
        console.log('   📝 Check your server logs - you should see this request logged!');
      } else {
        console.log('❌ Registration request did NOT reach server:');
        console.log('   Error:', error.message);
        console.log('   This explains why you don\'t see server logs for registration');
      }
    }
    
    // Test 2: Try to register with new email (should get 201 success)
    console.log('\n📡 Test 2: Registration with new email...');
    const timestamp = Date.now();
    const newEmail = `test_server_logs_${timestamp}@example.com`;
    
    try {
      const response = await axios.post(`${SERVER_URL}/api/auth/register`, {
        email: newEmail,
        password: 'password123'
      });
      
      console.log('✅ Registration successful (expected):', response.status, response.data);
      console.log('   📝 Check your server logs - you should see this request logged!');
      
    } catch (error) {
      if (error.response) {
        console.log('❌ Registration failed (unexpected):', error.response.status, error.response.data);
      } else {
        console.log('❌ Registration request did NOT reach server:', error.message);
      }
    }
    
  } catch (error) {
    console.log('\n❌ Test failed:', error.message);
  }
}

testRegistrationServerLogs();
