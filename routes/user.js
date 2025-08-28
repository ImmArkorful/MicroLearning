const express = require("express");
const router = express.Router();
const db = require("../db"); // Uncommented to use real database
const authenticateToken = require("../middleware/auth");

// Get user profile and progress
router.get("/profile", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  // Mock user profile data for testing
  const mockProfile = {
    user: {
      id: userId,
      email: "test@example.com",
      created_at: new Date().toISOString()
    },
    stats: {
      total_lessons_viewed: 5,
      total_favorites: 2,
      last_activity: new Date().toISOString()
    },
    recentLessons: [
      {
        id: 1,
        title: "The Fascinating World of Quantum Computing",
        viewed_at: new Date().toISOString(),
        is_favorite: true
      },
      {
        id: 2,
        title: "Introduction to Machine Learning",
        viewed_at: new Date(Date.now() - 86400000).toISOString(),
        is_favorite: false
      }
    ]
  };
  
  res.json(mockProfile);
});

// Get user's favorite lessons
router.get("/favorites", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const result = await db.query(`
      SELECT 
        l.id,
        l.title,
        ul.created_at as viewed_at
      FROM user_lessons ul
      JOIN lessons l ON ul.lesson_id = l.id
      WHERE ul.user_id = $1 AND ul.is_favorite = true
      ORDER BY ul.created_at DESC
    `, [userId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching favorites:", error);
    res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

// Get user's learning history
router.get("/history", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { limit = 20, offset = 0 } = req.query;
  
  try {
    const result = await db.query(`
      SELECT 
        l.id,
        l.title,
        ul.created_at as viewed_at,
        ul.is_favorite
      FROM user_lessons ul
      JOIN lessons l ON ul.lesson_id = l.id
      WHERE ul.user_id = $1
      ORDER BY ul.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, parseInt(limit), parseInt(offset)]);
    
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching learning history:", error);
    res.status(500).json({ error: "Failed to fetch learning history" });
  }
});

// Update user preferences (for future use)
router.put("/preferences", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { preferences } = req.body;
  
  try {
    // For MVP, we'll just store preferences as JSON in a new column
    // You might want to add a preferences column to the users table
    res.json({ message: "Preferences updated successfully" });
  } catch (error) {
    console.error("Error updating preferences:", error);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

// Get learning streak and achievements
router.get("/achievements", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    // Calculate current streak
    const streakResult = await db.query(`
      WITH daily_activity AS (
        SELECT DISTINCT DATE(created_at) as activity_date
        FROM user_lessons 
        WHERE user_id = $1
        ORDER BY activity_date DESC
      ),
      streak_calc AS (
        SELECT 
          activity_date,
          ROW_NUMBER() OVER (ORDER BY activity_date DESC) as rn,
          activity_date + ROW_NUMBER() OVER (ORDER BY activity_date DESC) * INTERVAL '1 day' as expected_date
        FROM daily_activity
      )
      SELECT COUNT(*) as current_streak
      FROM streak_calc
      WHERE activity_date = expected_date::date
    `, [userId]);
    
    // Get total lessons completed
    const totalLessonsResult = await db.query(`
      SELECT COUNT(*) as total_lessons
      FROM user_lessons 
      WHERE user_id = $1
    `, [userId]);
    
    const currentStreak = streakResult.rows[0]?.current_streak || 0;
    const totalLessons = totalLessonsResult.rows[0]?.total_lessons || 0;
    
    // Calculate achievements
    const achievements = [];
    
    if (totalLessons >= 1) achievements.push({ id: "first_lesson", name: "First Steps", description: "Complete your first lesson" });
    if (totalLessons >= 10) achievements.push({ id: "learner", name: "Curious Learner", description: "Complete 10 lessons" });
    if (totalLessons >= 50) achievements.push({ id: "dedicated", name: "Dedicated Student", description: "Complete 50 lessons" });
    if (currentStreak >= 3) achievements.push({ id: "streak_3", name: "Getting Started", description: "3-day learning streak" });
    if (currentStreak >= 7) achievements.push({ id: "streak_7", name: "Week Warrior", description: "7-day learning streak" });
    if (currentStreak >= 30) achievements.push({ id: "streak_30", name: "Monthly Master", description: "30-day learning streak" });
    
    res.json({
      currentStreak,
      totalLessons,
      achievements
    });
  } catch (error) {
    console.error("Error fetching achievements:", error);
    res.status(500).json({ error: "Failed to fetch achievements" });
  }
});

module.exports = router;
