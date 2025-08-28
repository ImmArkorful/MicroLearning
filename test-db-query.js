const { Pool } = require('pg');
require('dotenv').config();

async function testDbQuery() {
  const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5433,
    database: process.env.PG_DATABASE || 'microapp',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'Emmakwesi2',
  });

  try {
    const client = await pool.connect();
    
    console.log('Testing database query...');
    
    // Test the exact query from the learn more endpoint
    const userId = 3;
    const topicId = 63;
    
    console.log(`🔍 Querying for user_id = ${userId}, topic_id = ${topicId}`);
    
    const result = await client.query(
      `SELECT content, created_at 
       FROM topic_interactions 
       WHERE user_id = $1 AND topic_id = $2 AND interaction_type = 'learn_more'
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId, topicId]
    );
    
    console.log(`📊 Found ${result.rows.length} rows`);
    
    if (result.rows.length > 0) {
      console.log('✅ Found existing content:');
      console.log('Content type:', typeof result.rows[0].content);
      console.log('Content:', JSON.stringify(result.rows[0].content, null, 2));
      console.log('Created at:', result.rows[0].created_at);
      
      // Test accessing the content field
      try {
        const content = result.rows[0].content;
        console.log('✅ Content access successful');
        console.log('Content field:', content.content.substring(0, 100) + '...');
      } catch (accessError) {
        console.error('❌ Content access failed:', accessError);
      }
    } else {
      console.log('❌ No content found');
    }
    
    client.release();
    await pool.end();
    
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

testDbQuery();
