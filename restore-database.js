const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'learnflow',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'your_secure_password',
});

async function restoreDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Restoring database...');
    
    // Read export file
    const exportPath = './database-export.json';
    if (!fs.existsSync(exportPath)) {
      throw new Error(`Export file not found: ${exportPath}`);
    }
    
    const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
    console.log(`📁 Reading export from: ${exportPath}`);
    console.log(`📅 Export date: ${exportData.exportDate}`);
    console.log(`🗄️ Database: ${exportData.database}`);
    
    // Begin transaction
    await client.query('BEGIN');
    
    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🧹 Clearing existing data...');
    await client.query('TRUNCATE TABLE user_activities CASCADE');
    await client.query('TRUNCATE TABLE user_preferences CASCADE');
    await client.query('TRUNCATE TABLE content_verification_results CASCADE');
    await client.query('TRUNCATE TABLE generated_topics CASCADE');
    await client.query('TRUNCATE TABLE random_quizzes CASCADE');
    await client.query('TRUNCATE TABLE categories CASCADE');
    await client.query('TRUNCATE TABLE users CASCADE');
    
    // Restore categories
    console.log('🏷️ Restoring categories...');
    for (const category of exportData.categories) {
      await client.query(`
        INSERT INTO categories (id, name, description, icon, color, sort_order, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          icon = EXCLUDED.icon,
          color = EXCLUDED.color,
          sort_order = EXCLUDED.sort_order,
          is_active = EXCLUDED.is_active,
          updated_at = CURRENT_TIMESTAMP
      `, [
        category.id, category.name, category.description, category.icon, 
        category.color, category.sort_order, category.is_active, 
        category.created_at, category.updated_at
      ]);
    }
    
    // Restore users (with placeholder password hashes for security)
    console.log('👥 Restoring users...');
    for (const user of exportData.users) {
      // Create a placeholder password hash that users will need to reset
      const placeholderPasswordHash = '$2b$10$placeholder.hash.for.security.reset';
      
      await client.query(`
        INSERT INTO users (id, email, password_hash, created_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          created_at = CURRENT_TIMESTAMP
      `, [user.id, user.email, placeholderPasswordHash, user.created_at]);
    }
    
    // Restore generated topics
    console.log('📚 Restoring generated topics...');
    for (const topic of exportData.generatedTopics) {
      await client.query(`
        INSERT INTO generated_topics (id, user_id, category, topic, quiz_data, summary, key_points, reading_time_minutes, quiz_count, is_public, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          category = EXCLUDED.category,
          topic = EXCLUDED.topic,
          quiz_data = EXCLUDED.quiz_data,
          summary = EXCLUDED.summary,
          key_points = EXCLUDED.key_points,
          reading_time_minutes = EXCLUDED.reading_time_minutes,
          quiz_count = EXCLUDED.quiz_count,
          is_public = EXCLUDED.is_public,
          created_at = CURRENT_TIMESTAMP
      `, [
        topic.id, topic.user_id, topic.category, topic.topic, topic.quiz_data,
        topic.summary, topic.key_points, topic.reading_time_minutes || 5, topic.quiz_count || 1, topic.is_public || false, topic.created_at
      ]);
    }
    
    // Restore content verification results
    console.log('✅ Restoring verification results...');
    for (const verification of exportData.verificationResults) {
      await client.query(`
        INSERT INTO content_verification_results (id, topic_id, user_id, factual_accuracy_score, factual_accuracy_feedback, factual_accuracy_model, educational_value_score, educational_value_feedback, educational_value_model, clarity_engagement_score, clarity_engagement_feedback, clarity_engagement_model, overall_quality_score, overall_quality_feedback, overall_quality_model, meets_quality_standards, verification_timestamp, completeness_score, factual_accuracy_explanation, completeness_explanation, educational_value_explanation, overall_quality_explanation, potential_issues, recommendations, models_used, verification_data, verification_date)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        ON CONFLICT (id) DO UPDATE SET
          factual_accuracy_score = EXCLUDED.factual_accuracy_score,
          factual_accuracy_feedback = EXCLUDED.factual_accuracy_feedback,
          factual_accuracy_model = EXCLUDED.factual_accuracy_model,
          educational_value_score = EXCLUDED.educational_value_score,
          educational_value_feedback = EXCLUDED.educational_value_feedback,
          educational_value_model = EXCLUDED.educational_value_model,
          clarity_engagement_score = EXCLUDED.clarity_engagement_score,
          clarity_engagement_feedback = EXCLUDED.clarity_engagement_feedback,
          clarity_engagement_model = EXCLUDED.clarity_engagement_model,
          overall_quality_score = EXCLUDED.overall_quality_score,
          overall_quality_feedback = EXCLUDED.overall_quality_feedback,
          overall_quality_model = EXCLUDED.overall_quality_model,
          meets_quality_standards = EXCLUDED.meets_quality_standards,
          verification_timestamp = CURRENT_TIMESTAMP,
          completeness_score = EXCLUDED.completeness_score,
          factual_accuracy_explanation = EXCLUDED.factual_accuracy_explanation,
          completeness_explanation = EXCLUDED.completeness_explanation,
          educational_value_explanation = EXCLUDED.educational_value_explanation,
          overall_quality_explanation = EXCLUDED.overall_quality_explanation,
          potential_issues = EXCLUDED.potential_issues,
          recommendations = EXCLUDED.recommendations,
          models_used = EXCLUDED.models_used,
          verification_data = EXCLUDED.verification_data,
          verification_date = CURRENT_TIMESTAMP
      `, [
        verification.id, verification.topic_id, verification.user_id, verification.factual_accuracy_score,
        verification.factual_accuracy_feedback, verification.factual_accuracy_model, verification.educational_value_score,
        verification.educational_value_feedback, verification.educational_value_model, verification.clarity_engagement_score,
        verification.clarity_engagement_feedback, verification.clarity_engagement_model, verification.overall_quality_score,
        verification.overall_quality_feedback, verification.overall_quality_model, verification.meets_quality_standards,
        verification.verification_timestamp, verification.completeness_score, verification.factual_accuracy_explanation,
        verification.completeness_explanation, verification.educational_value_explanation, verification.overall_quality_explanation,
        verification.potential_issues, verification.recommendations, verification.models_used, verification.verification_data,
        verification.verification_date
      ]);
    }
    
    // Restore user preferences
    console.log('⚙️ Restoring user preferences...');
    for (const preference of exportData.userPreferences) {
      await client.query(`
        INSERT INTO user_preferences (id, user_id, preference_key, preference_value, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET
          preference_key = EXCLUDED.preference_key,
          preference_value = EXCLUDED.preference_value,
          updated_at = CURRENT_TIMESTAMP
      `, [preference.id, preference.user_id, preference.preference_key, preference.preference_value, preference.created_at, preference.updated_at]);
    }
    
    // Restore user activities
    console.log('📝 Restoring user activities...');
    for (const activity of exportData.userActivities) {
      await client.query(`
        INSERT INTO user_activities (id, user_id, activity_type, activity_data, related_id, related_type, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          activity_type = EXCLUDED.activity_type,
          activity_data = EXCLUDED.activity_data,
          related_id = EXCLUDED.related_id,
          related_type = EXCLUDED.related_type,
          created_at = CURRENT_TIMESTAMP
      `, [
        activity.id, activity.user_id, activity.activity_type, activity.activity_data,
        activity.related_id, activity.related_type, activity.created_at
      ]);
    }
    
    // Restore random quizzes
    console.log('🎯 Restoring random quizzes...');
    for (const quiz of exportData.randomQuizzes) {
      await client.query(`
        INSERT INTO random_quizzes (id, question, options, correct_answer, explanation, category, difficulty, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          question = EXCLUDED.question,
          options = EXCLUDED.options,
          correct_answer = EXCLUDED.correct_answer,
          explanation = EXCLUDED.explanation,
          category = EXCLUDED.category,
          difficulty = EXCLUDED.difficulty,
          is_active = EXCLUDED.is_active,
          created_at = CURRENT_TIMESTAMP
      `, [
        quiz.id, quiz.question, quiz.options, quiz.correct_answer, quiz.explanation,
        quiz.category, quiz.difficulty, quiz.is_active, quiz.created_at
      ]);
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('✅ Database restore completed successfully!');
    console.log('\n📊 Restored Data Summary:');
    console.log(`   Categories: ${exportData.tableCounts.categories}`);
    console.log(`   Topics: ${exportData.tableCounts.topics}`);
    console.log(`   Verifications: ${exportData.tableCounts.verifications}`);
    console.log(`   Users: ${exportData.tableCounts.users}`);
    console.log(`   Preferences: ${exportData.tableCounts.preferences}`);
    console.log(`   Activities: ${exportData.tableCounts.activities}`);
    console.log(`   Quizzes: ${exportData.tableCounts.quizzes}`);
    
  } catch (error) {
    console.error('❌ Error restoring database:', error);
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await pool.end();
  }
}

restoreDatabase().catch(console.error);
