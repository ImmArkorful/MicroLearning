const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db"); // Uncommented to use real database
require("dotenv").config();

// Middleware to authenticate JWT tokens
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Authentication token missing." });
  }

  jwt.verify(token, process.env.JWT_SECRET || "fallback_secret", (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token." });
    }
    req.user = user;
    next();
  });
};

// Register a new user
router.post("/register", async (req, res) => {
  const { email, password, topicPreferences } = req.body;

  try {
    // Validate required fields
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }
    
    if (!password) {
      return res.status(400).json({ error: "Password is required." });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }

    // Check if user already exists
    const existingUser = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "An account with this email already exists. Please use a different email or try logging in." });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, passwordHash]
    );

    const userData = newUser.rows[0];

    // Store topic preferences if provided
    if (topicPreferences && Array.isArray(topicPreferences)) {
      for (const preference of topicPreferences) {
        await db.query(
          "INSERT INTO user_preferences (user_id, preference_key, preference_value) VALUES ($1, $2, $3)",
          [userData.id, 'topic_preference', preference]
        );
      }
    }

    const token = jwt.sign(
      { userId: userData.id, email: userData.email },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "24h" }
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: userData.id,
        email: userData.email,
        created_at: userData.created_at,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Login a user
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate required fields
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }
    
    if (!password) {
      return res.status(400).json({ error: "Password is required." });
    }

    // Find user in database
    const userResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "No account found with this email address. Please check your email or create a new account." });
    }

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password. Please try again." });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "24h" }
    );

    res.json({
      message: "Logged in successfully",
      token,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

// Update user topic preferences
router.put("/preferences/topics", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topicPreferences } = req.body;

  try {
    // Remove existing topic preferences
    await db.query(
      "DELETE FROM user_preferences WHERE user_id = $1 AND preference_key = 'topic_preference'",
      [userId]
    );

    // Add new topic preferences
    if (topicPreferences && Array.isArray(topicPreferences)) {
      for (const preference of topicPreferences) {
        await db.query(
          "INSERT INTO user_preferences (user_id, preference_key, preference_value) VALUES ($1, $2, $3)",
          [userId, 'topic_preference', preference]
        );
      }
    }

    res.json({ 
      message: "Topic preferences updated successfully",
      topicPreferences 
    });
  } catch (error) {
    console.error("Error updating topic preferences:", error);
    res.status(500).json({ error: "Failed to update topic preferences." });
  }
});

// Get user topic preferences
router.get("/preferences/topics", authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await db.query(
      "SELECT preference_value FROM user_preferences WHERE user_id = $1 AND preference_key = 'topic_preference'",
      [userId]
    );

    const topicPreferences = result.rows.map(row => row.preference_value);
    res.json({ topicPreferences });
  } catch (error) {
    console.error("Error fetching topic preferences:", error);
    res.status(500).json({ error: "Failed to fetch topic preferences." });
  }
});

module.exports = router;
