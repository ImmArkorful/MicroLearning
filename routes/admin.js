const express = require("express");
const router = express.Router();
const db = require("../db");
const adminAuth = require("../middleware/adminAuth");
const authenticateToken = require("../middleware/auth");
const axios = require("axios");
require("dotenv").config();

// ==================== DASHBOARD STATISTICS ====================

router.get("/stats", adminAuth, async (req, res) => {
  try {
    // Total users
    const totalUsersResult = await db.query("SELECT COUNT(*) as count FROM users");
    const totalUsers = parseInt(totalUsersResult.rows[0].count);

    // Active users (users who have created lessons or taken quizzes in last 30 days)
    const activeUsersResult = await db.query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM (
        SELECT user_id FROM generated_topics WHERE created_at > NOW() - INTERVAL '30 days'
        UNION
        SELECT user_id FROM user_quiz_attempts WHERE attempted_at > NOW() - INTERVAL '30 days'
      ) as active_users
    `);
    const activeUsers = parseInt(activeUsersResult.rows[0]?.count || 0);

    // New users (last 30 days)
    const newUsersResult = await db.query(`
      SELECT COUNT(*) as count FROM users 
      WHERE created_at > NOW() - INTERVAL '30 days'
    `);
    const newUsers = parseInt(newUsersResult.rows[0].count);

    // Total lessons
    const totalLessonsResult = await db.query("SELECT COUNT(*) as count FROM generated_topics");
    const totalLessons = parseInt(totalLessonsResult.rows[0].count);

    // Lessons by category
    const lessonsByCategoryResult = await db.query(`
      SELECT category, COUNT(*) as count 
      FROM generated_topics 
      GROUP BY category 
      ORDER BY count DESC
    `);
    const lessonsByCategory = lessonsByCategoryResult.rows;

    // Total quizzes
    const totalQuizzesResult = await db.query("SELECT COUNT(*) as count FROM random_quizzes");
    const totalQuizzes = parseInt(totalQuizzesResult.rows[0].count);

    // Active quizzes
    const activeQuizzesResult = await db.query(`
      SELECT COUNT(*) as count FROM random_quizzes WHERE is_active = true
    `);
    const activeQuizzes = parseInt(activeQuizzesResult.rows[0].count);

    // Total quiz attempts
    const totalAttemptsResult = await db.query("SELECT COUNT(*) as count FROM user_quiz_attempts");
    const totalAttempts = parseInt(totalAttemptsResult.rows[0].count);

    // Success rate
    const successRateResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_correct = true) as correct
      FROM user_quiz_attempts
    `);
    const total = parseInt(successRateResult.rows[0]?.total || 0);
    const correct = parseInt(successRateResult.rows[0]?.correct || 0);
    const successRate = total > 0 ? ((correct / total) * 100).toFixed(2) : 0;

    // Recent activity (last 10 activities)
    const recentActivityResult = await db.query(`
      SELECT 
        'lesson_created' as type,
        user_id,
        id as related_id,
        topic as description,
        created_at
      FROM generated_topics
      UNION ALL
      SELECT 
        'quiz_attempted' as type,
        user_id,
        quiz_id as related_id,
        'Quiz attempt' as description,
        attempted_at as created_at
      FROM user_quiz_attempts
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        new: newUsers
      },
      lessons: {
        total: totalLessons,
        byCategory: lessonsByCategory
      },
      quizzes: {
        total: totalQuizzes,
        active: activeQuizzes
      },
      quizAttempts: {
        total: totalAttempts,
        successRate: parseFloat(successRate)
      },
      recentActivity: recentActivityResult.rows
    });
  } catch (error) {
    console.error("Error fetching admin stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

// ==================== USERS MANAGEMENT ====================

router.get("/users", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const role = req.query.role || '';

    let query = "SELECT id, email, role, created_at FROM users WHERE 1=1";
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      // Search across email and id (convert id to text for pattern matching)
      query += ` AND (email ILIKE $${paramCount} OR CAST(id AS TEXT) ILIKE $${paramCount})`;
      params.push(`%${search.trim()}%`);
    }

    if (role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      params.push(role);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const usersResult = await db.query(query, params);

    // Get counts for each user
    for (let user of usersResult.rows) {
      const lessonsCount = await db.query(
        "SELECT COUNT(*) as count FROM generated_topics WHERE user_id = $1",
        [user.id]
      );
      user.lessons_count = parseInt(lessonsCount.rows[0].count);

      const attemptsCount = await db.query(
        "SELECT COUNT(*) as count FROM user_quiz_attempts WHERE user_id = $1",
        [user.id]
      );
      user.quiz_attempts_count = parseInt(attemptsCount.rows[0].count);
    }

    // Get total count for pagination
    let countQuery = "SELECT COUNT(*) as count FROM users WHERE 1=1";
    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      // Search across email and id (convert id to text for pattern matching)
      countQuery += ` AND (email ILIKE $${countParamCount} OR CAST(id AS TEXT) ILIKE $${countParamCount})`;
      countParams.push(`%${search.trim()}%`);
    }

    if (role) {
      countParamCount++;
      countQuery += ` AND role = $${countParamCount}`;
      countParams.push(role);
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      users: usersResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/users/:id", adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const userResult = await db.query(
      "SELECT id, email, role, created_at FROM users WHERE id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Get user statistics
    const lessonsCount = await db.query(
      "SELECT COUNT(*) as count FROM generated_topics WHERE user_id = $1",
      [userId]
    );
    user.lessons_count = parseInt(lessonsCount.rows[0].count);

    const attemptsCount = await db.query(
      "SELECT COUNT(*) as count FROM user_quiz_attempts WHERE user_id = $1",
      [userId]
    );
    user.quiz_attempts_count = parseInt(attemptsCount.rows[0].count);

    const correctAttempts = await db.query(
      "SELECT COUNT(*) as count FROM user_quiz_attempts WHERE user_id = $1 AND is_correct = true",
      [userId]
    );
    user.correct_attempts_count = parseInt(correctAttempts.rows[0].count);

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.put("/users/:id", adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { email, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Check if email is already taken by another user
    const existingUser = await db.query(
      "SELECT id FROM users WHERE email = $1 AND id != $2",
      [email, userId]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already in use" });
    }

    let updateQuery = "UPDATE users SET email = $1";
    const params = [email];
    let paramCount = 1;

    if (role && (role === 'user' || role === 'admin')) {
      paramCount++;
      updateQuery += `, role = $${paramCount}`;
      params.push(role);
    }

    paramCount++;
    updateQuery += ` WHERE id = $${paramCount} RETURNING id, email, role, created_at`;
    params.push(userId);

    const result = await db.query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/users/:id", adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Check if user exists
    const userResult = await db.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent deleting yourself
    if (userId === req.user.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Get count of lessons that will be preserved
    const lessonsCount = await db.query(
      "SELECT COUNT(*) as count FROM generated_topics WHERE user_id = $1",
      [userId]
    );
    const preservedLessons = parseInt(lessonsCount.rows[0]?.count || 0);

    // IMPORTANT: Manually preserve lessons by setting user_id to NULL BEFORE deleting user
    // This ensures lessons are preserved even if the database constraint hasn't been migrated yet
    if (preservedLessons > 0) {
      await db.query(
        "UPDATE generated_topics SET user_id = NULL WHERE user_id = $1",
        [userId]
      );
      console.log(`✅ Preserved ${preservedLessons} lesson(s) by setting user_id to NULL`);
    }

    // Delete user (lessons are already preserved above)
    // Other related data (quiz attempts, activities, preferences, etc.) will be deleted via CASCADE
    await db.query("DELETE FROM users WHERE id = $1", [userId]);

    res.json({ 
      message: "User deleted successfully",
      preservedLessons: preservedLessons
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.get("/users/:id/lessons", adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const lessonsResult = await db.query(
      `SELECT id, topic, category, summary, created_at 
       FROM generated_topics 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(lessonsResult.rows);
  } catch (error) {
    console.error("Error fetching user lessons:", error);
    res.status(500).json({ error: "Failed to fetch user lessons" });
  }
});

