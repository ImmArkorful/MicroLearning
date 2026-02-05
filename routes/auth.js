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
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role, created_at",
      [email, passwordHash]
    );

    const userData = newUser.rows[0];

    // Initialize onboarding profile for the new user.
    await db.query(
      `INSERT INTO user_onboarding_profiles (
         user_id, learning_goal, experience_level, interests, weekly_target_sessions
       )
       VALUES ($1, NULL, NULL, $2, 3)
       ON CONFLICT (user_id) DO NOTHING`,
      [userData.id, JSON.stringify([])]
    );

    // Store topic preferences in the current JSON-array format.
    if (topicPreferences && Array.isArray(topicPreferences)) {
      await db.query(
        `INSERT INTO user_preferences (user_id, preference_key, preference_value)
         VALUES ($1, 'topic_preferences', $2)
         ON CONFLICT (user_id, preference_key)
         DO UPDATE SET preference_value = EXCLUDED.preference_value, updated_at = CURRENT_TIMESTAMP`,
        [userData.id, JSON.stringify(topicPreferences)]
      );
    }

    const token = jwt.sign(
      { userId: userData.id, email: userData.email },
      process.env.JWT_SECRET || "fallback_secret"
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: userData.id,
        email: userData.email,
        role: userData.role || 'user', // Include role in response
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
      process.env.JWT_SECRET || "fallback_secret"
    );

    res.json({
      message: "Logged in successfully",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role || 'user', // Include role in response
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
    console.log('📝 Updating topic preferences for user:', userId);
    console.log('📝 Preferences received:', topicPreferences);
    
    // Store all preferences as a JSON array in a single row
    const preferencesJson = JSON.stringify(topicPreferences || []);
    
    // Use UPSERT (INSERT ... ON CONFLICT) to handle both insert and update
    const result = await db.query(
      `INSERT INTO user_preferences (user_id, preference_key, preference_value) 
       VALUES ($1, 'topic_preferences', $2)
       ON CONFLICT (user_id, preference_key) 
       DO UPDATE SET preference_value = $2, updated_at = CURRENT_TIMESTAMP`,
      [userId, preferencesJson]
    );
    
    console.log('✅ Topic preferences updated successfully');
    res.json({ 
      message: "Topic preferences updated successfully",
      topicPreferences 
    });
  } catch (error) {
    console.error("❌ Error updating topic preferences:", error);
    console.error("❌ Error details:", error.message);
    console.error("❌ Error stack:", error.stack);
    res.status(500).json({ 
      error: "Failed to update topic preferences.",
      details: error.message 
    });
  }
});

// Get user topic preferences
router.get("/preferences/topics", authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await db.query(
      "SELECT preference_value FROM user_preferences WHERE user_id = $1 AND preference_key = 'topic_preferences'",
      [userId]
    );

    // Parse the JSON array from the stored value
    let topicPreferences = [];
    if (result.rows.length > 0) {
      try {
        topicPreferences = JSON.parse(result.rows[0].preference_value);
      } catch (parseError) {
        console.error("Error parsing topic preferences JSON:", parseError);
        topicPreferences = [];
      }
    }
    
    res.json({ topicPreferences });
  } catch (error) {
    console.error("Error fetching topic preferences:", error);
    res.status(500).json({ error: "Failed to fetch topic preferences." });
  }
});

// App version check endpoint
router.get("/app-version", async (req, res) => {
  try {
    const clientVersion = req.query.version || "0.0.0";
    
    // Get the latest app version from database
    const versionQuery = `
      SELECT * FROM app_versions 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const versionResult = await db.query(versionQuery);
    
    if (versionResult.rows.length === 0) {
      return res.json({
        current_version: "0.0.1",
        min_supported_version: "0.0.1",
        client_version: clientVersion,
        needs_update: false,
        force_update: false,
        update_url: null,
        release_notes: null,
      });
    }
    
    const latestVersion = versionResult.rows[0];
    
    // Helper function to compare version strings
    const compareVersions = (v1, v2) => {
      const parts1 = v1.split('.').map(Number);
      const parts2 = v2.split('.').map(Number);
      
      for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;
        if (part1 < part2) return -1;
        if (part1 > part2) return 1;
      }
      return 0;
    };
    
    const needsUpdate = compareVersions(clientVersion, latestVersion.version) < 0;
    const isOutdated = compareVersions(clientVersion, latestVersion.min_supported_version) < 0;
    const forceUpdate = isOutdated && latestVersion.is_force_update;
    
    res.json({
      current_version: latestVersion.version,
      min_supported_version: latestVersion.min_supported_version,
      client_version: clientVersion,
      needs_update: needsUpdate,
      force_update: forceUpdate,
      update_url: latestVersion.update_url,
      release_notes: latestVersion.release_notes,
    });
  } catch (error) {
    console.error("Error checking app version:", error);
    res.status(500).json({ error: "Failed to check app version" });
  }
});

module.exports = router;
