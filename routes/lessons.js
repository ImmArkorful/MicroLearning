const express = require("express");
const router = express.Router();
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const db = require("../db");
const authenticateToken = require("../middleware/auth");
require("dotenv").config();

// Create a directory for mock audio storage
const audioDir = path.join(__dirname, "../public/audio");
fs.mkdir(audioDir, { recursive: true });

// A simple helper function to mock audio generation.
// In a real application, this would call your TTS API and save the file.
const generateAudio = async (content) => {
  console.log("MOCK: Calling TTS API to generate audio...");
  // Simulate an API call and file saving.
  return `/audio/lesson-${Date.now()}.mp3`;
};

// Endpoint to generate and create a new bit-sized lesson
// This now creates a master lesson record and its first version.
router.get("/new", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const prompt = `Generate a concise, interesting, bit-sized learning topic. 
  Provide a title, a short explanation (around 200 words), and two multiple-choice quiz questions with a correct answer. Use this format: Title: ..., Explanation: ..., Quiz: ...`;

  try {
    // --- Step 1: Call OpenRouter API to generate lesson text ---
    console.log("Calling OpenRouter API...");
    const openrouterResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "system",
            content:
              "You are an educational assistant that creates short, bit-sized learning lessons.",
          },
          { role: "user", content: prompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const llmContent = openrouterResponse.data.choices[0].message.content;
    const parsedContent = parseLLMResponse(llmContent);

    if (!parsedContent) {
      return res
        .status(500)
        .json({ error: "Failed to parse AI-generated content." });
    }

    // --- Step 2: Generate audio (now using our mock helper) ---
    const audioUrl = await generateAudio(parsedContent.content);

    // --- Step 3: Insert into the lessons and lesson_versions tables ---
    // First, create the master lesson record.
    const lessonResult = await db.query(
      `INSERT INTO lessons (title) VALUES ($1) RETURNING id`,
      [parsedContent.title]
    );
    const lessonId = lessonResult.rows[0].id;

    // Then, create the first version of the lesson.
    const newVersionResult = await db.query(
      `INSERT INTO lesson_versions (lesson_id, content, quiz_data, audio_url, version_number, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_review') RETURNING *`,
      [
        lessonId,
        parsedContent.content,
        parsedContent.quiz_data,
        "audioUrl",
        1,
        userId,
      ]
    );
    const newVersion = newVersionResult.rows[0];

    // Finally, update the master lesson to point to this new version.
    await db.query(`UPDATE lessons SET current_version_id = $1 WHERE id = $2`, [
      newVersion.id,
      lessonId,
    ]);

    // --- Step 4: Log the lesson as viewed by the user ---
    await db.query(
      "INSERT INTO user_lessons (user_id, lesson_id, viewed_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING",
      [userId, lessonId]
    );

    res.json({
      lesson: { id: lessonId, title: parsedContent.title },
      version: newVersion,
    });
  } catch (error) {
    console.error(
      "Error generating new lesson:",
      error.response ? error.response.data : error.message
    );
    res
      .status(500)
      .json({ error: "Failed to generate a new lesson. Please try again." });
  }
});

// Endpoint to get the current version of a lesson
router.get("/:lessonId", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  try {
    const lesson = await db.query(
      `SELECT l.id, l.title, lv.id as version_id, lv.content, lv.quiz_data, lv.audio_url, lv.version_number
       FROM lessons l
       JOIN lesson_versions lv ON l.current_version_id = lv.id
       WHERE l.id = $1`,
      [lessonId]
    );
    if (lesson.rowCount === 0)
      return res.status(404).send("Lesson or current version not found.");

    res.json(lesson.rows[0]);
  } catch (err) {
    console.error("Error fetching lesson:", err);
    res.status(500).send("Internal server error.");
  }
});

router.post("/:lessonId/revisefromllm", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  const { revisionPrompt } = req.body;
  const userId = req.user.userId;

  try {
    // 1. Get the current lesson's content
    const currentLesson = await db.query(
      `SELECT lv.content, lv.version_number
         FROM lessons l
         JOIN lesson_versions lv ON l.current_version_id = lv.id
         WHERE l.id = $1`,
      [lessonId]
    );

    if (currentLesson.rowCount === 0) {
      return res.status(404).send("Lesson not found.");
    }
    const oldContent = currentLesson.rows[0].content;
    const oldVersionNumber = currentLesson.rows[0].version_number;
    const newVersionNumber = oldVersionNumber + 1;

    // 2. Call OpenRouter API with a revision prompt
    const revisionResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "system",
            content: "You are an assistant that revises educational content.",
          },
          {
            role: "user",
            content: `Original content: "${oldContent}"\n\nRevision instruction: "${revisionPrompt}"`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const llmContent = revisionResponse.data.choices[0].message.content;
    const parsedContent = parseLLMResponse(llmContent); // Use your existing parser

    if (!parsedContent) {
      return res
        .status(500)
        .json({ error: "Failed to parse AI-revised content." });
    }

    // 3. Continue with the existing logic to create a new version
    const newAudioUrl = await generateAudio(parsedContent.content);

    const newVersionResult = await db.query(
      `INSERT INTO lesson_versions (lesson_id, content, quiz_data, audio_url, version_number, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending_review') RETURNING id`,
      [
        lessonId,
        parsedContent.content,
        parsedContent.quiz_data,
        newAudioUrl,
        newVersionNumber,
        userId,
      ]
    );
    const newVersionId = newVersionResult.rows[0].id;

    await db.query("UPDATE lessons SET current_version_id = $1 WHERE id = $2", [
      newVersionId,
      lessonId,
    ]);

    res.status(201).json({
      message: `Revision ${newVersionNumber} created.`,
      lessonId,
      versionId: newVersionId,
      versionNumber: newVersionNumber,
    });
  } catch (err) {
    console.error("Error revising lesson:", err);
    res.status(500).send("Error revising lesson.");
  }
});

