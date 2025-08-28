const axios = require('axios');

// Test the topic storage and retrieval
async function testTopics() {
  try {
    console.log('Testing topic endpoints...');
    
    // First, login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'test@example.com',
      password: 'password'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, got token');
    
    // Test storing a topic
    console.log('\nTesting topic storage...');
    const storeResponse = await axios.post('http://localhost:3000/api/lessons/store-topic', {
      category: 'Science',
      topic: 'Test Topic - Quantum Physics',
      summary: 'This is a test summary about quantum physics.',
      quiz: {
        question: 'What is quantum physics?',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 'A'
      }
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Topic stored successfully:', storeResponse.data);
    
    // Test retrieving all topics
    console.log('\nTesting topic retrieval...');
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
    
    // Test retrieving topics by category
    console.log('\nTesting topic retrieval by category...');
    const getCategoryTopicsResponse = await axios.get('http://localhost:3000/api/lessons/user-topics/Science', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Category topics retrieved successfully:');
    console.log('Number of Science topics:', getCategoryTopicsResponse.data.length);
    getCategoryTopicsResponse.data.forEach((topic, index) => {
      console.log(`${index + 1}. ${topic.topic}`);
    });
    
  } catch (error) {
    console.error('❌ Error testing topics:', error.response?.data || error.message);
  }
}

testTopics();
