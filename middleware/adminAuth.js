const jwt = require("jsonwebtoken");
const db = require("../db");
require("dotenv").config();

// Admin authentication middleware
// First authenticates the token, then checks if user has admin role
const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Authentication token missing." });
    }

    // Verify JWT token
    jwt.verify(token, process.env.JWT_SECRET || "fallback_secret", async (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: "Invalid or expired token." });
      }

      // Get user from database to check role
      try {
        const userResult = await db.query(
          "SELECT id, email, role FROM users WHERE id = $1",
          [decoded.userId]
        );

        if (userResult.rows.length === 0) {
          return res.status(403).json({ error: "User not found." });
        }

        const user = userResult.rows[0];

        // Check if user has admin role
        if (user.role !== 'admin') {
          return res.status(403).json({ error: "Access denied. Admin privileges required." });
        }

        // Attach user info to request
        req.user = {
          userId: user.id,
          email: user.email,
          role: user.role
        };

        next();
      } catch (dbError) {
        console.error("Database error in adminAuth:", dbError);
        return res.status(500).json({ error: "Internal server error." });
      }
    });
  } catch (error) {
    console.error("Error in adminAuth middleware:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

module.exports = adminAuth;
