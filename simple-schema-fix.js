const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'learnflow',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'your_secure_password',
});

async function simpleSchemaFix() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Simple schema fix for username issue...');
    
    // Check current users table structure
    console.log('\n📋 Current users table structure:');
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    for (const column of columns.rows) {
      const nullable = column.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultValue = column.column_default ? ` DEFAULT ${column.column_default}` : '';
      console.log(`   ${column.column_name}: ${column.data_type} ${nullable}${defaultValue}`);
    }
    
    // Fix the username issue
    console.log('\n🔧 Fixing username constraint...');
    
    try {
      // Make username nullable and add default value
      await client.query(`
        ALTER TABLE users 
        ALTER COLUMN username DROP NOT NULL
      `);
      console.log('✅ Made username nullable');
      
      // Add default value for username
      await client.query(`
        ALTER TABLE users 
        ALTER COLUMN username SET DEFAULT 'user_' || nextval('users_id_seq')
      `);
      console.log('✅ Added default username value');
      
    } catch (error) {
      console.log('⚠️ Username fix error (might already be fixed):', error.message);
    }
    
    // Test registration now
    console.log('\n🧪 Testing registration...');
    const testResponse = await client.query(`
      INSERT INTO users (email, password_hash) 
      VALUES ($1, $2) 
      RETURNING id, email, created_at
    `, ['test@example.com', '$2b$10$test.hash']);
    
    console.log('✅ Test user created:', testResponse.rows[0]);
    
    // Clean up test user
    await client.query('DELETE FROM users WHERE email = $1', ['test@example.com']);
    console.log('🧹 Test user cleaned up');
    
    console.log('\n🎉 Schema fix completed! Registration should work now.');
    
  } catch (error) {
    console.error('❌ Error in schema fix:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

simpleSchemaFix().catch(console.error);

