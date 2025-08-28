const { Pool } = require("pg");
require("dotenv").config();

async function testDB() {
  try {
    console.log('Testing database connection...');
    console.log('Environment variables:');
    console.log('PG_USER:', process.env.PG_USER);
    console.log('PG_HOST:', process.env.PG_HOST);
    console.log('PG_PORT:', process.env.PG_PORT);
    console.log('PG_DATABASE:', process.env.PG_DATABASE);
    console.log('PG_PASSWORD:', process.env.PG_PASSWORD ? '***' : 'undefined');
    
    const pool = new Pool({
      user: process.env.PG_USER,
      host: process.env.PG_HOST,
      database: process.env.PG_DATABASE,
      password: process.env.PG_PASSWORD,
      port: process.env.PG_PORT,
    });

    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful:', result.rows[0]);
    
    await pool.end();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
}

testDB();
