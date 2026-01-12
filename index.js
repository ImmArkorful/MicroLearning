const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const authRoutes = require("./routes/auth");
const lessonsRoutes = require("./routes/lessons");
const userRoutes = require("./routes/user");
const adminRoutes = require("./routes/admin");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

// CORS configuration
const defaultAllowedOrigins = new Set([
  "http://localhost:*",
  "http://127.0.0.1:*",
  "https://microlearning-web-jet.vercel.app",
  "https://microlearnhub.com",
  "https://www.microlearnhub.com",
]);

// Add any additional origins from environment variable
if (process.env.FRONTEND_URL) {
  process.env.FRONTEND_URL.split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .forEach((url) => defaultAllowedOrigins.add(url));
}

const allowAllOrigins =
  process.env.ALLOW_ALL_ORIGINS === "true" ||
  defaultAllowedOrigins.has("*");

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);

    if (allowAllOrigins) {
      return callback(null, true);
    }

    // Check exact match first
    if (defaultAllowedOrigins.has(origin)) {
      return callback(null, true);
    }

    // Check wildcard patterns (e.g., "http://localhost:*")
    for (const allowedOrigin of defaultAllowedOrigins) {
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.replace('*', '.*');
        const regex = new RegExp(`^${pattern}$`);
        if (regex.test(origin)) {
          return callback(null, true);
        }
      }
    }

    console.log("🚫 CORS blocked origin:", origin);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
};

app.use(cors(corsOptions));

// Logging middleware
app.use(morgan("combined"));

// Log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`🌐 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'No origin'} - User-Agent: ${req.headers['user-agent']?.substring(0, 50) || 'No User-Agent'}`);
  next();
});

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static audio files
app.use("/audio", express.static("public/audio"));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/lessons", lessonsRoutes);
app.use("/api/user", userRoutes);
app.use("/api/admin", adminRoutes);

// Mock health check for testing
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "LearnFlow API is running!" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: "Something went wrong!", 
    message: process.env.NODE_ENV === "development" ? err.message : "Internal server error"
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server is running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:8081"}`);
  console.log(`🌐 External access: http://13.218.173.57:${PORT}`);
});
