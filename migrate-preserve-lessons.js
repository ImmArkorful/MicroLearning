const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
  port: process.env.PG_PORT || process.env.DB_PORT || 5432,
  database: process.env.PG_DATABASE || process.env.DB_NAME || 'learnflow',
  user: process.env.PG_USER || process.env.DB_USER || 'admin',
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
});

async function migratePreserveLessons() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Migrating to preserve lessons when users are deleted...');
    
    await client.query('BEGIN');
    
    // Step 1: Make user_id nullable in generated_topics if it's not already
    console.log('📝 Step 1: Making user_id nullable in generated_topics...');
    try {
      await client.query(`
        ALTER TABLE generated_topics 
        ALTER COLUMN user_id DROP NOT NULL
      `);
      console.log('   ✅ user_id is now nullable');
    } catch (error) {
      if (error.message.includes('does not exist') || error.message.includes('column "user_id" is not null')) {
        console.log('   ⚠️ user_id might already be nullable or constraint issue:', error.message);
      } else {
        throw error;
      }
    }
    
    // Step 2: Drop the existing foreign key constraint
    console.log('📝 Step 2: Dropping existing foreign key constraint...');
    try {
      // Find the constraint name
      const constraintResult = await client.query(`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'generated_topics'::regclass
        AND confrelid = 'users'::regclass
        AND contype = 'f'
      `);
      
      if (constraintResult.rows.length > 0) {
        const constraintName = constraintResult.rows[0].conname;
        await client.query(`
          ALTER TABLE generated_topics 
          DROP CONSTRAINT ${constraintName}
        `);
        console.log(`   ✅ Dropped constraint: ${constraintName}`);
      } else {
        console.log('   ⚠️ No foreign key constraint found (might already be dropped)');
      }
    } catch (error) {
      console.log('   ⚠️ Error dropping constraint (might not exist):', error.message);
    }
    
    // Step 3: Add new foreign key constraint with SET NULL
    console.log('📝 Step 3: Adding new foreign key constraint with SET NULL...');
    try {
      await client.query(`
        ALTER TABLE generated_topics 
        ADD CONSTRAINT generated_topics_user_id_fkey 
        FOREIGN KEY (user_id) 
        REFERENCES users(id) 
        ON DELETE SET NULL
      `);
      console.log('   ✅ Added new constraint with SET NULL');
    } catch (error) {
      if (error.message.includes('already exists')) {
        console.log('   ⚠️ Constraint might already exist, checking...');
        // Try to verify it's SET NULL
        const checkResult = await client.query(`
          SELECT conname, pg_get_constraintdef(oid) as definition
          FROM pg_constraint
          WHERE conrelid = 'generated_topics'::regclass
          AND confrelid = 'users'::regclass
          AND contype = 'f'
        `);
        if (checkResult.rows.length > 0) {
          console.log(`   ✅ Constraint exists: ${checkResult.rows[0].definition}`);
        }
      } else {
        throw error;
      }
    }
    
    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');
    console.log('📌 Lessons will now be preserved when users are deleted (user_id will be set to NULL)');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error during migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migratePreserveLessons().catch(console.error);
