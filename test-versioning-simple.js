const axios = require('axios');

// Simple test of versioning logic (bypassing AI generation)
async function testVersioningSimple() {
  try {
    console.log('Testing simple versioning logic...');
    
    // Login
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'test@example.com',
      password: 'password'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    
    // Test 1: Store a topic directly
    console.log('\n=== Test 1: Storing "Deep Learning" directly ===');
    const store1 = await axios.post('http://localhost:3000/api/lessons/store-topic', {
      category: 'Science',
      topic: 'Deep Learning',
      summary: 'Deep learning is a subset of machine learning...',
      quiz: {
        question: 'What is deep learning?',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 'A'
      }
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Store 1 response:', store1.data);
    
    // Test 2: Try to store the same topic again
    console.log('\n=== Test 2: Storing "Deep Learning" again ===');
    const store2 = await axios.post('http://localhost:3000/api/lessons/store-topic', {
      category: 'Science',
      topic: 'Deep Learning',
      summary: 'Deep learning is a subset of machine learning...',
      quiz: {
        question: 'What is deep learning?',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 'A'
      }
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Store 2 response:', store2.data);
    
    // Test 3: Store a similar topic (should create version 2)
    console.log('\n=== Test 3: Storing "Deep Learning Basics" ===');
    const store3 = await axios.post('http://localhost:3000/api/lessons/store-topic', {
      category: 'Science',
      topic: 'Deep Learning Basics',
      summary: 'Deep learning basics cover fundamental concepts...',
      quiz: {
        question: 'What are deep learning basics?',
        options: ['A', 'B', 'C', 'D'],
        correct_answer: 'A'
      },
      topic_name: 'Deep Learning (v2)',
      version_number: 2,
      is_new_version: true
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Store 3 response:', store3.data);
    
    // Test 4: Check all topics
    console.log('\n=== Test 4: Checking all topics ===');
    const getTopics = await axios.get('http://localhost:3000/api/lessons/user-topics', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Topics in database:');
    getTopics.data.forEach((topic, index) => {
      console.log(`${index + 1}. ${topic.topic} (${topic.category})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testVersioningSimple();
