const { Pool } = require('pg');
require('dotenv').config();

const appPool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5433,
  database: process.env.PG_DATABASE || 'microapp',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'Emmakwesi2',
});

async function setupDatabase() {
  try {
    console.log('Connecting to database...');
    const client = await appPool.connect();
    
    console.log('Creating tables...');

    // Users table
    const usersTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(usersTableQuery);
    console.log('✅ Users table created/verified');

    // Lessons table
    const lessonsTableQuery = `
      CREATE TABLE IF NOT EXISTS lessons (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        created_by INT REFERENCES users(id) ON DELETE CASCADE,
        current_version_id INT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(lessonsTableQuery);
    console.log('✅ Lessons table created/verified');

    // Lesson versions table
    const lessonVersionsTableQuery = `
      CREATE TABLE IF NOT EXISTS lesson_versions (
        id SERIAL PRIMARY KEY,
        lesson_id INT REFERENCES lessons(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        quiz_data JSONB,
        audio_url VARCHAR(255),
        version_number INT NOT NULL,
        created_by INT REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'draft',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(lessonVersionsTableQuery);
    console.log('✅ Lesson versions table created/verified');

    // Quiz results table
    const quizResultsTableQuery = `
      CREATE TABLE IF NOT EXISTS quiz_results (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INT REFERENCES lessons(id) ON DELETE CASCADE,
        quiz_data JSONB NOT NULL,
        user_answer VARCHAR(255) NOT NULL,
        is_correct BOOLEAN NOT NULL,
        score INT,
        completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(quizResultsTableQuery);
    console.log('✅ Quiz results table created/verified');

    // Generated topics table
    const generatedTopicsTableQuery = `
      CREATE TABLE IF NOT EXISTS generated_topics (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        category VARCHAR(255) NOT NULL,
        topic TEXT NOT NULL,
        summary TEXT NOT NULL,
        quiz_data JSONB NOT NULL,
        reading_time_minutes INT DEFAULT 5,
        key_points JSONB DEFAULT '[]',
        quiz_count INT DEFAULT 1,
        is_public BOOLEAN DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(generatedTopicsTableQuery);
    console.log('✅ Generated topics table created/verified');

    // Topic interactions table (NEW)
    const topicInteractionsTableQuery = `
      CREATE TABLE IF NOT EXISTS topic_interactions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        topic_id INT REFERENCES generated_topics(id) ON DELETE CASCADE,
        interaction_type VARCHAR(50) NOT NULL, -- 'learn_more', 'question', 'quiz'
        content JSONB NOT NULL, -- Stores the response content
        metadata JSONB DEFAULT '{}', -- Additional data like question asked, quiz score, etc.
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(topicInteractionsTableQuery);
    console.log('✅ Topic interactions table created/verified');

    // User lessons table (for favorites, progress, etc.)
    const userLessonsTableQuery = `
      CREATE TABLE IF NOT EXISTS user_lessons (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INT REFERENCES lessons(id) ON DELETE CASCADE,
        is_favorite BOOLEAN DEFAULT FALSE,
        progress_percentage INT DEFAULT 0,
        last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, lesson_id)
      );
    `;
    await client.query(userLessonsTableQuery);
    console.log('✅ User lessons table created/verified');

    // Audio cache metadata table (for TTS caching)
    const audioCacheMetadataTableQuery = `
      CREATE TABLE IF NOT EXISTS audio_cache_metadata (
        id SERIAL PRIMARY KEY,
        text_hash VARCHAR(255) UNIQUE NOT NULL,
        audio_file_path VARCHAR(500) NOT NULL,
        voice_settings JSONB NOT NULL,
        file_size BIGINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        access_count INT DEFAULT 0
      );
    `;
    await client.query(audioCacheMetadataTableQuery);
    console.log('✅ Audio cache metadata table created/verified');

    // User favorites table
    const userFavoritesTableQuery = `
      CREATE TABLE IF NOT EXISTS user_favorites (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        topic_id INT REFERENCES generated_topics(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, topic_id)
      );
    `;
    await client.query(userFavoritesTableQuery);
    console.log('✅ User favorites table created/verified');

    // User library table
    const userLibraryTableQuery = `
      CREATE TABLE IF NOT EXISTS user_library (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        topic_id INT REFERENCES generated_topics(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, topic_id)
      );
    `;
    await client.query(userLibraryTableQuery);
    console.log('✅ User library table created/verified');

    // Content verification results table
    const verificationResultsTableQuery = `
      CREATE TABLE IF NOT EXISTS content_verification_results (
        id SERIAL PRIMARY KEY,
        topic_id INT REFERENCES generated_topics(id) ON DELETE CASCADE,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        factual_accuracy_score DECIMAL(3,1),
        factual_accuracy_feedback TEXT,
        factual_accuracy_model VARCHAR(100),
        educational_value_score DECIMAL(3,1),
        educational_value_feedback TEXT,
        educational_value_model VARCHAR(100),
        clarity_engagement_score DECIMAL(3,1),
        clarity_engagement_feedback TEXT,
        clarity_engagement_model VARCHAR(100),
        overall_quality_score DECIMAL(3,1),
        overall_quality_feedback TEXT,
        overall_quality_model VARCHAR(100),
        meets_quality_standards BOOLEAN DEFAULT false,
        verification_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(verificationResultsTableQuery);
    console.log('✅ Content verification results table created/verified');

    // Random quizzes table
    const randomQuizzesTableQuery = `
      CREATE TABLE IF NOT EXISTS random_quizzes (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_answer VARCHAR(255) NOT NULL,
        explanation TEXT,
        category VARCHAR(100),
        difficulty VARCHAR(20) DEFAULT 'medium',
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(randomQuizzesTableQuery);
    console.log('✅ Random quizzes table created/verified');

    // User quiz attempts table
    const userQuizAttemptsTableQuery = `
      CREATE TABLE IF NOT EXISTS user_quiz_attempts (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        quiz_id INT REFERENCES random_quizzes(id) ON DELETE CASCADE,
        selected_answer VARCHAR(255) NOT NULL,
        is_correct BOOLEAN NOT NULL,
        attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, quiz_id)
      );
    `;
    await client.query(userQuizAttemptsTableQuery);
    console.log('✅ User quiz attempts table created/verified');

    // Quiz generation history table
    const quizGenerationHistoryTableQuery = `
      CREATE TABLE IF NOT EXISTS quiz_generation_history (
        id SERIAL PRIMARY KEY,
        batch_id VARCHAR(255) NOT NULL,
        quiz_count INT NOT NULL,
        categories JSONB,
        generation_status VARCHAR(50) DEFAULT 'completed',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(quizGenerationHistoryTableQuery);
    console.log('✅ Quiz generation history table created/verified');

    // User activities table
    const userActivitiesTableQuery = `
      CREATE TABLE IF NOT EXISTS user_activities (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL,
        activity_data JSONB,
        related_id BIGINT,
        related_type VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(userActivitiesTableQuery);
    console.log('✅ User activities table created/verified');

    // User preferences table
    const userPreferencesTableQuery = `
      CREATE TABLE IF NOT EXISTS user_preferences (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        preference_key VARCHAR(100) NOT NULL,
        preference_value TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, preference_key)
      );
    `;
    await client.query(userPreferencesTableQuery);
    console.log('✅ User preferences table created/verified');

    // User learning history table
    const userLearningHistoryTableQuery = `
      CREATE TABLE IF NOT EXISTS user_learning_history (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        topic_id INT REFERENCES generated_topics(id) ON DELETE CASCADE,
        learning_session_id VARCHAR(255),
        start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP WITH TIME ZONE,
        time_spent_seconds INT DEFAULT 0,
        completion_percentage DECIMAL(5,2) DEFAULT 0,
        quiz_taken BOOLEAN DEFAULT false,
        quiz_score DECIMAL(5,2),
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(userLearningHistoryTableQuery);
    console.log('✅ User learning history table created/verified');

    // Topic privacy management table
    const topicPrivacyTableQuery = `
      CREATE TABLE IF NOT EXISTS topic_privacy_settings (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        topic_id INT REFERENCES generated_topics(id) ON DELETE CASCADE,
        is_private BOOLEAN DEFAULT false,
        privacy_reason VARCHAR(255),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, topic_id)
      );
    `;
    await client.query(topicPrivacyTableQuery);
    console.log('✅ Topic privacy settings table created/verified');

    // Quiz review sessions table
    const quizReviewSessionsTableQuery = `
      CREATE TABLE IF NOT EXISTS quiz_review_sessions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        session_type VARCHAR(50) NOT NULL, -- 'single_topic', 'all_topics', 'random'
        topic_id INT REFERENCES generated_topics(id) ON DELETE CASCADE,
        questions_answered INT DEFAULT 0,
        correct_answers INT DEFAULT 0,
        total_questions INT DEFAULT 0,
        session_duration_seconds INT DEFAULT 0,
        started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP WITH TIME ZONE,
        session_data JSONB DEFAULT '{}'
      );
    `;
    await client.query(quizReviewSessionsTableQuery);
    console.log('✅ Quiz review sessions table created/verified');

    // Create indexes for better performance
    console.log('Creating indexes...');
    
    // Indexes for random_quizzes
    await client.query('CREATE INDEX IF NOT EXISTS idx_random_quizzes_category ON random_quizzes(category);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_random_quizzes_is_active ON random_quizzes(is_active);');
    
    // Indexes for user_quiz_attempts
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_user_id ON user_quiz_attempts(user_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_quiz_id ON user_quiz_attempts(quiz_id);');
    
    // Indexes for user_activities
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_activities_user_id ON user_activities(user_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_activities_created_at ON user_activities(created_at);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_activities_type ON user_activities(activity_type);');
    
    // Indexes for user_preferences
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_preferences_key ON user_preferences(preference_key);');
    
    // Indexes for audio cache
    await client.query('CREATE INDEX IF NOT EXISTS idx_audio_cache_text_hash ON audio_cache_metadata(text_hash);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_audio_cache_last_accessed ON audio_cache_metadata(last_accessed);');
    
    console.log('✅ All indexes created/verified');

    client.release();
    console.log('✅ Database setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error setting up database:', error);
  } finally {
    await appPool.end();
  }
}

setupDatabase();
