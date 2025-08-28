const axios = require('axios');

// Direct test of versioning functionality
async function testDirectVersioning() {
  try {
    console.log('Testing direct versioning...');
    
    // Login
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'test@example.com',
      password: 'password'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    
    // Test 1: Generate "Neural Networks"
    console.log('\n=== Test 1: Generating "Neural Networks" ===');
    const generate1 = await axios.post('http://localhost:3000/api/lessons/generate', {
      category: 'Science',
      topic: 'Neural Networks',
      type: 'initial'
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Generate 1 response:', {
      topic_name: generate1.data.topic_name,
      version_number: generate1.data.version_number,
      is_existing: generate1.data.is_existing,
      message: generate1.data.message
    });
    
    // Test 2: Store the topic
    console.log('\n=== Test 2: Storing "Neural Networks" ===');
    const store1 = await axios.post('http://localhost:3000/api/lessons/store-topic', {
      category: 'Science',
      topic: 'Neural Networks',
      summary: generate1.data.summary,
      quiz: generate1.data.quiz,
      topic_name: generate1.data.topic_name,
      version_number: generate1.data.version_number,
      is_existing: generate1.data.is_existing,
      existing_topic_id: generate1.data.existing_topic_id
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Store 1 response:', store1.data);
    
    // Test 3: Generate "Neural Networks" again (should return existing)
    console.log('\n=== Test 3: Generating "Neural Networks" again ===');
    const generate2 = await axios.post('http://localhost:3000/api/lessons/generate', {
      category: 'Science',
      topic: 'Neural Networks',
      type: 'initial'
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Generate 2 response:', {
      topic_name: generate2.data.topic_name,
      version_number: generate2.data.version_number,
      is_existing: generate2.data.is_existing,
      message: generate2.data.message
    });
    
    // Test 4: Check database
    console.log('\n=== Test 4: Checking database ===');
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

testDirectVersioning();
