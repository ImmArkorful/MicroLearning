const axios = require('axios');

// Simple test for versioning
async function testSimpleVersioning() {
  try {
    console.log('Testing simple versioning...');
    
    // Login
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'test@example.com',
      password: 'password'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    
    // Test 1: Create "Machine Learning" (should be new)
    console.log('\n=== Test 1: Creating "Machine Learning" ===');
    const response1 = await axios.post('http://localhost:3000/api/lessons/generate', {
      category: 'Science',
      topic: 'Machine Learning',
      type: 'initial'
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Response 1:', {
      topic_name: response1.data.topic_name,
      version_number: response1.data.version_number,
      is_existing: response1.data.is_existing,
      message: response1.data.message
    });
    
    // Test 2: Create "Machine Learning" again (should return existing)
    console.log('\n=== Test 2: Creating "Machine Learning" again ===');
    const response2 = await axios.post('http://localhost:3000/api/lessons/generate', {
      category: 'Science',
      topic: 'Machine Learning',
      type: 'initial'
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Response 2:', {
      topic_name: response2.data.topic_name,
      version_number: response2.data.version_number,
      is_existing: response2.data.is_existing,
      message: response2.data.message
    });
    
    // Test 3: Create "Machine Learning Basics" (should create version 2)
    console.log('\n=== Test 3: Creating "Machine Learning Basics" ===');
    const response3 = await axios.post('http://localhost:3000/api/lessons/generate', {
      category: 'Science',
      topic: 'Machine Learning Basics',
      type: 'initial'
    }, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Response 3:', {
      topic_name: response3.data.topic_name,
      version_number: response3.data.version_number,
      is_existing: response3.data.is_existing,
      message: response3.data.message
    });
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testSimpleVersioning();
