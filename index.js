const express = require("express");
const authRoutes = require("./routes/auth");
const lessonsRoutes = require("./routes/lessons");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static audio files
app.use("/audio", express.static("public/audio"));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/lessons", lessonsRoutes);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