router.get("/users/:id/quiz-attempts", adminAuth, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const attemptsResult = await db.query(
      `SELECT uqa.*, rq.question, rq.correct_answer
       FROM user_quiz_attempts uqa
       JOIN random_quizzes rq ON uqa.quiz_id = rq.id
       WHERE uqa.user_id = $1
       ORDER BY uqa.attempted_at DESC`,
      [userId]
    );

    res.json(attemptsResult.rows);
  } catch (error) {
    console.error("Error fetching user quiz attempts:", error);
    res.status(500).json({ error: "Failed to fetch user quiz attempts" });
  }
});

// ==================== LESSONS MANAGEMENT ====================

router.get("/lessons", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const userId = req.query.user_id || '';

    let query = `
      SELECT gt.id, gt.topic, gt.category, gt.summary, gt.created_at, 
             u.email as user_email, gt.user_id
      FROM generated_topics gt
      LEFT JOIN users u ON gt.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      // Search across topic, summary, category, and user email
      query += ` AND (gt.topic ILIKE $${paramCount} OR gt.summary ILIKE $${paramCount} OR gt.category ILIKE $${paramCount} OR u.email ILIKE $${paramCount} OR CAST(gt.id AS TEXT) ILIKE $${paramCount})`;
      params.push(`%${search.trim()}%`);
    }

    if (category) {
      paramCount++;
      query += ` AND gt.category ILIKE $${paramCount}`;
      params.push(`%${category.trim()}%`);
    }

    if (userId) {
      paramCount++;
      query += ` AND gt.user_id = $${paramCount}`;
      params.push(parseInt(userId));
    }

    query += ` ORDER BY gt.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const lessonsResult = await db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as count
      FROM generated_topics gt
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      // Search across topic, summary, category
      countQuery += ` AND (gt.topic ILIKE $${countParamCount} OR gt.summary ILIKE $${countParamCount} OR gt.category ILIKE $${countParamCount} OR CAST(gt.id AS TEXT) ILIKE $${countParamCount})`;
      countParams.push(`%${search.trim()}%`);
    }

    if (category) {
      countParamCount++;
      countQuery += ` AND gt.category ILIKE $${countParamCount}`;
      countParams.push(`%${category.trim()}%`);
    }

    if (userId) {
      countParamCount++;
      countQuery += ` AND gt.user_id = $${countParamCount}`;
      countParams.push(parseInt(userId));
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      lessons: lessonsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching lessons:", error);
    res.status(500).json({ error: "Failed to fetch lessons" });
  }
});

router.get("/lessons/:id", adminAuth, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);

    const lessonResult = await db.query(
      `SELECT gt.*, u.email as user_email
       FROM generated_topics gt
       LEFT JOIN users u ON gt.user_id = u.id
       WHERE gt.id = $1`,
      [lessonId]
    );

    if (lessonResult.rows.length === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    res.json(lessonResult.rows[0]);
  } catch (error) {
    console.error("Error fetching lesson:", error);
    res.status(500).json({ error: "Failed to fetch lesson" });
  }
});

router.put("/lessons/:id", adminAuth, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);
    const { topic, category, summary, quiz_data } = req.body;

    if (!topic || !category || !summary) {
      return res.status(400).json({ error: "Topic, category, and summary are required" });
    }

    let updateQuery = "UPDATE generated_topics SET topic = $1, category = $2, summary = $3";
    const params = [topic, category, summary];
    let paramCount = 3;

    if (quiz_data) {
      paramCount++;
      updateQuery += `, quiz_data = $${paramCount}`;
      params.push(JSON.stringify(quiz_data));
    }

    paramCount++;
    updateQuery += ` WHERE id = $${paramCount} RETURNING *`;
    params.push(lessonId);

    const result = await db.query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating lesson:", error);
    res.status(500).json({ error: "Failed to update lesson" });
  }
});

