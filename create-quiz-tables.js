const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'microapp',
  password: process.env.PG_PASSWORD || 'Emmakwesi2',
  port: process.env.PG_PORT || 5433,
});

async function createQuizTables() {
  try {
    console.log('🔧 Creating quiz system tables...');

    // Table for storing random quizzes
    await pool.query(`
      CREATE TABLE IF NOT EXISTS random_quizzes (
        id SERIAL PRIMARY KEY,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        correct_answer TEXT NOT NULL,
        explanation TEXT,
        category VARCHAR(100),
        difficulty VARCHAR(20) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);
    console.log('✅ Created random_quizzes table');

    // Table for tracking user quiz attempts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_quiz_attempts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        quiz_id INTEGER NOT NULL,
        selected_answer TEXT,
        is_correct BOOLEAN,
        answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (quiz_id) REFERENCES random_quizzes(id) ON DELETE CASCADE,
        UNIQUE(user_id, quiz_id)
      )
    `);
    console.log('✅ Created user_quiz_attempts table');

    // Table for quiz generation history
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_generation_history (
        id SERIAL PRIMARY KEY,
        batch_size INTEGER NOT NULL,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        categories TEXT[],
        status VARCHAR(20) DEFAULT 'completed'
      )
    `);
    console.log('✅ Created quiz_generation_history table');

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_random_quizzes_category ON random_quizzes(category);
    `);
    console.log('✅ Created index on random_quizzes.category');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_random_quizzes_active ON random_quizzes(is_active);
    `);
    console.log('✅ Created index on random_quizzes.is_active');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_user ON user_quiz_attempts(user_id);
    `);
    console.log('✅ Created index on user_quiz_attempts.user_id');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_quiz ON user_quiz_attempts(quiz_id);
    `);
    console.log('✅ Created index on user_quiz_attempts.quiz_id');

    console.log('\n🎉 All quiz system tables created successfully!');

  } catch (error) {
    console.error('❌ Error creating quiz tables:', error);
  } finally {
    await pool.end();
  }
}

createQuizTables();
