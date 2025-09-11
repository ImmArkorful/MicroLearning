const axios = require('axios');

// Debug the topic retrieval issue
async function debugTopics() {
  try {
    console.log('Debugging topic endpoints...');
    
    // First, login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'test@example.com',
      password: 'password20'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, got token');
    console.log('User data:', loginResponse.data.user);
    
    // Test the user-topics endpoint with more detailed error handling
    console.log('\nTesting topic retrieval with detailed error handling...');
    try {
      const getTopicsResponse = await axios.get('http://localhost:3000/api/lessons/user-topics', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log('✅ Topics retrieved successfully:');
      console.log('Number of topics:', getTopicsResponse.data.length);
      getTopicsResponse.data.forEach((topic, index) => {
        console.log(`${index + 1}. ${topic.topic} (${topic.category})`);
      });
    } catch (error) {
      console.error('❌ Error details:');
      console.error('Status:', error.response?.status);
      console.error('Status Text:', error.response?.statusText);
      console.error('Data:', error.response?.data);
      console.error('Headers:', error.response?.headers);
    }
    
  } catch (error) {
    console.error('❌ Error in debug:', error.response?.data || error.message);
  }
}

debugTopics();
