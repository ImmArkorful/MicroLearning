const axios = require('axios');

async function testPreferencesUpdate() {
  try {
    // First, login to get a token
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://13.218.173.57:3000/api/auth/login', {
      email: 'e.arkorful3@gmail.com',
      password: 'password'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, got token');
    
    // Now try to update preferences
    console.log('\n📝 Updating topic preferences...');
    const updateResponse = await axios.put(
      'http://13.218.173.57:3000/api/auth/preferences/topics',
      {
        topicPreferences: ['technology', 'science', 'history']
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Update successful!');
    console.log('Response:', updateResponse.data);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response data:', error.response.data);
      console.error('Response headers:', error.response.headers);
    }
  }
}

testPreferencesUpdate();
