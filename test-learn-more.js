const axios = require('axios');
require('dotenv').config();

async function testLearnMore() {
  try {
    console.log('Testing learn more endpoint...');
    
    // First, let's get a valid token by logging in
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'test@example.com',
      password: 'password'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Got token:', token ? 'Valid token' : 'No token');
    
    // Get a recent topic ID
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.PG_HOST || 'localhost',
      port: process.env.PG_PORT || 5433,
      database: process.env.PG_DATABASE || 'microapp',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || 'Emmakwesi2',
    });
    
    const client = await pool.connect();
    const topicResult = await client.query(
      'SELECT id, topic, category, summary FROM generated_topics ORDER BY created_at DESC LIMIT 1'
    );
    
    if (topicResult.rows.length === 0) {
      console.log('❌ No topics found in database');
      return;
    }
    
    const topic = topicResult.rows[0];
    console.log('📚 Using topic:', topic.topic, 'ID:', topic.id);
    
    // Test the learn more endpoint
    const learnMoreResponse = await axios.post(
      'http://localhost:3000/api/lessons/learn-more',
      {
        topic: topic.topic,
        category: topic.category,
        currentContent: topic.summary,
        topicId: topic.id
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Learn more response:', {
      content: learnMoreResponse.data.content.substring(0, 100) + '...',
      fromCache: learnMoreResponse.data.fromCache,
      createdAt: learnMoreResponse.data.createdAt
    });
    
    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error testing learn more:', error.response?.data || error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Headers:', error.response.headers);
    }
  }
}

testLearnMore();
