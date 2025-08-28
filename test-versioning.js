const axios = require('axios');

// Test the topic versioning functionality
async function testVersioning() {
  try {
    console.log('Testing topic versioning...');
    
    // First, login to get a token
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'test@example.com',
      password: 'password'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful, got token');
    
    // Test 1: Create a new topic
    console.log('\n=== Test 1: Creating new topic "Quantum Physics" ===');
    const generateResponse1 = await axios.post('http://localhost:3000/api/lessons/generate', {
      category: 'Science',
      topic: 'Quantum Physics',
      type: 'initial'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ First generation response:', {
      topic_name: generateResponse1.data.topic_name,
      version_number: generateResponse1.data.version_number,
      is_new_version: generateResponse1.data.is_new_version,
      message: generateResponse1.data.message
    });
    
    // Test 2: Try to create the same topic again (should return existing)
    console.log('\n=== Test 2: Creating same topic again (should return existing) ===');
    const generateResponse2 = await axios.post('http://localhost:3000/api/lessons/generate', {
      category: 'Science',
      topic: 'Quantum Physics',
      type: 'initial'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Second generation response:', {
      is_existing: generateResponse2.data.is_existing,
      existing_topic_id: generateResponse2.data.existing_topic_id,
      message: generateResponse2.data.message
    });
    
    // Test 3: Create a similar topic (should create version 2)
    console.log('\n=== Test 3: Creating similar topic (should create version 2) ===');
    const generateResponse3 = await axios.post('http://localhost:3000/api/lessons/generate', {
      category: 'Science',
      topic: 'Quantum Physics Basics',
      type: 'initial'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Third generation response:', {
      topic_name: generateResponse3.data.topic_name,
      version_number: generateResponse3.data.version_number,
      is_new_version: generateResponse3.data.is_new_version,
      message: generateResponse3.data.message
    });
    
    // Test 4: Check all topics
    console.log('\n=== Test 4: Checking all topics ===');
    const getTopicsResponse = await axios.get('http://localhost:3000/api/lessons/user-topics', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ All topics:');
    getTopicsResponse.data.forEach((topic, index) => {
      console.log(`${index + 1}. ${topic.topic} (${topic.category})`);
    });
    
  } catch (error) {
    console.error('❌ Error testing versioning:', error.response?.data || error.message);
  }
}

testVersioning();
