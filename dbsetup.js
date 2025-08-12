const { Pool } = require("pg");
require("dotenv").config();

const createDatabaseAndTables = async () => {
  // Use a temporary pool to connect to the default 'postgres' database
  // This is required to execute a CREATE DATABASE command
  const tempPool = new Pool({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT,
    database: "postgres", // Connect to a default database
  });

  const dbName = process.env.PG_DATABASE;

  try {
    console.log(`Attempting to create database "${dbName}"...`);
    // Check if the database exists
    const dbExists = await tempPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (dbExists.rowCount === 0) {
      // Create the database
      await tempPool.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created successfully.`);
    } else {
      console.log(`Database "${dbName}" already exists.`);
    }
    await tempPool.end();

    // Now, connect to the newly created (or existing) database
    const appPool = new Pool({
      user: process.env.PG_USER,
      host: process.env.PG_HOST,
      password: process.env.PG_PASSWORD,
      port: process.env.PG_PORT,
      database: dbName, // Connect to your application's database
    });

    const userTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const lessonsTableQuery = `
      CREATE TABLE IF NOT EXISTS lessons (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        current_version_id INT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const lessonVersionsTableQuery = `
      CREATE TABLE IF NOT EXISTS lesson_versions (
        id SERIAL PRIMARY KEY,
        lesson_id INT REFERENCES lessons(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        quiz_data JSONB NOT NULL,
        audio_url TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'pending_review',
        version_number INT NOT NULL,
        created_by INT REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const userLessonsTableQuery = `
      CREATE TABLE IF NOT EXISTS user_lessons (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        lesson_id INT REFERENCES lessons(id) ON DELETE CASCADE,
        is_favorite BOOLEAN DEFAULT FALSE,
        viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, lesson_id)
      );
    `;

    // The foreign key constraint needs to be created after both tables exist.
    const foreignKeyConstraintQuery = `
      ALTER TABLE lessons
      ADD CONSTRAINT fk_current_version
      FOREIGN KEY (current_version_id)
      REFERENCES lesson_versions(id)
      ON DELETE SET NULL;
    `;

    console.log("Creating tables...");
    await appPool.query(userTableQuery);
    await appPool.query(lessonsTableQuery);
    await appPool.query(lessonVersionsTableQuery);
    await appPool.query(userLessonsTableQuery);
    console.log("All tables created or already exist.");

    // Attempt to create the foreign key constraint
    try {
      await appPool.query(foreignKeyConstraintQuery);
      console.log("Foreign key constraint created or already exists.");
    } catch (fkErr) {
      // This will likely fail on subsequent runs, which is fine as it's a DDL command.
      // Log it only for debugging, not as a critical error.
      console.log(
        "Note: Foreign key constraint creation skipped (may already exist)."
      );
    }

    await appPool.end();
    console.log("Database and table setup complete. Connection closed.");
  } catch (err) {
    console.error("Error during database setup:", err.stack);
    if (tempPool) tempPool.end();
    if (appPool) appPool.end();
  }
};

createDatabaseAndTables();
