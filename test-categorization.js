const axios = require('axios');

// Test automatic categorization
async function testCategorization() {
  try {
    console.log('Testing automatic categorization...');
    
    // Login
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'test@example.com',
      password: 'password'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    
    // Test different topics to see how they get categorized
    const testTopics = [
      'Quantum Physics',
      'Shakespeare',
      'Python Programming',
      'World War II',
      'Renaissance Art',
      'Calculus',
      'Stock Market',
      'Human Psychology',
      'Climate Change',
      'Ancient Rome'
    ];
    
    for (const topic of testTopics) {
      console.log(`\n=== Testing categorization for: "${topic}" ===`);
      
      try {
        const response = await axios.post('http://localhost:3000/api/lessons/generate', {
          category: 'General', // This will be overridden by AI
          topic: topic,
          type: 'initial'
        }, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log(`✅ AI categorized "${topic}" as: ${response.data.category}`);
        console.log(`   Topic name: ${response.data.topic_name}`);
        console.log(`   Version: ${response.data.version_number}`);
        console.log(`   Message: ${response.data.message}`);
        
        // Store the topic
        const storeResponse = await axios.post('http://localhost:3000/api/lessons/store-topic', {
          category: response.data.category,
          topic: topic,
          summary: response.data.summary,
          quiz: response.data.quiz,
          topic_name: response.data.topic_name,
          version_number: response.data.version_number,
          is_existing: response.data.is_existing,
          existing_topic_id: response.data.existing_topic_id
        }, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        console.log(`   Stored with ID: ${storeResponse.data.topic_id}`);
        
      } catch (error) {
        console.error(`❌ Error with "${topic}":`, error.response?.data?.error || error.message);
      }
    }
    
    // Check all topics by category
    console.log('\n=== Checking topics by category ===');
    const getTopics = await axios.get('http://localhost:3000/api/lessons/user-topics', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    // Group topics by category
    const topicsByCategory = {};
    getTopics.data.forEach(topic => {
      if (!topicsByCategory[topic.category]) {
        topicsByCategory[topic.category] = [];
      }
      topicsByCategory[topic.category].push(topic.topic);
    });
    
    console.log('Topics organized by category:');
    Object.keys(topicsByCategory).sort().forEach(category => {
      console.log(`\n${category}:`);
      topicsByCategory[category].forEach(topic => {
        console.log(`  - ${topic}`);
      });
    });
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testCategorization();
