const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
require("dotenv").config();

// Register a new user
router.post("/register", async (req, res) => {
  const { email, password } = req.body;
  const saltRounds = 10;
  try {
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const result = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, passwordHash]
    );
    const user = result.rows[0];
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.status(201).json({
      message: "User registered successfully",
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error("Registration error:", error);
    if (error.code === "23505") {
      return res.status(400).json({ error: "Email already exists." });
    }
    res.status(500).json({ error: "Internal server error." });
  }
});

// Login a user
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.json({
      message: "Logged in successfully",
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