router.delete("/lessons/:id", adminAuth, async (req, res) => {
  try {
    const lessonId = parseInt(req.params.id);

    const result = await db.query("DELETE FROM generated_topics WHERE id = $1 RETURNING id", [lessonId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    res.json({ message: "Lesson deleted successfully" });
  } catch (error) {
    console.error("Error deleting lesson:", error);
    res.status(500).json({ error: "Failed to delete lesson" });
  }
});

router.post("/lessons", adminAuth, async (req, res) => {
  try {
    const { topic, category, summary, quiz_data, user_id, key_points } = req.body;

    if (!topic || !category || !summary) {
      return res.status(400).json({ error: "Topic, category, and summary are required" });
    }

    const userId = user_id || req.user.userId;

    const defaultQuizData = quiz_data || {
      question: "What did you learn from this topic?",
      options: ["A lot", "Some", "A little", "Nothing"],
      correct_answer: "A lot"
    };

    const result = await db.query(
      `INSERT INTO generated_topics (user_id, category, topic, summary, quiz_data, key_points)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        userId,
        category,
        topic,
        summary,
        JSON.stringify(defaultQuizData),
        JSON.stringify(key_points || [])
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating lesson:", error);
    res.status(500).json({ error: "Failed to create lesson" });
  }
});

// ==================== QUIZZES MANAGEMENT ====================

router.get("/quizzes", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const difficulty = req.query.difficulty || '';
    const isActive = req.query.is_active;

    let query = `
      SELECT id, question, options, correct_answer, explanation, category, 
             difficulty, is_active, created_at
      FROM random_quizzes
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (search) {
      paramCount++;
      // Search across question, explanation, category, correct_answer, and id
      query += ` AND (question ILIKE $${paramCount} OR explanation ILIKE $${paramCount} OR category ILIKE $${paramCount} OR correct_answer ILIKE $${paramCount} OR CAST(id AS TEXT) ILIKE $${paramCount})`;
      params.push(`%${search.trim()}%`);
    }

    if (category) {
      paramCount++;
      query += ` AND category ILIKE $${paramCount}`;
      params.push(`%${category.trim()}%`);
    }

    if (difficulty) {
      paramCount++;
      query += ` AND difficulty = $${paramCount}`;
      params.push(difficulty);
    }

    if (isActive !== undefined && isActive !== '') {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      params.push(isActive === 'true');
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const quizzesResult = await db.query(query, params);

    // Get total count
    let countQuery = "SELECT COUNT(*) as count FROM random_quizzes WHERE 1=1";
    const countParams = [];
    let countParamCount = 0;

    if (search) {
      countParamCount++;
      // Search across question, explanation, category, correct_answer
      countQuery += ` AND (question ILIKE $${countParamCount} OR explanation ILIKE $${countParamCount} OR category ILIKE $${countParamCount} OR correct_answer ILIKE $${countParamCount} OR CAST(id AS TEXT) ILIKE $${countParamCount})`;
      countParams.push(`%${search.trim()}%`);
    }

    if (category) {
      countParamCount++;
      countQuery += ` AND category ILIKE $${countParamCount}`;
      countParams.push(`%${category.trim()}%`);
    }

    if (difficulty) {
      countParamCount++;
      countQuery += ` AND difficulty = $${countParamCount}`;
      countParams.push(difficulty);
    }

    if (isActive !== undefined && isActive !== '') {
      countParamCount++;
      countQuery += ` AND is_active = $${countParamCount}`;
      countParams.push(isActive === 'true');
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      quizzes: quizzesResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
});

router.get("/quizzes/:id", adminAuth, async (req, res) => {
  try {
    const quizId = parseInt(req.params.id);

    const quizResult = await db.query(
      "SELECT * FROM random_quizzes WHERE id = $1",
      [quizId]
    );

    if (quizResult.rows.length === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    res.json(quizResult.rows[0]);
  } catch (error) {
    console.error("Error fetching quiz:", error);
    res.status(500).json({ error: "Failed to fetch quiz" });
  }
});

router.post("/quizzes", adminAuth, async (req, res) => {
  try {
    const { question, options, correct_answer, explanation, category, difficulty } = req.body;

    if (!question || !options || !correct_answer) {
      return res.status(400).json({ error: "Question, options, and correct_answer are required" });
    }

    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: "Options must be an array with at least 2 items" });
    }

    if (!options.includes(correct_answer)) {
      return res.status(400).json({ error: "Correct answer must be one of the options" });
    }

    const result = await db.query(
      `INSERT INTO random_quizzes (question, options, correct_answer, explanation, category, difficulty)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        question,
        JSON.stringify(options),
        correct_answer,
        explanation || null,
        category || null,
        difficulty || 'medium'
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating quiz:", error);
    res.status(500).json({ error: "Failed to create quiz" });
  }
});

router.put("/quizzes/:id", adminAuth, async (req, res) => {
  try {
    const quizId = parseInt(req.params.id);
    const { question, options, correct_answer, explanation, category, difficulty, is_active } = req.body;

    let updateQuery = "UPDATE random_quizzes SET";
    const params = [];
    let paramCount = 0;
    const updates = [];

    if (question !== undefined) {
      paramCount++;
      updates.push(` question = $${paramCount}`);
      params.push(question);
    }

    if (options !== undefined) {
      if (!Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: "Options must be an array with at least 2 items" });
      }
      paramCount++;
      updates.push(` options = $${paramCount}`);
      params.push(JSON.stringify(options));
    }

    if (correct_answer !== undefined) {
      paramCount++;
      updates.push(` correct_answer = $${paramCount}`);
      params.push(correct_answer);
    }

    if (explanation !== undefined) {
      paramCount++;
      updates.push(` explanation = $${paramCount}`);
      params.push(explanation);
    }

    if (category !== undefined) {
      paramCount++;
      updates.push(` category = $${paramCount}`);
      params.push(category);
    }

    if (difficulty !== undefined) {
      paramCount++;
      updates.push(` difficulty = $${paramCount}`);
      params.push(difficulty);
    }

    if (is_active !== undefined) {
      paramCount++;
      updates.push(` is_active = $${paramCount}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Validate correct_answer is in options if both are being updated
    if (correct_answer !== undefined && options !== undefined) {
      if (!options.includes(correct_answer)) {
        return res.status(400).json({ error: "Correct answer must be one of the options" });
      }
    } else if (correct_answer !== undefined) {
      // If only correct_answer is being updated, fetch current options
      const currentQuiz = await db.query("SELECT options FROM random_quizzes WHERE id = $1", [quizId]);
      if (currentQuiz.rows.length > 0) {
        const currentOptions = currentQuiz.rows[0].options;
        if (!currentOptions.includes(correct_answer)) {
          return res.status(400).json({ error: "Correct answer must be one of the options" });
        }
      }
    }

    paramCount++;
    updateQuery += updates.join(',') + ` WHERE id = $${paramCount} RETURNING *`;
    params.push(quizId);

    const result = await db.query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating quiz:", error);
    res.status(500).json({ error: "Failed to update quiz" });
  }
});

router.delete("/quizzes/:id", adminAuth, async (req, res) => {
  try {
    const quizId = parseInt(req.params.id);

    // Soft delete by setting is_active to false
    const result = await db.query(
      "UPDATE random_quizzes SET is_active = false WHERE id = $1 RETURNING id",
      [quizId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    res.json({ message: "Quiz deleted successfully" });
  } catch (error) {
    console.error("Error deleting quiz:", error);
    res.status(500).json({ error: "Failed to delete quiz" });
  }
});

// ==================== QUIZ ANSWERS MANAGEMENT ====================

router.get("/quiz-attempts", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const userId = req.query.user_id || '';
    const quizId = req.query.quiz_id || '';
    const isCorrect = req.query.is_correct;

    let query = `
      SELECT uqa.*, u.email as user_email, rq.question as quiz_question, 
             rq.correct_answer, rq.category as quiz_category
      FROM user_quiz_attempts uqa
      JOIN users u ON uqa.user_id = u.id
      JOIN random_quizzes rq ON uqa.quiz_id = rq.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (userId) {
      paramCount++;
      query += ` AND uqa.user_id = $${paramCount}`;
      params.push(parseInt(userId));
    }

    if (quizId) {
      paramCount++;
      query += ` AND uqa.quiz_id = $${paramCount}`;
      params.push(parseInt(quizId));
    }

    if (isCorrect !== undefined && isCorrect !== '') {
      paramCount++;
      query += ` AND uqa.is_correct = $${paramCount}`;
      params.push(isCorrect === 'true');
    }

    query += ` ORDER BY uqa.attempted_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const attemptsResult = await db.query(query, params);

    // Get total count
    let countQuery = `
      SELECT COUNT(*) as count
      FROM user_quiz_attempts uqa
      WHERE 1=1
    `;
    const countParams = [];
    let countParamCount = 0;

    if (userId) {
      countParamCount++;
      countQuery += ` AND uqa.user_id = $${countParamCount}`;
      countParams.push(parseInt(userId));
    }

    if (quizId) {
      countParamCount++;
      countQuery += ` AND uqa.quiz_id = $${countParamCount}`;
      countParams.push(parseInt(quizId));
    }

    if (isCorrect !== undefined && isCorrect !== '') {
      countParamCount++;
      countQuery += ` AND uqa.is_correct = $${countParamCount}`;
      countParams.push(isCorrect === 'true');
    }

    const countResult = await db.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      attempts: attemptsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching quiz attempts:", error);
    res.status(500).json({ error: "Failed to fetch quiz attempts" });
  }
});

router.get("/quiz-attempts/:id", adminAuth, async (req, res) => {
  try {
    const attemptId = parseInt(req.params.id);

    const attemptResult = await db.query(
      `SELECT uqa.*, u.email as user_email, rq.*
       FROM user_quiz_attempts uqa
       JOIN users u ON uqa.user_id = u.id
       JOIN random_quizzes rq ON uqa.quiz_id = rq.id
       WHERE uqa.id = $1`,
      [attemptId]
    );

    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ error: "Quiz attempt not found" });
    }

    res.json(attemptResult.rows[0]);
  } catch (error) {
    console.error("Error fetching quiz attempt:", error);
    res.status(500).json({ error: "Failed to fetch quiz attempt" });
  }
});

router.delete("/quiz-attempts/:id", adminAuth, async (req, res) => {
  try {
    const attemptId = parseInt(req.params.id);

    const result = await db.query(
      "DELETE FROM user_quiz_attempts WHERE id = $1 RETURNING id",
      [attemptId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Quiz attempt not found" });
    }

    res.json({ message: "Quiz attempt deleted successfully" });
  } catch (error) {
    console.error("Error deleting quiz attempt:", error);
    res.status(500).json({ error: "Failed to delete quiz attempt" });
  }
});

router.get("/quiz-results", adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const resultsResult = await db.query(
      `SELECT qr.*, u.email as user_email
       FROM quiz_results qr
       LEFT JOIN users u ON qr.user_id = u.id
       ORDER BY qr.answered_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await db.query("SELECT COUNT(*) as count FROM quiz_results");
    const total = parseInt(countResult.rows[0].count);

    res.json({
      results: resultsResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching quiz results:", error);
    res.status(500).json({ error: "Failed to fetch quiz results" });
  }
});

// ==================== BATCH DELETE OPERATIONS ====================

router.post("/users/batch-delete", adminAuth, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs array is required" });
    }

    // Prevent deleting yourself
    const userIds = ids.map(id => parseInt(id));
    if (userIds.includes(req.user.userId)) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    // Get count of lessons that will be preserved
    const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');
    const lessonsCount = await db.query(
      `SELECT COUNT(*) as count FROM generated_topics WHERE user_id IN (${placeholders})`,
      userIds
    );
    const preservedLessons = parseInt(lessonsCount.rows[0]?.count || 0);

    // IMPORTANT: Manually preserve lessons by setting user_id to NULL BEFORE deleting users
    // This ensures lessons are preserved even if the database constraint hasn't been migrated yet
    if (preservedLessons > 0) {
      await db.query(
        `UPDATE generated_topics SET user_id = NULL WHERE user_id IN (${placeholders})`,
        userIds
      );
      console.log(`✅ Preserved ${preservedLessons} lesson(s) by setting user_id to NULL`);
    }

    // Delete users (lessons are already preserved above)
    // Other related data (quiz attempts, activities, preferences, etc.) will be deleted via CASCADE
    const result = await db.query(
      `DELETE FROM users WHERE id IN (${placeholders}) RETURNING id`,
      userIds
    );

    res.json({
      message: `Successfully deleted ${result.rows.length} user(s)`,
      deletedCount: result.rows.length,
      preservedLessons: preservedLessons
    });
  } catch (error) {
    console.error("Error batch deleting users:", error);
    res.status(500).json({ error: "Failed to delete users" });
  }
});

router.post("/lessons/batch-delete", adminAuth, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs array is required" });
    }

    const lessonIds = ids.map(id => parseInt(id));
    const placeholders = lessonIds.map((_, index) => `$${index + 1}`).join(',');
    const result = await db.query(
      `DELETE FROM generated_topics WHERE id IN (${placeholders}) RETURNING id`,
      lessonIds
    );

    res.json({
      message: `Successfully deleted ${result.rows.length} lesson(s)`,
      deletedCount: result.rows.length
    });
  } catch (error) {
    console.error("Error batch deleting lessons:", error);
    res.status(500).json({ error: "Failed to delete lessons" });
  }
});

router.post("/quizzes/batch-delete", adminAuth, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs array is required" });
    }

    const quizIds = ids.map(id => parseInt(id));
    const placeholders = quizIds.map((_, index) => `$${index + 1}`).join(',');
    const result = await db.query(
      `UPDATE random_quizzes SET is_active = false WHERE id IN (${placeholders}) RETURNING id`,
      quizIds
    );

    res.json({
      message: `Successfully deleted ${result.rows.length} quiz(zes)`,
      deletedCount: result.rows.length
    });
  } catch (error) {
    console.error("Error batch deleting quizzes:", error);
    res.status(500).json({ error: "Failed to delete quizzes" });
  }
});

router.post("/quiz-attempts/batch-delete", adminAuth, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs array is required" });
    }

    const attemptIds = ids.map(id => parseInt(id));
    const placeholders = attemptIds.map((_, index) => `$${index + 1}`).join(',');
    const result = await db.query(
      `DELETE FROM user_quiz_attempts WHERE id IN (${placeholders}) RETURNING id`,
      attemptIds
    );

    res.json({
      message: `Successfully deleted ${result.rows.length} quiz attempt(s)`,
      deletedCount: result.rows.length
    });
  } catch (error) {
    console.error("Error batch deleting quiz attempts:", error);
    res.status(500).json({ error: "Failed to delete quiz attempts" });
  }
});

// ==================== TOPIC GENERATION ====================

// Helper function to extract JSON from markdown code blocks and fix control characters
const extractJSONFromResponse = (content) => {
  if (!content || typeof content !== 'string') {
    return content;
  }
  
  let cleaned = content
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  // Fix common JSON issues: escape control characters and fix common problems
  try {
    // First, try to parse as-is
    JSON.parse(cleaned);
    return cleaned;
  } catch (e) {
    // If parsing fails, try to fix common issues
    try {
      // Replace unescaped newlines, tabs, and other control characters in string values
      // This regex finds string values and escapes control characters
      cleaned = cleaned.replace(/"([^"\\]|\\.)*"/g, (match) => {
        // Don't modify if it's already valid
        try {
          JSON.parse(`{ "test": ${match} }`);
          return match;
        } catch {
          // Escape control characters
          return match
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t')
            .replace(/\f/g, '\\f')
            .replace(/\b/g, '\\b')
            .replace(/\u0000-\u001F/g, (char) => {
              const code = char.charCodeAt(0);
              return `\\u${code.toString(16).padStart(4, '0')}`;
            });
        }
      });
      
      // Try parsing again
      JSON.parse(cleaned);
      return cleaned;
    } catch (e2) {
      // Last resort: try to fix by replacing problematic characters more aggressively
      try {
        // Remove or escape any remaining control characters
        cleaned = cleaned
          .replace(/[\x00-\x1F\x7F]/g, (char) => {
            if (char === '\n') return '\\n';
            if (char === '\r') return '\\r';
            if (char === '\t') return '\\t';
            const code = char.charCodeAt(0);
            return `\\u${code.toString(16).padStart(4, '0')}`;
          });
        
        JSON.parse(cleaned);
        return cleaned;
      } catch (e3) {
        console.error('Failed to parse JSON after multiple attempts:', e3.message);
        throw new Error(`Invalid JSON response: ${e3.message}`);
      }
    }
  }
};

// Preview topics (just topic names, no lesson generation)
router.post("/preview-topics", adminAuth, async (req, res) => {
  try {
    const { count, category, progressId } = req.body;

    const topicCount = parseInt(count) || 5;
    const maxCount = 50; // Limit to prevent abuse
    const actualCount = Math.min(topicCount, maxCount);

    if (actualCount < 1) {
      return res.status(400).json({ error: "Count must be at least 1" });
    }

    const targetCategory = category || null;
    const previewId = progressId || `preview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`👀 Admin previewing ${actualCount} topics${targetCategory ? ` in category: ${targetCategory}` : ' (random categories)'} (ID: ${previewId})`);

    // Initialize progress
    generationProgress.set(previewId, {
      total: actualCount,
      completed: 0,
      failed: 0,
      current: null,
      generated: [],
      errors: [],
      status: 'generating'
    });

    const previewTopics = [];
    const errors = [];
    const generatedTopicsSet = new Set(); // Track generated topics to avoid duplicates
    const existingTopics = new Set(); // Track existing topics in database

    // Get existing topics from database to avoid duplicates
    try {
      const existingResult = await db.query("SELECT LOWER(TRIM(topic)) as topic FROM generated_topics");
      existingResult.rows.forEach(row => existingTopics.add(row.topic.toLowerCase().trim()));
    } catch (err) {
      console.log("Could not fetch existing topics, continuing anyway");
    }

    // Generate topic names only (no lesson content)
    let attempts = 0;
    const maxAttempts = actualCount * 3; // Allow retries for duplicates
    
    while (previewTopics.length < actualCount && attempts < maxAttempts) {
      attempts++;
      try {
        // Create diverse prompts with random elements
        const perspectives = [
          "from a beginner's perspective",
          "from an advanced perspective",
          "with a practical focus",
          "with a historical context",
          "with modern applications",
          "covering emerging trends",
          "exploring lesser-known aspects",
          "with real-world examples",
          "focusing on common misconceptions",
          "highlighting innovative approaches"
        ];
        
        const angles = [
          "fundamentals and basics",
          "advanced techniques and strategies",
          "common mistakes and how to avoid them",
          "practical applications in daily life",
          "historical development and evolution",
          "future trends and predictions",
          "comparative analysis",
          "step-by-step guide",
          "myths vs facts",
          "expert insights"
        ];
        
        const randomPerspective = perspectives[Math.floor(Math.random() * perspectives.length)];
        const randomAngle = angles[Math.floor(Math.random() * angles.length)];
        
        // Build context of already generated topics in this batch
        const alreadyGenerated = Array.from(generatedTopicsSet).slice(-5).join(', ');
        const avoidContext = alreadyGenerated ? ` Avoid these topics: ${alreadyGenerated}.` : '';
        
        let topicPrompt;
        if (targetCategory) {
          topicPrompt = `Generate a UNIQUE, specific, and interesting educational topic in the ${targetCategory} category.${avoidContext} The topic should be creative, diverse, and something people would want to learn about. Focus on ${randomAngle} ${randomPerspective}. Make it completely different from common topics. Return ONLY a clean topic name in plain English. Use only standard English letters, numbers, spaces, and common punctuation. No email addresses, URLs, special characters, or non-English characters.`;
        } else {
          const randomCategories = ['Science', 'Technology', 'History', 'Arts', 'Business', 'Health', 'Education', 'Sports', 'Travel', 'Food', 'Philosophy', 'Psychology', 'Economics', 'Literature', 'Music'];
          const randomCategory = randomCategories[Math.floor(Math.random() * randomCategories.length)];
          topicPrompt = `Generate a UNIQUE, specific, and interesting educational topic in the ${randomCategory} category.${avoidContext} The topic should be creative, diverse, and something people would want to learn about. Focus on ${randomAngle} ${randomPerspective}. Make it completely different from common topics. Return ONLY a clean topic name in plain English. Use only standard English letters, numbers, spaces, and common punctuation. No email addresses, URLs, special characters, or non-English characters.`;
        }

        const topicResponse = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "mistralai/mistral-7b-instruct",
            messages: [
              {
                role: "system",
                content: "You are a creative topic generator. Generate unique, diverse, and interesting educational topics. Each topic must be completely different from others. Be creative and avoid generic topics. Return ONLY the topic name in plain English text. Use only standard English letters, numbers, spaces, and common punctuation (.,:;!?'-). No email addresses, URLs, special characters, or non-English characters. No additional text, quotes, or explanation."
              },
              {
                role: "user",
                content: topicPrompt
              }
            ],
            temperature: 1.2, // Higher temperature for more randomness
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: 30000
          }
        );

        let topic = topicResponse.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
        
        // Clean up any extra text that might have been included
        topic = topic.split('\n')[0].trim();
        topic = topic.replace(/^(Topic:|Title:)/i, '').trim();
        
        // Remove weird characters, email addresses, URLs, and other artifacts
        topic = topic
          // Remove email addresses
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
          // Remove URLs
          .replace(/https?:\/\/[^\s]+/g, '')
          // Remove non-ASCII characters (keep only standard English characters 0x20-0x7E)
          .replace(/[^\x20-\x7E]/g, '')
          // Remove any remaining weird patterns (multiple special chars in a row)
          .replace(/[^\w\s\-.,:;!?'"()\[\]{}]{2,}/g, '')
          // Clean up multiple spaces
          .replace(/\s+/g, ' ')
          .trim();
        
        // Validate topic - must be reasonable length and contain actual words
        if (!topic || topic.length < 3 || topic.length > 200) {
          console.log(`⚠️ Invalid topic length: "${topic}", generating another...`);
          continue; // Skip this topic and try again
        }
        
        // Check if topic contains at least one letter (not just numbers/symbols)
        if (!/[a-zA-Z]/.test(topic)) {
          console.log(`⚠️ Topic contains no letters: "${topic}", generating another...`);
          continue; // Skip this topic and try again
        }
        
        // Check for suspicious patterns (email-like, URL-like, or too many special chars)
        if (topic.includes('@') || topic.includes('http') || (topic.match(/[^\w\s]/g) || []).length > topic.length * 0.3) {
          console.log(`⚠️ Suspicious characters detected in topic: "${topic}", generating another...`);
          continue; // Skip this topic and try again
        }
        
        // Check for nonsensical patterns (too many single-letter words, random character sequences)
        const words = topic.split(/\s+/);
        const singleLetterWords = words.filter(w => w.length === 1 && /[a-zA-Z]/.test(w)).length;
        if (singleLetterWords > words.length * 0.3) {
          console.log(`⚠️ Too many single-letter words in topic: "${topic}", generating another...`);
          continue; // Skip this topic and try again
        }
        
        // Ensure topic has at least 2 words (more likely to be coherent)
        if (words.length < 2) {
          console.log(`⚠️ Topic too short (less than 2 words): "${topic}", generating another...`);
          continue; // Skip this topic and try again
        }
        
        // Check for duplicates
        const topicLower = topic.toLowerCase().trim();
        if (generatedTopicsSet.has(topicLower) || existingTopics.has(topicLower)) {
          console.log(`⚠️ Duplicate topic detected: "${topic}", generating another...`);
          continue; // Skip this topic and try again
        }
        
        generatedTopicsSet.add(topicLower);

        // Determine category if not provided
        let finalCategory = targetCategory;
        if (!finalCategory) {
          const categoryResponse = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              model: "mistralai/mistral-7b-instruct",
              messages: [
                {
                  role: "system",
                  content: "You are a categorization expert. Categorize educational topics into one of these categories: Science, Technology, History, Arts, Business, Health, Education, Sports, Travel, Food, General. Return ONLY the category name, nothing else."
                },
                {
                  role: "user",
                  content: `Categorize this topic: "${topic}"`
                }
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
              },
              timeout: 30000
            }
          );

          let categoryText = categoryResponse.data.choices[0].message.content.trim();
          // Remove any explanations in brackets
          finalCategory = categoryText.split('(')[0].trim();
        }

        previewTopics.push({
          topic,
          category: finalCategory,
          index: previewTopics.length + 1
        });

        // Update progress
        const progress = generationProgress.get(previewId);
        if (progress) {
          progress.completed = previewTopics.length;
          progress.generated = previewTopics.map(t => ({ topic: t.topic, category: t.category }));
          generationProgress.set(previewId, progress);
        }

        console.log(`✅ Generated unique topic ${previewTopics.length}/${actualCount}: ${topic}`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ Error previewing topic:`, error.message);
        errors.push({ index: previewTopics.length + 1, error: error.message });
        
        // Update progress
        const progress = generationProgress.get(previewId);
        if (progress) {
          progress.failed++;
          progress.errors.push({ index: previewTopics.length + 1, error: error.message });
          generationProgress.set(previewId, progress);
        }
      }
    }
    
    if (previewTopics.length < actualCount) {
      console.log(`⚠️ Generated ${previewTopics.length} unique topics out of ${actualCount} requested (some may have been duplicates)`);
    }

    // Mark as complete
    const finalProgress = generationProgress.get(previewId);
    if (finalProgress) {
      finalProgress.status = 'completed';
      finalProgress.current = null;
      generationProgress.set(previewId, finalProgress);
    }

    // Clean up progress after 5 minutes
    setTimeout(() => {
      generationProgress.delete(previewId);
    }, 5 * 60 * 1000);

    res.json({
      message: `Successfully previewed ${previewTopics.length} topic(s)`,
      topics: previewTopics,
      errors: errors.length > 0 ? errors : undefined,
      totalRequested: actualCount,
      totalPreviewed: previewTopics.length,
      progressId: previewId
    });
  } catch (error) {
    console.error("Error previewing topics:", error);
    res.status(500).json({ error: "Failed to preview topics", details: error.message });
  }
});

// In-memory store for generation progress (in production, use Redis or similar)
const generationProgress = new Map();

// Generate lessons from a list of topics with progress tracking
router.post("/generate-topics-from-list", adminAuth, async (req, res) => {
  try {
    const { topics, userId, progressId } = req.body;

    if (!Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: "Topics array is required and must not be empty" });
    }

    const targetUserId = userId || req.user.userId;
    const genId = progressId || `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    console.log(`🔄 Admin generating lessons for ${topics.length} selected topics (ID: ${genId})`);

    // Initialize progress with individual topic statuses
    const topicStatuses = topics.map(t => ({
      topic: t.topic,
      category: t.category,
      status: 'pending',
      error: null
    }));

    generationProgress.set(genId, {
      total: topics.length,
      completed: 0,
      failed: 0,
      current: null,
      generated: [],
      errors: [],
      topicStatuses: topicStatuses,
      status: 'generating'
    });

    const generatedTopics = [];
    const errors = [];

    // Generate lesson content for each selected topic
    for (let i = 0; i < topics.length; i++) {
      const { topic, category } = topics[i];
      
      try {
        // Update progress - mark topic as generating
        const progress = generationProgress.get(genId);
        if (progress) {
          progress.current = topic;
          progress.completed = i;
          if (progress.topicStatuses && progress.topicStatuses[i]) {
            progress.topicStatuses[i].status = 'generating';
          }
          generationProgress.set(genId, progress);
        }

        // Generate lesson content for the topic
        const lessonResponse = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "mistralai/mistral-7b-instruct",
            messages: [
              {
                role: "system",
                content: `You are an expert educator specializing in ${category}. Create engaging, educational content that is clear, practical, and immediately applicable. Format your response as JSON:
{
  "summary": "A comprehensive explanation (2-3 paragraphs) with practical applications",
  "key_points": ["Key point 1", "Key point 2", "Key point 3", "Key point 4"],
  "quiz": {
    "question": "A practical question",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "The correct option"
  }
}`
              },
              {
                role: "user",
                content: `Create educational content about "${topic}" in the ${category} category.`
              }
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: 60000
          }
        );

        const rawContent = lessonResponse.data.choices[0].message.content;
        let cleanedContent;
        let lessonData;
        
        try {
          cleanedContent = extractJSONFromResponse(rawContent);
          lessonData = JSON.parse(cleanedContent);
        } catch (parseError) {
          // If JSON parsing fails, try to fix it more aggressively
          console.log(`⚠️ JSON parse error for "${topic}", attempting recovery...`);
          
          // Try to extract and fix the JSON more carefully
          cleanedContent = extractJSONFromResponse(rawContent);
          
          // Additional fix: ensure all string values are properly escaped
          try {
            lessonData = JSON.parse(cleanedContent);
          } catch (e2) {
            // Last resort: try to reconstruct valid JSON
            const summaryMatch = cleanedContent.match(/"summary"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
            const keyPointsMatch = cleanedContent.match(/"key_points"\s*:\s*\[(.*?)\]/s);
            const quizMatch = cleanedContent.match(/"quiz"\s*:\s*\{([^}]+)\}/s);
            
            if (summaryMatch && quizMatch) {
              lessonData = {
                summary: summaryMatch[1].replace(/\\n/g, ' ').replace(/\\r/g, ' ').replace(/\\t/g, ' ').trim(),
                key_points: keyPointsMatch ? keyPointsMatch[1].split(',').map(kp => kp.trim().replace(/^["']|["']$/g, '')) : [],
                quiz: {
                  question: "What is the main concept discussed?",
                  options: ["Option A", "Option B", "Option C", "Option D"],
                  correct_answer: "Option A"
                }
              };
              console.log(`✅ Recovered JSON for "${topic}"`);
            } else {
              throw new Error(`Failed to parse or recover JSON: ${e2.message}`);
            }
          }
        }

        // Validate lesson data
        if (!lessonData.summary || !lessonData.quiz) {
          throw new Error('Invalid lesson data structure');
        }

        // Save to database
        const result = await db.query(
          `INSERT INTO generated_topics (user_id, category, topic, summary, quiz_data, key_points)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, topic, category, created_at`,
          [
            targetUserId,
            category,
            topic,
            lessonData.summary,
            JSON.stringify(lessonData.quiz),
            JSON.stringify(lessonData.key_points || [])
          ]
        );

        generatedTopics.push(result.rows[0]);
        
        // Update progress
        const progressUpdate = generationProgress.get(genId);
        if (progressUpdate) {
          progressUpdate.completed = i + 1;
          progressUpdate.generated.push(result.rows[0]);
          generationProgress.set(genId, progressUpdate);
        }
        
        console.log(`✅ Generated lesson ${i + 1}/${topics.length}: ${topic}`);

        // Small delay to avoid rate limiting
        if (i < topics.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`❌ Error generating lesson for "${topic}":`, error.message);
        errors.push({ topic, error: error.message });
        
        // Update progress - mark topic as failed
        const progressUpdate = generationProgress.get(genId);
        if (progressUpdate) {
          progressUpdate.failed++;
          progressUpdate.errors.push({ topic, error: error.message });
          if (progressUpdate.topicStatuses && progressUpdate.topicStatuses[i]) {
            progressUpdate.topicStatuses[i].status = 'failed';
            progressUpdate.topicStatuses[i].error = error.message;
          }
          generationProgress.set(genId, progressUpdate);
        }
      }
    }

    // Mark as complete
    const finalProgress = generationProgress.get(genId);
    if (finalProgress) {
      finalProgress.status = 'completed';
      finalProgress.current = null;
      generationProgress.set(genId, finalProgress);
    }

    // Clean up progress after 5 minutes
    setTimeout(() => {
      generationProgress.delete(genId);
    }, 5 * 60 * 1000);

    res.json({
      message: `Successfully generated ${generatedTopics.length} lesson(s)`,
      generated: generatedTopics,
      errors: errors.length > 0 ? errors : undefined,
      totalRequested: topics.length,
      totalGenerated: generatedTopics.length,
      progressId: genId
    });
  } catch (error) {
    console.error("Error generating topics from list:", error);
    res.status(500).json({ error: "Failed to generate topics", details: error.message });
  }
});

// Get generation progress
router.get("/generate-progress/:progressId", adminAuth, async (req, res) => {
  try {
    const { progressId } = req.params;
    const progress = generationProgress.get(progressId);
    
    if (!progress) {
      return res.status(404).json({ error: "Progress not found" });
    }
    
    res.json(progress);
  } catch (error) {
    console.error("Error getting progress:", error);
    res.status(500).json({ error: "Failed to get progress" });
  }
});

// Legacy endpoint - kept for backwards compatibility
router.post("/generate-topics", adminAuth, async (req, res) => {
  try {
    const { count, category, userId } = req.body;

    const topicCount = parseInt(count) || 5;
    const maxCount = 50; // Limit to prevent abuse
    const actualCount = Math.min(topicCount, maxCount);

    if (actualCount < 1) {
      return res.status(400).json({ error: "Count must be at least 1" });
    }

    const targetUserId = userId || req.user.userId;
    const targetCategory = category || null;

    console.log(`🔄 Admin generating ${actualCount} topics${targetCategory ? ` in category: ${targetCategory}` : ' (random categories)'}`);

    const generatedTopics = [];
    const errors = [];

    // Generate topics in batches to avoid overwhelming the API
    for (let i = 0; i < actualCount; i++) {
      try {
        // Generate a random topic suggestion
        let topicPrompt;
        if (targetCategory) {
          topicPrompt = `Generate a specific, interesting educational topic in the ${targetCategory} category. The topic should be something people would want to learn about. Return ONLY the topic name, nothing else. Examples: "Quantum Computing Basics", "Ancient Roman Architecture", "Machine Learning for Beginners".`;
        } else {
          topicPrompt = `Generate a specific, interesting educational topic in any category (Science, Technology, History, Arts, Business, Health, etc.). The topic should be something people would want to learn about. Return ONLY the topic name, nothing else. Examples: "Quantum Computing Basics", "Ancient Roman Architecture", "Machine Learning for Beginners".`;
        }

        const topicResponse = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "mistralai/mistral-7b-instruct",
            messages: [
              {
                role: "system",
                content: "You are a topic generator. Generate interesting, educational topics that people would want to learn about. Return ONLY the topic name, no additional text or explanation."
              },
              {
                role: "user",
                content: topicPrompt
              }
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: 30000
          }
        );

        const topic = topicResponse.data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

        // Determine category if not provided
        let finalCategory = targetCategory;
        if (!finalCategory) {
          const categoryResponse = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              model: "mistralai/mistral-7b-instruct",
              messages: [
                {
                  role: "system",
                  content: "You are a categorization expert. Categorize educational topics into one of these categories: Science, Technology, History, Arts, Business, Health, Education, Sports, Travel, Food, General. Return ONLY the category name, nothing else."
                },
                {
                  role: "user",
                  content: `Categorize this topic: "${topic}"`
                }
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
              },
              timeout: 30000
            }
          );

          let categoryText = categoryResponse.data.choices[0].message.content.trim();
          // Remove any explanations in brackets
          finalCategory = categoryText.split('(')[0].trim();
        }

        // Generate lesson content for the topic
        const lessonResponse = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "mistralai/mistral-7b-instruct",
            messages: [
              {
                role: "system",
                content: `You are an expert educator specializing in ${finalCategory}. Create engaging, educational content that is clear, practical, and immediately applicable. Format your response as JSON:
{
  "summary": "A comprehensive explanation (2-3 paragraphs) with practical applications",
  "key_points": ["Key point 1", "Key point 2", "Key point 3", "Key point 4"],
  "quiz": {
    "question": "A practical question",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "The correct option"
  }
}`
              },
              {
                role: "user",
                content: `Create educational content about "${topic}" in the ${finalCategory} category.`
              }
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: 60000
          }
        );

        const rawContent = lessonResponse.data.choices[0].message.content;
        const cleanedContent = extractJSONFromResponse(rawContent);
        const lessonData = JSON.parse(cleanedContent);

        // Save to database
        const result = await db.query(
          `INSERT INTO generated_topics (user_id, category, topic, summary, quiz_data, key_points)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, topic, category, created_at`,
          [
            targetUserId,
            finalCategory,
            topic,
            lessonData.summary,
            JSON.stringify(lessonData.quiz),
            JSON.stringify(lessonData.key_points || [])
          ]
        );

        generatedTopics.push(result.rows[0]);
        console.log(`✅ Generated topic ${i + 1}/${actualCount}: ${topic}`);

        // Small delay to avoid rate limiting
        if (i < actualCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`❌ Error generating topic ${i + 1}:`, error.message);
        errors.push({ index: i + 1, error: error.message });
      }
    }

    res.json({
      message: `Successfully generated ${generatedTopics.length} topic(s)`,
      generated: generatedTopics,
      errors: errors.length > 0 ? errors : undefined,
      totalRequested: actualCount,
      totalGenerated: generatedTopics.length
    });
  } catch (error) {
    console.error("Error generating topics:", error);
    res.status(500).json({ error: "Failed to generate topics", details: error.message });
  }
});

module.exports = router;
