const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'learnflow',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'your_secure_password',
});

async function fixServerSchema() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Fixing server database schema...');
    
    // Begin transaction
    await client.query('BEGIN');
    
    // 1. Fix users table - remove username requirement and add missing columns
    console.log('👥 Fixing users table...');
    
    // First, check if there's a sequence for users
    const sequenceCheck = await client.query(`
      SELECT sequence_name FROM information_schema.sequences 
      WHERE sequence_schema = 'public' AND sequence_name LIKE '%users%'
    `);
    
    let sequenceName = 'users_id_seq';
    if (sequenceCheck.rows.length > 0) {
      sequenceName = sequenceCheck.rows[0].sequence_name;
    }
    
    // Check if username column exists and has NOT NULL constraint
    const usernameCheck = await client.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'username'
    `);
    
    if (usernameCheck.rows.length > 0) {
      // Username column exists, make it nullable
      await client.query(`
        ALTER TABLE users 
        ALTER COLUMN username DROP NOT NULL
      `);
      console.log('   ✅ Made username nullable');
      
      // Set a safer default value
      try {
        await client.query(`
          ALTER TABLE users 
          ALTER COLUMN username SET DEFAULT 'user_' || nextval('${sequenceName}')
        `);
        console.log('   ✅ Set username default value');
      } catch (defaultError) {
        console.log('   ⚠️ Could not set default value, but username is now nullable');
      }
    }
    
    // Check for any additional constraints on username that might be causing issues
    const usernameConstraints = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conrelid = 'users'::regclass 
      AND conname LIKE '%username%'
    `);
    
    if (usernameConstraints.rows.length > 0) {
      console.log('   🔍 Found username constraints:');
      for (const constraint of usernameConstraints.rows) {
        console.log(`      ${constraint.conname}: ${constraint.contype} - ${constraint.definition}`);
        
        // If it's a check constraint that might be too restrictive, consider dropping it
        if (constraint.contype === 'c' && constraint.definition.includes('username')) {
          console.log(`      ⚠️ Consider reviewing this constraint: ${constraint.definition}`);
        }
      }
    }
    
    // Check if updated_at column exists
    const updatedAtCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'updated_at'
    `);
    
    if (updatedAtCheck.rows.length === 0) {
      // Add updated_at column
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('   ✅ Added updated_at column');
    }
    
    // 2. Fix generated_topics table - add missing columns
    console.log('📚 Fixing generated_topics table...');
    
    // Check if title column exists
    const titleCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'generated_topics' AND column_name = 'title'
    `);
    
    if (titleCheck.rows.length === 0) {
      // Add title column (alias for topic)
      await client.query(`
        ALTER TABLE generated_topics 
        ADD COLUMN title TEXT
      `);
      console.log('   ✅ Added title column');
      
      // Update title to match topic
      await client.query(`
        UPDATE generated_topics 
        SET title = topic 
        WHERE title IS NULL
      `);
      console.log('   ✅ Updated title values from topic');
    }
    
    // Check if content column exists
    const contentCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'generated_topics' AND column_name = 'content'
    `);
    
    if (contentCheck.rows.length === 0) {
      // Add content column (alias for summary)
      await client.query(`
        ALTER TABLE generated_topics 
        ADD COLUMN content TEXT
      `);
      console.log('   ✅ Added content column');
      
      // Update content to match summary
      await client.query(`
        UPDATE generated_topics 
        SET content = summary 
        WHERE content IS NULL
      `);
      console.log('   ✅ Updated content values from summary');
    }
    
    // Check if updated_at column exists
    const topicsUpdatedAtCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'generated_topics' AND column_name = 'updated_at'
    `);
    
    if (topicsUpdatedAtCheck.rows.length === 0) {
      // Add updated_at column
      await client.query(`
        ALTER TABLE generated_topics 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('   ✅ Added updated_at column to generated_topics');
    }
    
    // 3. Fix content_verification_results table - add missing columns
    console.log('✅ Fixing content_verification_results table...');
    
    // Check if created_at column exists
    const verificationCreatedAtCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'content_verification_results' AND column_name = 'created_at'
    `);
    
    if (verificationCreatedAtCheck.rows.length === 0) {
      // Add created_at column
      await client.query(`
        ALTER TABLE content_verification_results 
        ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('   ✅ Added created_at column to content_verification_results');
    }
    
    // 4. Fix user_preferences table - add missing columns
    console.log('⚙️ Fixing user_preferences table...');
    
    // Check if topic_preferences column exists
    const topicPrefsCheck = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'user_preferences' AND column_name = 'topic_preferences'
    `);
    
    if (topicPrefsCheck.rows.length === 0) {
      // Add topic_preferences column
      await client.query(`
        ALTER TABLE user_preferences 
        ADD COLUMN topic_preferences JSONB DEFAULT '[]'::jsonb
      `);
      console.log('   ✅ Added topic_preferences column');
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('\n✅ Schema fixes completed successfully!');
    
    // Show final table structure
    console.log('\n📋 Final table structures:');
    
    const tables = ['users', 'generated_topics', 'content_verification_results', 'user_preferences'];
    
    for (const table of tables) {
      console.log(`\n🔍 ${table} table:`);
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [table]);
      
      for (const column of columns.rows) {
        const nullable = column.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultValue = column.column_default ? ` DEFAULT ${column.column_default}` : '';
        console.log(`   ${column.column_name}: ${column.data_type} ${nullable}${defaultValue}`);
      }
    }
    
    // Show any remaining constraints on users table
    console.log('\n🔒 Users table constraints:');
    const finalConstraints = await client.query(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conrelid = 'users'::regclass
    `);
    
    if (finalConstraints.rows.length > 0) {
      finalConstraints.rows.forEach(con => {
        console.log(`   ${con.conname}: ${con.contype} - ${con.definition}`);
      });
    } else {
      console.log('   No constraints found');
    }
    
  } catch (error) {
    console.error('❌ Error fixing schema:', error);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

fixServerSchema().catch(console.error);

