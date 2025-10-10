const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

async function checkTable() {
  try {
    console.log('🔍 Checking if user_preferences table exists...');
    
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'user_preferences'
      );
    `);
    
    const tableExists = tableCheck.rows[0].exists;
    console.log('📊 Table exists:', tableExists);
    
    if (tableExists) {
      // Get table structure
      const structure = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'user_preferences'
        ORDER BY ordinal_position;
      `);
      
      console.log('\n📋 Table structure:');
      console.table(structure.rows);
      
      // Get sample data
      const sampleData = await pool.query(`
        SELECT * FROM user_preferences LIMIT 5;
      `);
      
      console.log('\n📄 Sample data:');
      console.table(sampleData.rows);
    } else {
      console.log('❌ Table does not exist! Need to create it.');
      console.log('\n📝 Creating user_preferences table...');
      
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          preference_key VARCHAR(255) NOT NULL,
          preference_value TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      console.log('✅ Table created successfully!');
      
      // Create index for faster lookups
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
        ON user_preferences(user_id);
      `);
      
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_user_preferences_key 
        ON user_preferences(user_id, preference_key);
      `);
      
      console.log('✅ Indexes created successfully!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

checkTable();
