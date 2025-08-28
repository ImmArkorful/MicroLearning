const db = require('./db');

async function createAudioCacheTable() {
  console.log('🗄️ Creating audio cache metadata table...\n');

  try {
    // Create the audio cache metadata table
    await db.query(`
      CREATE TABLE IF NOT EXISTS audio_cache_metadata (
        id SERIAL PRIMARY KEY,
        cache_key TEXT UNIQUE NOT NULL,
        file_path TEXT NOT NULL,
        text_hash TEXT NOT NULL,
        voice TEXT NOT NULL,
        language TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        api_calls_saved INTEGER DEFAULT 0
      )
    `);

    // Create index for faster lookups
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_audio_cache_key ON audio_cache_metadata(cache_key)
    `);

    // Create index for cleanup queries
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_audio_cache_created ON audio_cache_metadata(created_at)
    `);

    console.log('✅ Audio cache metadata table created successfully');
    console.log('✅ Indexes created for optimal performance');

    // Show table structure
    const tableInfo = await db.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'audio_cache_metadata'
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Table structure:');
    tableInfo.rows.forEach(column => {
      console.log(`   - ${column.column_name}: ${column.data_type} ${column.is_nullable === 'NO' ? 'NOT NULL' : ''} ${column.column_default ? `DEFAULT ${column.column_default}` : ''}`);
    });

  } catch (error) {
    console.error('❌ Error creating audio cache table:', error);
  }
}

createAudioCacheTable();
