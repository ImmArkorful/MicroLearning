const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Test routes
app.get("/", (req, res) => {
  res.json({ message: "LearnFlow API is running!" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "LearnFlow API is healthy!" });
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  
  if (email === "test@example.com" && password === "password") {
    res.json({
      message: "Logged in successfully",
      token: "mock-jwt-token",
      user: { 
        id: 1, 
        email: email,
        created_at: new Date().toISOString()
      },
    });
  } else {
    res.status(401).json({ error: "Invalid credentials. Use test@example.com / password" });
  }
});

app.get("/api/lessons/new", (req, res) => {
  res.json({
    lesson: { 
      id: Math.floor(Math.random() * 1000) + 1, 
      title: "The Fascinating World of Quantum Computing" 
    },
    version: {
      id: Math.floor(Math.random() * 1000) + 1,
      content: "Quantum computing represents a revolutionary approach to processing information...",
      quiz_data: {
        questions: [
          {
            question: "What is the fundamental unit of quantum computing?",
            options: ["Bit", "Qubit", "Byte", "Pixel"],
            correctAnswer: "Qubit"
          }
        ]
      },
      audio_url: "/audio/mock-lesson.mp3",
      version_number: 1,
      status: "approved"
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Simple LearnFlow server running on http://localhost:${PORT}`);
  console.log(`📱 Test login: test@example.com / password`);
});
