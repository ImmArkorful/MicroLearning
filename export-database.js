const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5433,
  database: process.env.DB_NAME || 'microapp',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Emmakwesi2',
});

async function exportDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Exporting database...');
    
    // Export schema
    console.log('📋 Exporting schema...');
    const schemaResult = await client.query(`
      SELECT 
        table_name,
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      ORDER BY table_name, ordinal_position
    `);
    
    // Export categories
    console.log('🏷️ Exporting categories...');
    const categoriesResult = await client.query(`
      SELECT * FROM categories WHERE is_active = true ORDER BY sort_order, name
    `);
    
    // Export generated topics
    console.log('📚 Exporting generated topics...');
    const topicsResult = await client.query(`
      SELECT * FROM generated_topics ORDER BY created_at
    `);
    
    // Export content verification results
    console.log('✅ Exporting verification results...');
    const verificationResult = await client.query(`
      SELECT * FROM content_verification_results ORDER BY verification_date
    `);
    
    // Export users (without sensitive data)
    console.log('👥 Exporting users...');
    const usersResult = await client.query(`
      SELECT id, email, created_at FROM users ORDER BY created_at
    `);
    
    // Export user preferences
    console.log('⚙️ Exporting user preferences...');
    const preferencesResult = await client.query(`
      SELECT * FROM user_preferences ORDER BY created_at
    `);
    
    // Export user activities
    console.log('📝 Exporting user activities...');
    const activitiesResult = await client.query(`
      SELECT * FROM user_activities ORDER BY created_at
    `);
    
    // Export random quizzes
    console.log('🎯 Exporting random quizzes...');
    const quizzesResult = await client.query(`
      SELECT * FROM random_quizzes WHERE is_active = true ORDER BY created_at
    `);
    
    // Create export object
    const exportData = {
      exportDate: new Date().toISOString(),
      database: process.env.DB_NAME || 'learnflow',
      schema: schemaResult.rows,
      categories: categoriesResult.rows,
      generatedTopics: topicsResult.rows,
      verificationResults: verificationResult.rows,
      users: usersResult.rows,
      userPreferences: preferencesResult.rows,
      userActivities: activitiesResult.rows,
      randomQuizzes: quizzesResult.rows,
      tableCounts: {
        categories: categoriesResult.rows.length,
        topics: topicsResult.rows.length,
        verifications: verificationResult.rows.length,
        users: usersResult.rows.length,
        preferences: preferencesResult.rows.length,
        activities: activitiesResult.rows.length,
        quizzes: quizzesResult.rows.length
      }
    };
    
    // Write to file
    const fs = require('fs');
    const exportPath = './database-export.json';
    fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
    
    console.log('✅ Database export completed!');
    console.log(`📁 Export saved to: ${exportPath}`);
    console.log('\n📊 Export Summary:');
    console.log(`   Categories: ${exportData.tableCounts.categories}`);
    console.log(`   Topics: ${exportData.tableCounts.topics}`);
    console.log(`   Verifications: ${exportData.tableCounts.verifications}`);
    console.log(`   Users: ${exportData.tableCounts.users}`);
    console.log(`   Preferences: ${exportData.tableCounts.preferences}`);
    console.log(`   Activities: ${exportData.tableCounts.activities}`);
    console.log(`   Quizzes: ${exportData.tableCounts.quizzes}`);
    
  } catch (error) {
    console.error('❌ Error exporting database:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

exportDatabase().catch(console.error);