// Endpoint to create a new version (revision) of an existing lesson
router.post("/:lessonId/revise", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  const { content, quiz_data } = req.body;
  const userId = req.user.userId;

  try {
    // Get the current version to determine the new version number
    const lesson = await db.query(
      "SELECT current_version_id FROM lessons WHERE id = $1",
      [lessonId]
    );
    if (lesson.rowCount === 0) return res.status(404).send("Lesson not found.");

    const currentVersion = await db.query(
      "SELECT version_number FROM lesson_versions WHERE id = $1",
      [lesson.rows[0].current_version_id]
    );
    const newVersionNumber = currentVersion.rows[0].version_number + 1;

    // Generate new audio for the revised content
    const newAudioUrl = await generateAudio(content);

    // Create the new version
    const newVersionResult = await db.query(
      `INSERT INTO lesson_versions (lesson_id, content, quiz_data, audio_url, version_number, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_review') RETURNING id`,
      [lessonId, content, quiz_data, newAudioUrl, newVersionNumber, userId]
    );
    const newVersionId = newVersionResult.rows[0].id;

    // Update the master lesson to point to this new version
    await db.query("UPDATE lessons SET current_version_id = $1 WHERE id = $2", [
      newVersionId,
      lessonId,
    ]);

    res.status(201).json({
      message: `Revision ${newVersionNumber} created.`,
      lessonId,
      versionId: newVersionId,
      versionNumber: newVersionNumber,
    });
  } catch (err) {
    console.error("Error revising lesson:", err);
    res.status(500).send("Error revising lesson.");
  }
});

// Endpoint to get the history of all versions for a lesson
router.get("/:lessonId/history", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  try {
    const history = await db.query(
      `SELECT id, version_number, status, created_at, created_by
       FROM lesson_versions
       WHERE lesson_id = $1
       ORDER BY version_number DESC`,
      [lessonId]
    );
    if (history.rowCount === 0)
      return res.status(404).send("Lesson history not found.");

    res.json(history.rows);
  } catch (err) {
    console.error("Error fetching lesson history:", err);
    res.status(500).send("Internal server error.");
  }
});

// Endpoint for an Admin/SME to approve a specific version
// This would need a separate admin authentication middleware
router.post("/:lessonId/review", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  const { version_id, status } = req.body; // status should be 'approved' or 'rejected'

  // TODO: Add logic to check if the user has admin/SME role
  if (!["approved", "rejected"].includes(status)) {
    return res.status(400).send("Invalid status provided.");
  }

  try {
    const result = await db.query(
      `UPDATE lesson_versions SET status = $1 WHERE id = $2 AND lesson_id = $3 RETURNING id`,
      [status, version_id, lessonId]
    );

    if (result.rowCount === 0) {
      return res.status(404).send("Version not found.");
    }

    // If the version is approved, update the main lesson record to point to it
    if (status === "approved") {
      await db.query(
        `UPDATE lessons SET current_version_id = $1 WHERE id = $2`,
        [version_id, lessonId]
      );
    }

    res.json({ message: `Version ${version_id} status updated to ${status}.` });
  } catch (err) {
    console.error("Error reviewing lesson:", err);
    res.status(500).send("Internal server error.");
  }
});

// A simple utility to parse the LLM's response.
// This function needs to be tailored to your prompt and LLM.
function parseLLMResponse(text) {
  try {
    const title = text.match(/Title:\s*(.*)/)?.[1]?.trim();
    const content = text.match(/Explanation:\s*([\s\S]*?)Quiz:/)?.[1]?.trim();
    const quizText = text.match(/Quiz:\s*([\s\S]*)/)?.[1]?.trim();
    // A robust parser would be more complex and handle different formats.
    if (!title || !content || !quizText) {
      throw new Error("Failed to extract all components from the response.");
    }
    return {
      title,
      content,
      quiz_data: { quizText },
    };
  } catch (e) {
    console.error("Parsing failed:", e);
    return null;
  }
}

// Endpoint to mark a lesson as a favorite
router.post("/favorite", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { lessonId, isFavorite } = req.body;

  try {
    const query = `
      INSERT INTO user_lessons (user_id, lesson_id, is_favorite)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, lesson_id)
      DO UPDATE SET is_favorite = EXCLUDED.is_favorite;
    `;
    await db.query(query, [userId, lessonId, isFavorite]);
    res.status(200).json({ message: "Favorite status updated." });
  } catch (error) {
    console.error("Error updating favorite status:", error);
    res.status(500).json({ error: "Failed to update favorite status." });
  }
});

module.exports = router;
