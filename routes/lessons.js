const express = require("express");
const router = express.Router();
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const db = require("../db"); // Uncommented to use real database
const authenticateToken = require("../middleware/auth");
require("dotenv").config();

// Function to verify content quality using multiple AI models with optimized timeouts and cheaper models
const verifyContentQuality = async (content, topic, category) => {
  const verificationResults = {
    factualAccuracy: { score: null, feedback: "", model: "" },
    educationalValue: { score: null, feedback: "", model: "" },
    clarityAndEngagement: { score: null, feedback: "", model: "" },
    overallQuality: { score: null, feedback: "", model: "" }
  };

  // Skip verification if environment variable is set to disable it
  if (process.env.DISABLE_CONTENT_VERIFICATION === 'true') {
    console.log("⚠️ Content verification disabled by environment variable - scores will be calculated by cron job");
    return verificationResults;
  }

  // Enhanced timeout configuration for slow connections
  const TIMEOUT_CONFIG = {
    short: 15000,  // 15 seconds for quick operations
    medium: 30000, // 30 seconds for standard operations
    long: 60000,   // 60 seconds for complex operations
    retries: 2     // Number of retries for failed requests
  };

  try {
    // Helper function to make API calls with retry logic
    const makeApiCallWithRetry = async (requestConfig, operationName, maxRetries = TIMEOUT_CONFIG.retries) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🔄 ${operationName} - Attempt ${attempt}/${maxRetries}`);
          const response = await axios(requestConfig);
          console.log(`✅ ${operationName} - Success on attempt ${attempt}`);
          return response;
        } catch (error) {
          console.log(`❌ ${operationName} - Attempt ${attempt} failed:`, error.message);
          if (attempt === maxRetries) {
            throw error;
          }
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    };

    // Verification 1: Factual Accuracy using cheaper Mistral model
    console.log("🔍 Verifying factual accuracy with Mistral-7B (cheaper alternative)...");
    console.log("📝 Content to verify:", {
      topic,
      category,
      summaryLength: content.summary?.length || 0
    });
    
    let factualResponse;
    try {
      factualResponse = await makeApiCallWithRetry({
        method: 'post',
        url: "https://openrouter.ai/api/v1/chat/completions",
        data: {
          model: "mistralai/mistral-7b-instruct", // Much cheaper than Claude-3.5-Sonnet
          messages: [
            {
              role: "system",
              content: `You are an expert fact-checker. Analyze educational content for factual accuracy.

Rate 1-10:
1-3: Major factual errors
4-6: Some inaccuracies  
7-8: Generally accurate
9-10: Highly accurate

Respond with JSON:
{
  "score": number (1-10),
  "feedback": "Brief feedback about accuracy",
  "issues": ["Any factual issues"],
  "recommendations": ["Improvement suggestions"]
}`
            },
            {
              role: "user",
              content: `Topic: ${topic}
Category: ${category}
Content: ${content.summary}

Verify factual accuracy.`
            }
          ],
          max_tokens: 300 // Reduced token limit for faster response
        },
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: TIMEOUT_CONFIG.medium
      }, "Factual Accuracy Check");
    } catch (apiError) {
      console.error("❌ Factual accuracy API call failed after retries:", apiError.message);
      console.log("⚠️ Factual accuracy scoring will be done by cron job");
    }

    try {
      const responseContent = factualResponse.data.choices[0].message.content;
      console.log("🔍 Raw factual accuracy response:", responseContent);
      
      const factualResult = JSON.parse(responseContent);
      verificationResults.factualAccuracy = {
        score: factualResult.score || null,
        feedback: factualResult.feedback || "",
        model: "Mistral-7B"
      };
      console.log(`✅ Factual accuracy score: ${factualResult.score}/10`);
    } catch (parseError) {
      console.log("⚠️ Failed to parse factual accuracy response");
      console.log("Parse error:", parseError.message);
      console.log("Response content:", factualResponse.data.choices[0].message.content);
      
      // Try to extract score from response if JSON parsing fails
      const responseText = factualResponse.data.choices[0].message.content;
      const scoreMatch = responseText.match(/"score":\s*(\d+)/);
      if (scoreMatch) {
        const extractedScore = parseInt(scoreMatch[1]);
        verificationResults.factualAccuracy = {
          score: extractedScore,
          feedback: "Score extracted from response",
          model: "Mistral-7B"
        };
        console.log(`✅ Extracted factual accuracy score: ${extractedScore}/10`);
      } else {
        console.log("⚠️ Factual accuracy parsing failed - will be scored by cron job");
      }
    }

    // Verification 2: Educational Value using cheaper Llama model
    console.log("🎓 Verifying educational value with Llama-3.1 (cheaper alternative)...");
    let educationalResponse;
    try {
      educationalResponse = await makeApiCallWithRetry({
        method: 'post',
        url: "https://openrouter.ai/api/v1/chat/completions",
        data: {
          model: "meta-llama/llama-3.1-8b-instruct", // Much cheaper than GPT-4
          messages: [
            {
              role: "system",
              content: `You are an educational content evaluator. Assess educational value and learning effectiveness.

Rate 1-10:
1-3: Poor educational value
4-6: Basic educational value
7-8: Good educational value
9-10: Excellent educational value

Respond with JSON:
{
  "score": number (1-10),
  "feedback": "Brief feedback about educational value",
  "learning_objectives": ["Learning objectives achieved"],
  "improvements": ["Enhancement suggestions"]
}`
            },
            {
              role: "user",
              content: `Topic: ${topic}
Category: ${category}
Content: ${content.summary}
Quiz: ${JSON.stringify(content.quiz)}

Evaluate educational value.`
            }
          ],
          max_tokens: 300 // Reduced token limit
        },
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: TIMEOUT_CONFIG.medium
      }, "Educational Value Check");
    } catch (apiError) {
      console.error("❌ Educational value API call failed after retries:", apiError.message);
      console.log("⚠️ Educational value scoring will be done by cron job");
    }

    if (educationalResponse) {
      try {
        const educationalResult = JSON.parse(educationalResponse.data.choices[0].message.content);
        verificationResults.educationalValue = {
          score: educationalResult.score || null,
          feedback: educationalResult.feedback || "",
          model: "Llama-3.1"
        };
        console.log(`✅ Educational value score: ${educationalResult.score}/10`);
      } catch (parseError) {
        console.log("⚠️ Failed to parse educational value response - will be scored by cron job");
      }
    }

    // Verification 3: Clarity and Engagement using Llama-3.1
    console.log("📝 Verifying clarity and engagement with Llama-3.1...");
    let clarityResponse;
    try {
      clarityResponse = await makeApiCallWithRetry({
        method: 'post',
        url: "https://openrouter.ai/api/v1/chat/completions",
        data: {
          model: "meta-llama/llama-3.1-8b-instruct",
          messages: [
            {
              role: "system",
              content: `You are an expert in content clarity and engagement. Evaluate communication quality.

Rate 1-10:
1-3: Very unclear, not engaging
4-6: Somewhat clear, basic engagement
7-8: Clear and engaging
9-10: Exceptionally clear, highly engaging

Respond with JSON:
{
  "score": number (1-10),
  "feedback": "Brief feedback about clarity and engagement",
  "strengths": ["Communication strengths"],
  "weaknesses": ["Areas for improvement"]
}`
            },
            {
              role: "user",
              content: `Topic: ${topic}
Category: ${category}
Content: ${content.summary}

Evaluate clarity and engagement.`
            }
          ],
          max_tokens: 300 // Reduced token limit
        },
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: TIMEOUT_CONFIG.medium
      }, "Clarity and Engagement Check");
    } catch (apiError) {
      console.error("❌ Clarity and engagement API call failed after retries:", apiError.message);
      console.log("⚠️ Clarity and engagement scoring will be done by cron job");
    }

    if (clarityResponse) {
      try {
        const clarityResult = JSON.parse(clarityResponse.data.choices[0].message.content);
        verificationResults.clarityAndEngagement = {
          score: clarityResult.score || null,
          feedback: clarityResult.feedback || "",
          model: "Llama-3.1"
        };
        console.log(`✅ Clarity and engagement score: ${clarityResult.score}/10`);
      } catch (parseError) {
        console.log("⚠️ Failed to parse clarity response - will be scored by cron job");
      }
    }

    // Calculate overall quality score (PRIMARY SCORE) - only if we have scores
    const scores = [
      verificationResults.factualAccuracy.score,
      verificationResults.educationalValue.score,
      verificationResults.clarityAndEngagement.score
    ].filter(score => score > 0).map(score => Number(score));

    if (scores.length > 0) {
      const average = scores.reduce((a, b) => a + b, 0) / scores.length;
      // Standard rounding: 6.33 → 6, 6.5 → 7, 6.67 → 7
      const roundedScore = Math.round(average);
      verificationResults.overallQuality = {
        score: roundedScore,
        feedback: `Overall quality based on ${scores.length} verification models`,
        model: "Multi-Model Average"
      };
      console.log(`🔍 DEBUG: Scores array: [${scores.join(', ')}]`);
      console.log(`🔍 DEBUG: Average: ${average}, Rounded: ${roundedScore}`);
      console.log(`📊 Overall quality score (PRIMARY): ${verificationResults.overallQuality.score}/10`);
      console.log(`📊 All scores - Factual: ${verificationResults.factualAccuracy.score}/10, Educational: ${verificationResults.educationalValue.score}/10, Clarity: ${verificationResults.clarityAndEngagement.score}/10`);
    } else {
      console.log("📊 No scores available - will be calculated by cron job");
    }

  } catch (error) {
    console.error("❌ Error during content verification:", error);
    console.log("⚠️ Verification failed - scores will be calculated by cron job");
  }

  return verificationResults;
};

// Create a directory for audio storage
const audioDir = path.join(__dirname, "../public/audio");
fs.mkdir(audioDir, { recursive: true });

// Enhanced TTS function using OpenAI's TTS API
const generateAudio = async (content, lessonId) => {
  try {
    console.log("🎵 Generating audio for lesson:", lessonId);
    
    // For MVP, we'll use OpenAI's TTS API
    const openai = require("openai");
    const client = new openai({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    const audioFileName = `lesson-${lessonId}-${uuidv4()}.mp3`;
    const audioFilePath = path.join(audioDir, audioFileName);
    
    const mp3 = await client.audio.speech.create({
      model: "tts-1",
      voice: "alloy",
      input: content,
    });
    
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.writeFile(audioFilePath, buffer);
    
    console.log("✅ Audio generated successfully:", audioFileName);
    return `/audio/${audioFileName}`;
  } catch (error) {
    console.error("❌ Error generating audio:", error);
    // Fallback to mock audio for development
    return `/audio/mock-${Date.now()}.mp3`;
  }
};

// Endpoint to generate and create a new bit-sized lesson
router.get("/new", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    // Generate lesson content using OpenRouter API
    const lessonResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "system",
            content: "You are an educational content creator. Create engaging, bite-sized lessons (2-3 minutes to read) with clear explanations and interactive quizzes. Format your response as: Title: [Lesson Title], Explanation: [Content], Quiz: [Question] [Options] [Correct Answer]",
          },
          {
            role: "user",
            content: "Create a lesson about a fascinating topic in science, technology, history, or any educational subject. Make it engaging and include a quiz.",
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 60000 // 60 seconds timeout for content generation
      }
    );

    const llmContent = lessonResponse.data.choices[0].message.content;
    const parsedContent = parseLLMResponse(llmContent);

    if (!parsedContent) {
      return res.status(500).json({ error: "Failed to generate lesson content." });
    }

    // Generate audio for the lesson
    const audioUrl = await generateAudio(parsedContent.content, uuidv4());

    // Create lesson in database
    const lessonResult = await db.query(
      "INSERT INTO lessons (title, created_by) VALUES ($1, $2) RETURNING id",
      [parsedContent.title, userId]
    );
    const lessonId = lessonResult.rows[0].id;

    // Create lesson version
    const versionResult = await db.query(
      `INSERT INTO lesson_versions (lesson_id, content, quiz_data, audio_url, version_number, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'approved') RETURNING id`,
      [lessonId, parsedContent.content, parsedContent.quiz_data, audioUrl, 1, userId]
    );
    const versionId = versionResult.rows[0].id;

    // Update lesson to point to current version
    await db.query(
      "UPDATE lessons SET current_version_id = $1 WHERE id = $2",
      [versionId, lessonId]
    );

    // Return the created lesson
    const lesson = {
      lesson: { id: lessonId, title: parsedContent.title },
      version: {
        id: versionId,
        content: parsedContent.content,
        quiz_data: parsedContent.quiz_data,
        audio_url: audioUrl,
        version_number: 1,
        status: "approved"
      }
    };

    res.json(lesson);
  } catch (error) {
    console.error("Error generating new lesson:", error);
    res.status(500).json({ error: "Failed to generate a new lesson. Please try again." });
  }
});

// Get all available categories
router.get("/categories", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, description, icon, color, sort_order 
       FROM categories 
       WHERE is_active = true 
       ORDER BY sort_order ASC, name ASC`
    );

    const categories = result.rows.map(row => ({
      id: row.name.toLowerCase(), // Use name as ID for compatibility
      name: row.name,
      description: row.description,
      icon: row.icon,
      color: row.color,
      sort_order: row.sort_order
    }));
    
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get lesson categories with topic counts
router.get("/user-topics", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  console.log('Fetching all topics from all users');

  try {
    const result = await db.query(
      `SELECT gt.id, gt.category, gt.topic, gt.summary, gt.quiz_data, gt.created_at, gt.reading_time_minutes, gt.key_points, gt.quiz_count,
              gt.is_public, gt.user_id, cvr.factual_accuracy_score, cvr.educational_value_score, cvr.clarity_engagement_score, cvr.overall_quality_score,
              cvr.verification_timestamp, tps.is_private as user_made_private
       FROM generated_topics gt
       LEFT JOIN content_verification_results cvr ON gt.id = cvr.topic_id
       LEFT JOIN topic_privacy_settings tps ON gt.id = tps.topic_id AND tps.user_id = $1
       WHERE (gt.is_public = true AND (tps.is_private IS NULL OR tps.is_private = false)) OR gt.user_id = $1
       ORDER BY gt.created_at DESC
       LIMIT 100`,
      [userId]
    );

    console.log('Database query result:', result.rows.length, 'topics from all users');
    console.log('Science topics in result:', result.rows.filter(row => row.category === 'Science').length);

    const topics = result.rows.map(row => {
      try {
        if (row.category === 'Science') {
          console.log('Processing Science topic:', row.topic, 'ID:', row.id);
        }
        return {
          id: row.id,
          category: row.category,
          topic: row.topic,
          summary: cleanSummary(row.summary),
          quiz_data: safeParseQuizData(row.quiz_data),
          reading_time_minutes: row.reading_time_minutes || 5,
          key_points: row.key_points || [],
          quiz_count: row.quiz_count || 1,
          factual_accuracy_score: row.factual_accuracy_score || null,
          educational_value_score: row.educational_value_score || null,
          clarity_engagement_score: row.clarity_engagement_score || null,
          overall_quality_score: row.overall_quality_score || null,
          verification_timestamp: row.verification_timestamp || null,
          is_public: row.is_public,
          user_id: row.user_id,
          user_made_private: row.user_made_private || false,
          created_at: row.created_at
        };
      } catch (parseError) {
        console.error('Error parsing quiz_data for topic ID:', row.id, parseError);
        return {
          id: row.id,
          category: row.category,
          topic: row.topic,
          summary: cleanSummary(row.summary),
          quiz_data: { question: 'Error parsing quiz', options: [], correct_answer: '' },
          reading_time_minutes: row.reading_time_minutes || 5,
          key_points: row.key_points || [],
          quiz_count: row.quiz_count || 1,
          factual_accuracy_score: row.factual_accuracy_score || null,
          educational_value_score: row.educational_value_score || null,
          clarity_engagement_score: row.clarity_engagement_score || null,
          overall_quality_score: row.overall_quality_score || null,
          verification_timestamp: row.verification_timestamp || null,
          is_public: row.is_public,
          user_id: row.user_id,
          user_made_private: row.user_made_private || false,
          created_at: row.created_at
        };
      }
    });

    console.log('Successfully processed', topics.length, 'topics');
    console.log('Science topics in final result:', topics.filter(topic => topic.category === 'Science').length);
    res.json(topics);
  } catch (error) {
    console.error("Error fetching user topics:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
});

// Endpoint to get topics by category (from all users)
router.get("/user-topics/:category", authenticateToken, async (req, res) => {
  const { category } = req.params;
  const userId = req.user.userId;

  console.log('Fetching topics for category:', category, 'from all users');

  try {
    console.log('Executing query for category:', category);
    
    const result = await db.query(
      `SELECT gt.id, gt.topic, gt.summary, gt.quiz_data, gt.created_at, gt.reading_time_minutes, gt.key_points, gt.quiz_count,
              gt.is_public, gt.user_id, cvr.factual_accuracy_score, cvr.educational_value_score, cvr.clarity_engagement_score, cvr.overall_quality_score,
              cvr.verification_timestamp, tps.is_private as user_made_private
       FROM generated_topics gt
       LEFT JOIN content_verification_results cvr ON gt.id = cvr.topic_id
       LEFT JOIN topic_privacy_settings tps ON gt.id = tps.topic_id AND tps.user_id = $2
       WHERE LOWER(gt.category) = LOWER($1) AND ((gt.is_public = true AND (tps.is_private IS NULL OR tps.is_private = false)) OR gt.user_id = $2)
       ORDER BY gt.created_at DESC
       LIMIT 20`,
      [category, userId]
    );

    console.log('Query result:', result.rows.length, 'topics found for category:', category);

    const topics = result.rows.map(row => {
      try {
        return {
      id: row.id,
      topic: row.topic,
      summary: cleanSummary(row.summary),
      quiz_data: safeParseQuizData(row.quiz_data),
      reading_time_minutes: row.reading_time_minutes || 5,
      key_points: row.key_points || [],
      quiz_count: row.quiz_count || 1,
          factual_accuracy_score: row.factual_accuracy_score || null,
          educational_value_score: row.educational_value_score || null,
          clarity_engagement_score: row.clarity_engagement_score || null,
          overall_quality_score: row.overall_quality_score || null,
          verification_timestamp: row.verification_timestamp || null,
          is_public: row.is_public,
          user_id: row.user_id,
          user_made_private: row.user_made_private || false,
      created_at: row.created_at
        };
      } catch (parseError) {
        console.error('Error parsing topic ID:', row.id, parseError);
        return {
          id: row.id,
          topic: row.topic,
          summary: cleanSummary(row.summary),
          quiz_data: { question: 'Error parsing quiz', options: [], correct_answer: '' },
          reading_time_minutes: row.reading_time_minutes || 5,
          key_points: row.key_points || [],
          quiz_count: row.quiz_count || 1,
          factual_accuracy_score: row.factual_accuracy_score || null,
          educational_value_score: row.educational_value_score || null,
          clarity_engagement_score: row.clarity_engagement_score || null,
          overall_quality_score: row.overall_quality_score || null,
          verification_timestamp: row.verification_timestamp || null,
          is_public: row.is_public,
          user_id: row.user_id,
          user_made_private: row.user_made_private || false,
          created_at: row.created_at
        };
      }
    });

    res.json(topics);
  } catch (error) {
    console.error("Error fetching topics by category:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
});

// Endpoint to store generated topic
router.post("/store-topic", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { category, topic, summary, quiz, key_points, topic_name, version_number, is_existing, existing_topic_id } = req.body;

  try {
    // Validate and clean category name
    let cleanCategory = category || 'General';
    if (cleanCategory.length > 255) {
      console.log(`⚠️ Category "${cleanCategory}" is too long (${cleanCategory.length} chars), truncating to 255 characters`);
      cleanCategory = cleanCategory.substring(0, 255);
    }
    // If this is an existing topic, don't store it again
    if (is_existing && existing_topic_id) {
      console.log(`Skipping storage for existing topic ID: ${existing_topic_id}`);
      res.json({
        success: true,
        topic_id: existing_topic_id,
        message: "Using existing topic content"
      });
      return;
    }

    // Use the versioned topic name if provided, otherwise use the original topic name
    const finalTopicName = topic_name || topic;

    // Check if this exact topic name already exists (to prevent duplicates)
    const existingCheck = await db.query(
      `SELECT id FROM generated_topics 
       WHERE user_id = $1 AND category = $2 AND LOWER(topic) = LOWER($3)`,
      [userId, category, finalTopicName]
    );

    if (existingCheck.rows.length > 0) {
      console.log(`Topic "${finalTopicName}" already exists, skipping storage`);
      res.json({
        success: true,
        topic_id: existingCheck.rows[0].id,
        message: "Topic already exists"
      });
      return;
    }

    // Calculate metadata
    const cleanSummaryText = cleanSummary(summary);
    const wordCount = cleanSummaryText.split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200)); // 200 words per minute
    
    // Use provided key points or extract from summary as fallback
    let keyPoints = key_points || [];
    if (!Array.isArray(keyPoints) || keyPoints.length === 0) {
      // Fallback: extract key points from summary
    const sentences = cleanSummaryText.split(/[.!?]+/).filter(s => s.trim().length > 10);
      keyPoints = sentences.slice(0, 3).map(s => s.trim()).filter(s => s.length > 0);
    }
    
    // Count quizzes
    const quizCount = Array.isArray(quiz) ? quiz.length : 1;
    
    // Verify content quality before storing (if not already verified)
    console.log("🔍 Verifying content quality before storage...");
    const verificationResults = await verifyContentQuality({ summary, quiz }, topic, category);
    
    // Check if content meets quality standards
    const qualityThreshold = 6;
    const meetsQualityStandards = verificationResults.overallQuality.score >= qualityThreshold;
    
    // New privacy logic: All content is public by default unless user makes it private
    // High factual accuracy (8+) content is always public
    const factualAccuracyThreshold = 8;
    const hasHighFactualAccuracy = verificationResults.factualAccuracy.score >= factualAccuracyThreshold;
    const isPublic = hasHighFactualAccuracy || meetsQualityStandards; // Public by default for good quality content
    
    if (!meetsQualityStandards) {
      console.log(`⚠️ Content quality below threshold (${verificationResults.overallQuality.score}/10). Content will be public by default but may need improvement.`);
    } else {
      console.log(`✅ Content quality verified (${verificationResults.overallQuality.score}/10). Content will be public.`);
    }
    
    if (hasHighFactualAccuracy) {
      console.log(`✅ High factual accuracy (${verificationResults.factualAccuracy.score}/10). Content will be public.`);
    }
    
    // Store the generated topic in the database
    const result = await db.query(
      `INSERT INTO generated_topics (user_id, category, topic, summary, quiz_data, reading_time_minutes, key_points, quiz_count, is_public, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, category, finalTopicName, summary, JSON.stringify(quiz), readingTime, JSON.stringify(keyPoints), quizCount, isPublic]
    );

    const topicId = result.rows[0].id;
    console.log(`Stored new topic: "${finalTopicName}" (ID: ${topicId}) in category: ${category}`);

    // Store verification results in database
    await db.query(
      `INSERT INTO content_verification_results (
        topic_id, user_id, 
        factual_accuracy_score, factual_accuracy_feedback, factual_accuracy_model,
        educational_value_score, educational_value_feedback, educational_value_model,
        clarity_engagement_score, clarity_engagement_feedback, clarity_engagement_model,
        overall_quality_score, overall_quality_feedback, overall_quality_model,
        meets_quality_standards
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        topicId, userId,
        verificationResults.factualAccuracy.score, verificationResults.factualAccuracy.feedback, verificationResults.factualAccuracy.model,
        verificationResults.educationalValue.score, verificationResults.educationalValue.feedback, verificationResults.educationalValue.model,
        verificationResults.clarityAndEngagement.score, verificationResults.clarityAndEngagement.feedback, verificationResults.clarityAndEngagement.model,
        verificationResults.overallQuality.score, verificationResults.overallQuality.feedback, verificationResults.overallQuality.model,
        meetsQualityStandards
      ]
    );
    console.log(`✅ Verification results stored for topic ID: ${topicId}`);

    // Record activity
    await db.query(`
      INSERT INTO user_activities (user_id, activity_type, activity_data, related_id, related_type)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      userId, 
      'topic_created', 
      JSON.stringify({
        title: finalTopicName,
        category: category,
        readingTime: readingTime,
        quizCount: quizCount
      }), 
      topicId, 
      'topic'
    ]);

    res.json({
      success: true,
      topic_id: topicId,
      category: category,
      verification_results: verificationResults,
      quality_score: verificationResults.overallQuality.score,
      factual_accuracy_score: verificationResults.factualAccuracy.score,
      meets_quality_standards: meetsQualityStandards,
      has_high_factual_accuracy: hasHighFactualAccuracy,
      is_public: isPublic,
      message: isPublic 
        ? (version_number > 1 ? `Version ${version_number} stored successfully and is now public` : "Topic stored successfully and is now public")
        : (version_number > 1 ? `Version ${version_number} stored successfully (public by default)` : "Topic stored successfully (public by default)")
    });
  } catch (error) {
    console.error("Error storing topic:", error);
    res.status(500).json({ error: "Failed to store topic" });
  }
});

// Endpoint to get verification results for a topic
router.get("/verification-results/:topicId", authenticateToken, async (req, res) => {
  const { topicId } = req.params;
  const userId = req.user.userId;

  try {
    const result = await db.query(
      `SELECT * FROM content_verification_results 
       WHERE topic_id = $1 AND user_id = $2 
       ORDER BY verification_timestamp DESC 
       LIMIT 1`,
      [topicId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Verification results not found for this topic" });
    }

    const verificationData = result.rows[0];
    
    // Format the response
    const formattedResults = {
      factualAccuracy: {
        score: verificationData.factual_accuracy_score,
        feedback: verificationData.factual_accuracy_feedback,
        model: verificationData.factual_accuracy_model
      },
      educationalValue: {
        score: verificationData.educational_value_score,
        feedback: verificationData.educational_value_feedback,
        model: verificationData.educational_value_model
      },
      clarityAndEngagement: {
        score: verificationData.clarity_engagement_score,
        feedback: verificationData.clarity_engagement_feedback,
        model: verificationData.clarity_engagement_model
      },
      overallQuality: {
        score: verificationData.overall_quality_score,
        feedback: verificationData.overall_quality_feedback,
        model: verificationData.overall_quality_model
      },
      meetsQualityStandards: verificationData.meets_quality_standards,
      verificationTimestamp: verificationData.verification_timestamp
    };

    res.json(formattedResults);
  } catch (error) {
    console.error("Error retrieving verification results:", error);
    res.status(500).json({ error: "Failed to retrieve verification results" });
  }
});

// Helper function to clean summary from potential JSON
const cleanSummary = (summary) => {
  if (!summary) return "No summary available.";
  
  // Check if it's a stringified JSON object (starts and ends with braces)
  if (typeof summary === 'string' && summary.trim().startsWith('{') && summary.trim().endsWith('}')) {
    console.log("Cleaning JSON from summary...");
    try {
      const parsed = JSON.parse(summary);
      if (parsed.summary) {
        console.log("Successfully extracted summary from JSON structure");
        return parsed.summary;
      }
    } catch (parseError) {
      console.log("Failed to parse JSON summary, trying regex extraction...");
      
      // Fallback: try to extract with regex
      try {
        // Look for "summary": "content" pattern with multiline support
        const summaryMatch = summary.match(/"summary":\s*"((?:[^"\\]|\\.)*)"/s);
        if (summaryMatch) {
          console.log("Successfully extracted summary using regex");
          return summaryMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
        }
      } catch (regexError) {
        console.log("Regex extraction also failed");
      }
    }
  }
  
  // Check if summary contains JSON structure inline
  if (typeof summary === 'string' && summary.includes('{"summary"')) {
    console.log("Cleaning inline JSON from summary...");
    try {
      // Try to extract just the summary text from the JSON structure
      const summaryMatch = summary.match(/"summary":\s*"((?:[^"\\]|\\.)*)"/s);
      if (summaryMatch) {
        return summaryMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
      }
    } catch (cleanError) {
      console.log("Failed to clean inline JSON structure from summary");
    }
  }
  
  // If all parsing fails, return fallback
  if (summary.includes('{') && summary.includes('"summary"')) {
    console.log("Using fallback for JSON-like content");
    return "Educational content generated successfully. Please view the full topic for details.";
  }
  
  return summary;
};

// Helper function to safely parse quiz data
const safeParseQuizData = (quizData) => {
  if (!quizData || quizData === '[object Object]') {
    return { question: 'Quiz data unavailable', options: [], correct_answer: '' };
  }
  try {
    return JSON.parse(quizData);
  } catch (error) {
    console.warn('⚠️ Failed to parse quiz_data:', quizData, 'Error:', error.message);
    return { question: 'Quiz data unavailable', options: [], correct_answer: '' };
  }
};

// Get random topics from all users (for home screen) - now with preference prioritization
router.get("/random-topics", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get list of already fetched topic IDs to exclude
    const excludeIds = req.query.excludeIds ? req.query.excludeIds.split(',').map(id => parseInt(id)).filter(id => !isNaN(id)) : [];
    console.log(`🎯 Fetching topics - Page: ${page}, Excluding ${excludeIds.length} topic IDs:`, excludeIds);

    // Get user's topic preferences
    const preferencesResult = await db.query(
      "SELECT preference_value FROM user_preferences WHERE user_id = $1 AND preference_key = 'topic_preference'",
      [userId]
    );

    const userPreferences = preferencesResult.rows.map(row => row.preference_value);
    console.log('👤 User preferences:', userPreferences);

    let topics = [];
    let reason = 'Random topics';

    if (userPreferences.length > 0) {
      // Try to get topics that match user preferences first
      const preferenceConditions = userPreferences.map((_, index) => 
        `LOWER(gt.category) = LOWER($${index + 1})`
      ).join(' OR ');

      let preferenceQuery = `
        SELECT 
           gt.id, 
           gt.topic as title, 
           gt.summary, 
           gt.category, 
           gt.user_id, 
           gt.created_at,
           gt.reading_time_minutes,
           gt.key_points,
           gt.quiz_count,
           gt.is_public,
           cvr.factual_accuracy_score, cvr.educational_value_score, cvr.clarity_engagement_score, cvr.overall_quality_score,
           cvr.verification_timestamp,
           'generated' as type
         FROM generated_topics gt
         LEFT JOIN content_verification_results cvr ON gt.id = cvr.topic_id
         WHERE gt.is_public = true AND (${preferenceConditions})
      `;
      
      let preferenceParams = [...userPreferences];
      
      if (excludeIds.length > 0) {
        preferenceQuery += ` AND gt.id NOT IN (${excludeIds.map((_, index) => `$${preferenceParams.length + index + 1}`).join(',')})`;
        preferenceParams = [...preferenceParams, ...excludeIds];
      }
      
      preferenceQuery += ` ORDER BY gt.created_at DESC LIMIT $${preferenceParams.length + 1}`;
      preferenceParams.push(limit);

      const preferenceResult = await db.query(preferenceQuery, preferenceParams);
      topics = preferenceResult.rows;
      reason = `Based on your interests in: ${userPreferences.join(', ')}`;

      // If not enough preference-based topics, fill with random topics
      if (topics.length < limit) {
        const remainingLimit = limit - topics.length;
        const existingIds = topics.map(t => t.id);
        const allExcludeIds = [...excludeIds, ...existingIds];
        
        let randomQuery = `
          SELECT 
             gt.id, 
             gt.topic as title, 
             gt.summary, 
             gt.category, 
             gt.user_id, 
             gt.created_at,
             gt.reading_time_minutes,
             gt.key_points,
             gt.quiz_count,
             gt.is_public,
             cvr.factual_accuracy_score,
             'generated' as type
           FROM generated_topics gt
           LEFT JOIN content_verification_results cvr ON gt.id = cvr.topic_id
           WHERE gt.is_public = true
        `;
        
        let randomParams = [];
        
        if (allExcludeIds.length > 0) {
          randomQuery += ` AND gt.id NOT IN (${allExcludeIds.map((_, index) => `$${index + 1}`).join(',')})`;
          randomParams = [...allExcludeIds];
        }
        
        randomQuery += ` ORDER BY RANDOM() LIMIT $${randomParams.length + 1}`;
        randomParams.push(remainingLimit);

        const randomResult = await db.query(randomQuery, randomParams);
        topics = [...topics, ...randomResult.rows];
      }
    } else {
      // No preferences, get random topics
      let query = `
        SELECT 
           gt.id, 
           gt.topic as title, 
           gt.summary, 
           gt.category, 
           gt.user_id, 
           gt.created_at,
           gt.reading_time_minutes,
           gt.key_points,
           gt.quiz_count,
           gt.is_public,
           cvr.factual_accuracy_score, cvr.educational_value_score, cvr.clarity_engagement_score, cvr.overall_quality_score,
           cvr.verification_timestamp,
           'generated' as type
         FROM generated_topics gt
         LEFT JOIN content_verification_results cvr ON gt.id = cvr.topic_id
         WHERE gt.is_public = true
      `;
      
      let queryParams = [];
      
      if (excludeIds.length > 0) {
        query += ` AND gt.id NOT IN (${excludeIds.map((_, index) => `$${index + 1}`).join(',')})`;
        queryParams = [...excludeIds];
      }
      
      query += ` ORDER BY RANDOM() LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
      queryParams.push(limit, offset);

      const result = await db.query(query, queryParams);
      topics = result.rows;
    }

    // Clean summaries before sending to frontend
    const cleanedTopics = topics.map(topic => ({
      ...topic,
      summary: cleanSummary(topic.summary)
    }));


    // If no topics found and we're excluding IDs, it might mean we've shown all topics
    if (cleanedTopics.length === 0 && excludeIds.length > 0) {
      console.log('⚠️ No more topics available after excluding', excludeIds.length, 'IDs');
    }

    res.json({
      topics: cleanedTopics,
      page,
      limit,
      hasMore: cleanedTopics.length === limit,
      reason
    });
  } catch (error) {
    console.error("Error fetching topics:", error);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
});

// Function to check if content is appropriate for educational purposes
const checkContentAppropriateness = async (topic, content) => {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "anthropic/claude-3.5-sonnet",
        messages: [
          {
            role: "system",
            content: `You are a content safety expert. Evaluate if the given topic or content is appropriate for educational purposes. 

Consider the following criteria:
1. Is it harmful, dangerous, or promotes illegal activities?
2. Does it contain explicit violence, gore, or graphic content?
3. Does it promote hate speech, discrimination, or harassment?
4. Is it sexually explicit or inappropriate for general audiences?
5. Does it promote self-harm, suicide, or dangerous behaviors?
6. Is it related to illegal drugs, weapons, or criminal activities?

Respond with ONLY a JSON object:
{
  "is_appropriate": true/false,
  "reason": "Brief explanation of why it's appropriate or inappropriate"
}

If the content is inappropriate, provide a constructive reason that encourages learning about safer alternatives.`
          },
          {
            role: "user",
            content: `Topic: "${topic}"
Content: "${content ? content.substring(0, 500) + '...' : 'No content yet'}"`
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

    const result = JSON.parse(response.data.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('Error checking content appropriateness:', error);
    // Default to allowing content if check fails
    return { is_appropriate: true, reason: "Content check unavailable" };
  }
};

// Endpoint to generate learning content based on user topic
router.post("/generate", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { category, topic, question, conversation_history, type } = req.body;

  try {
    if (type === 'initial') {
      // First, let the AI determine the appropriate category for the topic with retry
      let categoryResponse;
      let aiCategory;
      let categoryRetryCount = 0;
      const maxCategoryRetries = 2;
      
      while (categoryRetryCount < maxCategoryRetries) {
        try {
          console.log(`🏷️ Categorizing "${topic}" (attempt ${categoryRetryCount + 1}/${maxCategoryRetries})`);
          
          categoryResponse = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              model: "mistralai/mistral-7b-instruct",
              messages: [
                {
                  role: "system",
                  content: `You are an expert at categorizing educational topics. Given a topic, determine the most appropriate category from this list:

- Science: Physics, chemistry, biology, astronomy, geology, etc.
- Technology: Computers, software, programming, AI, robotics, etc.
- History: Historical events, civilizations, wars, discoveries, etc.
- Literature: Books, authors, writing, poetry, literary analysis, etc.
- Mathematics: Numbers, algebra, geometry, calculus, statistics, etc.
- Arts: Music, painting, sculpture, dance, theater, etc.
- Philosophy: Ethics, logic, metaphysics, political philosophy, etc.
- Geography: Countries, cultures, physical geography, climate, etc.
- Economics: Business, finance, trade, markets, economic theory, etc.
- Psychology: Human behavior, mental health, cognitive processes, etc.

Respond with ONLY the category name (e.g., "Science", "Technology", "History", etc.) and nothing else.`
                },
                {
                  role: "user",
                  content: `Categorize this topic: "${topic}"`
                },
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
              },
              timeout: 30000 // 30 seconds timeout for category classification
            }
          );

          aiCategory = categoryResponse.data.choices[0].message.content.trim();
          console.log(`AI categorized "${topic}" as: ${aiCategory}`);
          
          // Check if category is valid
          if (aiCategory && aiCategory.length > 0) {
            break;
          } else {
            console.log(`⚠️ Empty category response on attempt ${categoryRetryCount + 1}`);
            categoryRetryCount++;
            if (categoryRetryCount < maxCategoryRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
              continue;
            }
          }
        } catch (error) {
          console.error(`❌ Category classification error on attempt ${categoryRetryCount + 1}:`, error.message);
          categoryRetryCount++;
          if (categoryRetryCount < maxCategoryRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            continue;
          }
        }
      }
      
      // Fallback to provided category or 'General' if all attempts fail
      if (!aiCategory || aiCategory.length === 0) {
        console.log(`⚠️ Category classification failed, using fallback: ${category || 'General'}`);
        aiCategory = category || 'General';
      }

      // Use the AI-determined category instead of the provided one
      let finalCategory = aiCategory || category || 'General';
      
      // Ensure category is not too long for database (max 255 characters)
      if (finalCategory.length > 255) {
        console.log(`⚠️ Category "${finalCategory}" is too long (${finalCategory.length} chars), truncating to 255 characters`);
        finalCategory = finalCategory.substring(0, 255);
      }

      // Check if this exact topic already exists for this user
      const existingTopicResult = await db.query(
        `SELECT id, topic, summary, quiz_data, created_at 
         FROM generated_topics 
         WHERE user_id = $1 AND category = $2 AND LOWER(topic) = LOWER($3)
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, finalCategory, topic]
      );

      console.log(`Checking for exact match: user_id=${userId}, category=${finalCategory}, topic=${topic}`);
      console.log(`Exact match query returned ${existingTopicResult.rows.length} rows`);

      if (existingTopicResult.rows.length > 0) {
        // Topic already exists, return the existing content
        const existingTopic = existingTopicResult.rows[0];
        console.log(`Returning existing topic: ${existingTopic.topic} (ID: ${existingTopic.id})`);
        
        res.json({
          summary: existingTopic.summary,
          quiz: JSON.parse(existingTopic.quiz_data),
          existing_topic_id: existingTopic.id,
          is_existing: true,
          category: finalCategory,
          message: "Using existing content for this topic"
        });
        return;
      }

      // Check if there are any similar topics (for versioning)
      const similarTopicsResult = await db.query(
        `SELECT id, topic, summary, quiz_data, created_at 
         FROM generated_topics 
         WHERE user_id = $1 AND category = $2 AND (
           LOWER(topic) = LOWER($3) OR 
           LOWER(topic) LIKE LOWER($4) OR 
           LOWER($3) LIKE LOWER($5)
         )
         ORDER BY created_at DESC`,
        [userId, finalCategory, topic, `%${topic}%`, `%${topic}%`]
      );

      let versionNumber = 1;
      if (similarTopicsResult.rows.length > 0) {
        // Find exact matches first
        const exactMatches = similarTopicsResult.rows.filter(row => 
          row.topic.toLowerCase() === topic.toLowerCase()
        );
        
        if (exactMatches.length > 0) {
          // Exact match found, return existing content
          const existingTopic = exactMatches[0];
          console.log(`Returning existing topic: ${existingTopic.topic} (ID: ${existingTopic.id})`);
          
          res.json({
            summary: existingTopic.summary,
            quiz: JSON.parse(existingTopic.quiz_data),
            existing_topic_id: existingTopic.id,
            is_existing: true,
            category: finalCategory,
            message: "Using existing content for this topic"
          });
          return;
        }
        
        // Check for similar topics (for versioning)
        const similarTopics = similarTopicsResult.rows.filter(row => {
          const rowTopic = row.topic.toLowerCase();
          const newTopic = topic.toLowerCase();
          
          // Check if topics are similar but not exact
          const isSimilar = (
            (rowTopic.includes(newTopic) && rowTopic !== newTopic) ||
            (newTopic.includes(rowTopic) && rowTopic !== newTopic) ||
            (rowTopic.split(' ').some(word => newTopic.includes(word)) && 
             newTopic.split(' ').some(word => rowTopic.includes(word)))
          );
          
          return isSimilar;
        });
        
        if (similarTopics.length > 0) {
          // Extract version numbers from existing topics
          const versionNumbers = similarTopics
            .map(row => {
              const versionMatch = row.topic.match(/\(v(\d+)\)$/i);
              return versionMatch ? parseInt(versionMatch[1]) : 1;
            })
            .filter(num => !isNaN(num));
          
          versionNumber = versionNumbers.length > 0 ? Math.max(...versionNumbers) + 1 : 2;
        }
      }

      // Check content appropriateness before generating
      console.log(`🔍 Checking content appropriateness for topic: "${topic}"`);
      const appropriatenessCheck = await checkContentAppropriateness(topic, null);
      
      if (!appropriatenessCheck.is_appropriate) {
        console.log(`❌ Content appropriateness check failed for topic: "${topic}"`);
        console.log(`Reason: ${appropriatenessCheck.reason}`);
        return res.status(400).json({
          error: "Content not appropriate for educational purposes",
          message: appropriatenessCheck.reason || "This topic is not suitable for educational content. Please try a different topic that promotes learning and positive development.",
          details: "The content was flagged as inappropriate for educational purposes."
        });
      }
      
      console.log(`✅ Content appropriateness check passed for topic: "${topic}"`);

      // Generate new content with retry mechanism
      console.log(`🤖 Making AI request for topic: "${topic}" in category: ${finalCategory}`);
      console.log(`🔑 Using API key: ${process.env.OPENROUTER_API_KEY ? 'Present' : 'Missing'}`);
      
      let lessonResponse;
      let llmContent;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          console.log(`🔄 Attempt ${retryCount + 1}/${maxRetries} for topic: "${topic}"`);
          
          lessonResponse = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              model: "mistralai/mistral-7b-instruct",
              messages: [
                {
                  role: "system",
                  content: `You are an expert educator specializing in ${finalCategory}. Create engaging, educational content that is:
1. Clear and easy to understand for everyday learners
2. Practical and immediately applicable to daily life
3. Includes real-world examples and actionable insights
4. Focuses on skills and knowledge that improve quality of life
5. Encourages curiosity and further learning

Focus on topics that help people:
- Make better decisions in daily life
- Improve personal and professional skills
- Understand the world around them better
- Develop critical thinking and problem-solving abilities
- Enhance their well-being and relationships

${versionNumber > 1 ? `This is version ${versionNumber} of this topic. Make sure to provide different perspectives, examples, or approaches compared to previous versions.` : ''}

Format your response as JSON:
{
  "summary": "A comprehensive but concise explanation of the topic with practical applications and real-world examples (2-3 paragraphs). Focus on how this knowledge can be applied in everyday situations.",
  "key_points": ["Key point 1", "Key point 2", "Key point 3", "Key point 4"],
  "quiz": {
    "question": "A practical question that tests understanding of how to apply this knowledge in real life",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "The correct option"
  }
}`,
                },
                {
                  role: "user",
                  content: `Create practical educational content about "${topic}" in the context of ${finalCategory}. Focus on how this knowledge can be applied in everyday life, work, or personal development. Make it engaging with real-world examples and include a practical quiz question.`,
                },
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
              },
              timeout: 120000 // 120 seconds timeout for content generation (increased for slow connections)
            }
          );
          
          llmContent = lessonResponse.data.choices[0].message.content;
          console.log(`📝 Raw AI response for "${topic}" (attempt ${retryCount + 1}):`, llmContent ? llmContent.substring(0, 200) + '...' : 'EMPTY RESPONSE');
          console.log(`📝 Response length:`, llmContent ? llmContent.length : 0);
          
          // Check if response is empty or just whitespace
          if (!llmContent || llmContent.trim().length === 0) {
            console.log(`⚠️ Empty response received on attempt ${retryCount + 1} for topic: "${topic}"`);
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`🔄 Retrying in 2 seconds... (${retryCount}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
              continue;
            } else {
              console.error(`❌ All ${maxRetries} attempts failed for topic: "${topic}"`);
              break;
            }
          } else {
            console.log(`✅ Valid response received on attempt ${retryCount + 1} for topic: "${topic}"`);
            break;
          }
        } catch (error) {
          console.error(`❌ Error on attempt ${retryCount + 1} for topic: "${topic}":`, error.message);
          retryCount++;
          if (retryCount < maxRetries) {
            console.log(`🔄 Retrying in 2 seconds... (${retryCount}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            continue;
          } else {
            console.error(`❌ All ${maxRetries} attempts failed for topic: "${topic}"`);
            throw error;
          }
        }
      }
      
      // If we still don't have content after all retries, use fallback
      if (!llmContent || llmContent.trim().length === 0) {
        console.log(`🔄 Using fallback content generation after ${maxRetries} failed attempts...`);
        const fallbackContent = {
          summary: `This is a comprehensive overview of ${topic}. ${topic} is an important subject in ${finalCategory} that has practical applications in everyday life. Understanding ${topic} can help you make better decisions and improve your knowledge in this area.`,
          key_points: [
            `Understanding the basics of ${topic}`,
            `Practical applications of ${topic}`,
            `Key concepts and principles`,
            `Real-world examples and use cases`
          ],
          quiz: {
            question: `What is the main concept of ${topic}?`,
            options: [
              "A fundamental principle",
              "A complex theory", 
              "A practical application",
              "A basic understanding"
            ],
            correct_answer: "A fundamental principle"
          }
        };
        
        // Return the fallback content directly
        return res.json({
          summary: fallbackContent.summary,
          quiz: fallbackContent.quiz,
          key_points: fallbackContent.key_points,
          category: finalCategory,
          message: "Content generated using fallback due to AI service issues"
        });
      }
      
      console.log(`✅ AI response received for topic: "${topic}"`);
      let parsedContent;
      
      try {
        // Try to parse as JSON first
        console.log(`🔍 Attempting to parse JSON for "${topic}"...`);
        parsedContent = JSON.parse(llmContent);
        console.log(`✅ JSON parsed successfully for "${topic}"`);
        
        // Validate the parsed content has required fields
        if (!parsedContent.summary || !parsedContent.quiz || !parsedContent.quiz.question || !parsedContent.quiz.options || !parsedContent.quiz.correct_answer) {
          console.log(`❌ Missing required fields in JSON response for "${topic}":`, {
            hasSummary: !!parsedContent.summary,
            hasQuiz: !!parsedContent.quiz,
            hasQuestion: !!parsedContent.quiz?.question,
            hasOptions: !!parsedContent.quiz?.options,
            hasCorrectAnswer: !!parsedContent.quiz?.correct_answer
          });
          throw new Error("Missing required fields in JSON response");
        }
        
        // Ensure key_points exist and is an array
        if (!parsedContent.key_points || !Array.isArray(parsedContent.key_points)) {
          parsedContent.key_points = ['Key information about this topic', 'Important concepts to remember', 'Practical applications'];
        }
        
        // Ensure quiz has exactly 4 options
        if (!Array.isArray(parsedContent.quiz.options) || parsedContent.quiz.options.length !== 4) {
          throw new Error("Quiz must have exactly 4 options");
        }
        
        // Clean the summary to ensure it's just text, not JSON
        if (typeof parsedContent.summary === 'string') {
          console.log(`🧹 Cleaning summary for "${topic}":`, parsedContent.summary.substring(0, 100) + '...');
          
          // Check if summary contains JSON structure
          if (parsedContent.summary.includes('{"summary"') || parsedContent.summary.includes('"summary"')) {
            console.log("⚠️ Summary contains JSON structure, cleaning it...");
            try {
              // Try to extract just the summary text from the JSON structure
            const summaryMatch = parsedContent.summary.match(/"summary":\s*"([^"]+)"/);
            if (summaryMatch) {
              parsedContent.summary = summaryMatch[1];
                console.log("✅ Extracted summary from JSON structure");
            } else {
              // Remove JSON structure and keep only the content
              parsedContent.summary = parsedContent.summary.replace(/^\s*\{\s*"summary":\s*"/, '').replace(/"\s*,\s*"quiz":\s*\{[\s\S]*\}\s*\}\s*$/, '');
                console.log("✅ Removed JSON structure from summary");
            }
          } catch (cleanError) {
              console.log("❌ Failed to clean JSON structure from summary, using fallback");
            parsedContent.summary = "Content generated successfully.";
          }
          }
          
          // Additional cleaning: remove any remaining JSON artifacts
          if (parsedContent.summary.includes('{') || parsedContent.summary.includes('}')) {
            console.log("⚠️ Summary still contains JSON artifacts, cleaning further...");
            parsedContent.summary = parsedContent.summary.replace(/[{}"]/g, '').trim();
          }
          
          console.log(`✅ Final cleaned summary for "${topic}":`, parsedContent.summary.substring(0, 100) + '...');
        }
        
      } catch (parseError) {
        console.log(`❌ JSON parsing failed for "${topic}":`, parseError.message);
        console.log(`📝 Raw content that failed to parse:`, llmContent);
        
        // Try to extract content from malformed JSON
        try {
          console.log("🔄 Attempting to fix malformed JSON...");
          
          // Try to extract summary from the response
          const summaryMatch = llmContent.match(/"summary":\s*"([^"]+)"/);
          const quizMatch = llmContent.match(/"quiz":\s*\{([^}]+)\}/);
          const questionMatch = llmContent.match(/"question":\s*"([^"]+)"/);
          const optionsMatch = llmContent.match(/"options":\s*\[([^\]]+)\]/);
          const correctAnswerMatch = llmContent.match(/"correct_answer":\s*"([^"]+)"/);
          
          if (summaryMatch) {
            console.log("✅ Extracted summary from malformed JSON");
            parsedContent = {
              summary: summaryMatch[1],
              quiz: {
                question: questionMatch ? questionMatch[1] : "What did you learn from this topic?",
                options: optionsMatch ? 
                  optionsMatch[1].split(',').map(opt => opt.replace(/"/g, '').trim()) : 
                  ["A lot", "Some", "A little", "Nothing"],
                correct_answer: correctAnswerMatch ? correctAnswerMatch[1] : "A lot"
              },
              key_points: ['Key information about this topic', 'Important concepts to remember', 'Practical applications']
            };
          } else {
            throw new Error("Could not extract summary from malformed JSON");
          }
        } catch (extractError) {
          console.log("❌ Failed to extract content from malformed JSON, trying text parsing...");
        
        // Fallback to text parsing if JSON fails
        parsedContent = parseLLMResponse(llmContent);
        if (!parsedContent) {
            console.error("All parsing methods failed. Raw response:", llmContent);
            
            // Final fallback: generate basic content
            console.log("🔄 Using fallback content generation...");
            parsedContent = {
              summary: `This is a comprehensive overview of ${topic}. ${topic} is an important subject in ${finalCategory} that has practical applications in everyday life. Understanding ${topic} can help you make better decisions and improve your knowledge in this area.`,
              key_points: [
                `Understanding the basics of ${topic}`,
                `Practical applications of ${topic}`,
                `Key concepts and principles`,
                `Real-world examples and use cases`
              ],
              quiz: {
                question: `What is the main concept of ${topic}?`,
                options: [
                  "A fundamental principle",
                  "A complex theory", 
                  "A practical application",
                  "A basic understanding"
                ],
                correct_answer: "A fundamental principle"
              }
            };
            console.log("✅ Fallback content generated successfully");
        }
        
        // Convert to expected format
        parsedContent = {
          summary: parsedContent.content || parsedContent.summary || "Content generated successfully.",
          quiz: parsedContent.quiz_data || {
            question: "What did you learn from this topic?",
            options: ["A lot", "Some", "A little", "Nothing"],
            correct_answer: "A lot"
            },
            key_points: ['Key information about this topic', 'Important concepts to remember', 'Practical applications']
          };
        }
      }

      // Final validation and cleaning of parsed content
      console.log(`🔍 Final validation for "${topic}"...`);
      
      // Ensure summary is clean text, not JSON
      if (typeof parsedContent.summary === 'string') {
        // Remove any remaining JSON artifacts
        parsedContent.summary = parsedContent.summary
          .replace(/[{}"]/g, '')
          .replace(/\\/g, '')
          .trim();
        
        // Ensure it's not empty
        if (!parsedContent.summary || parsedContent.summary.length < 10) {
          parsedContent.summary = "Content generated successfully. Please try again for more detailed information.";
        }
      }
      
      // Ensure quiz has exactly 4 options
      if (!Array.isArray(parsedContent.quiz.options) || parsedContent.quiz.options.length !== 4) {
        console.log("⚠️ Quiz options invalid, using fallback");
        parsedContent.quiz.options = ["A lot", "Some", "A little", "Nothing"];
      }
      
      // Ensure key_points is an array
      if (!Array.isArray(parsedContent.key_points)) {
        parsedContent.key_points = ['Key information about this topic', 'Important concepts to remember', 'Practical applications'];
      }
      
      console.log(`✅ Final validated content for "${topic}":`);
      console.log(`   Summary length: ${parsedContent.summary.length} characters`);
      console.log(`   Quiz question: ${parsedContent.quiz.question}`);
      console.log(`   Quiz options: ${parsedContent.quiz.options.length} options`);
      console.log(`   Key points: ${parsedContent.key_points.length} points`);

      // Check generated content appropriateness
      console.log(`🔍 Checking generated content appropriateness for topic: "${topic}"`);
      const generatedContentCheck = await checkContentAppropriateness(topic, parsedContent.summary);
      
      if (!generatedContentCheck.is_appropriate) {
        console.log(`❌ Generated content appropriateness check failed for topic: "${topic}"`);
        console.log(`Reason: ${generatedContentCheck.reason}`);
        return res.status(400).json({
          error: "Generated content not appropriate for educational purposes",
          message: generatedContentCheck.reason || "The generated content is not suitable for educational purposes. Please try a different topic that promotes learning and positive development.",
          details: "The AI-generated content was flagged as inappropriate for educational purposes."
        });
      }
      
      console.log(`✅ Generated content appropriateness check passed for topic: "${topic}"`);

      // Add version number to topic name if it's not version 1
      const topicName = versionNumber > 1 ? `${topic} (v${versionNumber})` : topic;

      // Verify content quality using multiple AI models
      console.log("🔍 Starting content verification process...");
      const verificationResults = await verifyContentQuality(parsedContent, topic, finalCategory);
      
      // Check if content meets quality standards (overall score >= 6)
      const qualityThreshold = 6;
      const meetsQualityStandards = verificationResults.overallQuality.score >= qualityThreshold;
      
      if (!meetsQualityStandards) {
        console.log(`⚠️ Content quality below threshold (${verificationResults.overallQuality.score}/10). Attempting to regenerate...`);
        
        // Try to regenerate content once more with improved prompts
        const improvedResponse = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "mistralai/mistral-7b-instruct",
            messages: [
              {
                role: "system",
                content: `You are an expert educator specializing in ${finalCategory}. Create high-quality, engaging, educational content that is:
1. Factually accurate and well-researched
2. Clear and easy to understand for everyday learners
3. Practical and immediately applicable to daily life
4. Includes real-world examples and actionable insights
5. Focuses on skills and knowledge that improve quality of life
6. Encourages curiosity and further learning
7. Engaging and well-structured

IMPORTANT: Ensure all information is accurate, well-explained, and educational.

${versionNumber > 1 ? `This is version ${versionNumber} of this topic. Make sure to provide different perspectives, examples, or approaches compared to previous versions.` : ''}

Format your response as JSON:
{
  "summary": "A comprehensive but concise explanation of the topic with practical applications and real-world examples (2-3 paragraphs). Focus on how this knowledge can be applied in everyday situations.",
  "key_points": ["Key point 1", "Key point 2", "Key point 3", "Key point 4"],
  "quiz": {
    "question": "A practical question that tests understanding of how to apply this knowledge in real life",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "The correct option"
  }
}`,
              },
              {
                role: "user",
                content: `Create high-quality educational content about "${topic}" in the context of ${finalCategory}. Focus on accuracy, clarity, and practical applications. Make it engaging with real-world examples and include a practical quiz question.`,
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

        const improvedLLMContent = improvedResponse.data.choices[0].message.content;
        let improvedParsedContent;
        
        try {
          improvedParsedContent = JSON.parse(improvedLLMContent);
          
          // Validate the improved content
          if (improvedParsedContent.summary && improvedParsedContent.quiz && improvedParsedContent.quiz.question) {
            // Verify the improved content
            const improvedVerification = await verifyContentQuality(improvedParsedContent, topic, finalCategory);
            
            // Use improved content if it's better, otherwise use original
            if (improvedVerification.overallQuality.score > verificationResults.overallQuality.score) {
              console.log(`✅ Using improved content (score: ${improvedVerification.overallQuality.score}/10)`);
              parsedContent = improvedParsedContent;
              verificationResults = improvedVerification;
            } else {
              console.log(`⚠️ Improved content not better, using original (score: ${verificationResults.overallQuality.score}/10)`);
            }
          }
        } catch (improvedParseError) {
          console.log("⚠️ Failed to parse improved content, using original");
        }
      }

      res.json({
        summary: parsedContent.summary,
        key_points: parsedContent.key_points,
        quiz: parsedContent.quiz,
        topic_name: topicName,
        version_number: versionNumber,
        is_new_version: versionNumber > 1,
        category: finalCategory,
        verification_results: verificationResults,
        quality_score: verificationResults.overallQuality.score,
        meets_quality_standards: meetsQualityStandards,
        message: versionNumber > 1 ? `Created version ${versionNumber} of this topic` : "New topic created successfully"
      });

    } else if (type === 'follow_up') {
      // Handle follow-up questions
      const conversationMessages = [
        {
          role: "system",
          content: `You are an expert educator specializing in ${category}. You are having a conversation with a student about "${topic}". 
          
          Guidelines:
          1. Provide clear, accurate, and helpful answers
          2. Keep responses concise but informative
          3. Encourage further learning
          4. If the question is outside the scope of the topic, politely redirect to the main topic
          5. Use examples when helpful
          
          Format your response as JSON:
          {
            "answer": "Your detailed answer to the question",
            "updated_summary": "An updated summary incorporating the new information (optional, only if the answer significantly expands the topic)"
          }`
        }
      ];

      // Add conversation history
      if (conversation_history && conversation_history.length > 0) {
        conversation_history.forEach(msg => {
          conversationMessages.push({
            role: msg.role,
            content: msg.content
          });
        });
      }

      // Add the current question
      conversationMessages.push({
        role: "user",
        content: question
      });

      const followUpResponse = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "mistralai/mistral-7b-instruct",
          messages: conversationMessages,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const followUpContent = followUpResponse.data.choices[0].message.content;
      let parsedFollowUp;
      
      try {
        parsedFollowUp = JSON.parse(followUpContent);
        
        // Validate the parsed content
        if (!parsedFollowUp.answer) {
          throw new Error("Missing answer field in JSON response");
        }
        
      } catch (parseError) {
        console.log("Follow-up JSON parsing failed, using raw response:", parseError.message);
        
        // Fallback to simple text response
        parsedFollowUp = {
          answer: followUpContent,
          updated_summary: null
        };
      }

      res.json({
        answer: parsedFollowUp.answer,
        updated_summary: parsedFollowUp.updated_summary
      });

    } else {
      res.status(400).json({ error: "Invalid request type. Use 'initial' or 'follow_up'." });
    }

  } catch (error) {
    console.error("Error generating learning content:", error);
    
    // Provide more specific error messages
    if (error.response?.status === 401) {
      res.status(500).json({ error: "AI service authentication failed. Please contact support." });
    } else if (error.response?.status === 429) {
      res.status(500).json({ error: "AI service is busy. Please try again in a moment." });
    } else if (error.code === 'ECONNREFUSED') {
      res.status(500).json({ error: "Unable to connect to AI service. Please check your internet connection." });
    } else {
      // Log the actual error for debugging
      console.error("AI service error details:", {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code
      });
      
      res.status(500).json({ 
        error: "Failed to generate learning content. Please try again.",
        details: error.message 
      });
    }
  }
});

// ===== FAVORITES ENDPOINTS =====

// Endpoint to like/unlike a topic
router.post("/like-topic", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topicId, isLiked } = req.body;

  try {
    if (isLiked) {
      // Add to favorites
      await db.query(
        `INSERT INTO user_favorites (user_id, topic_id, created_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (user_id, topic_id) DO NOTHING`,
        [userId, topicId]
      );
      console.log(`✅ User ${userId} liked topic ${topicId}`);
      
      // Record activity
      await db.query(`
        INSERT INTO user_activities (user_id, activity_type, activity_data, related_id, related_type)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        userId, 
        'topic_liked', 
        JSON.stringify({
          title: 'Topic liked',
          category: 'Learning'
        }), 
        topicId, 
        'topic'
      ]);
    } else {
      // Remove from favorites
      await db.query(
        `DELETE FROM user_favorites 
         WHERE user_id = $1 AND topic_id = $2`,
        [userId, topicId]
      );
      console.log(`❌ User ${userId} unliked topic ${topicId}`);
    }

    res.json({ 
      success: true, 
      message: isLiked ? 'Topic liked successfully' : 'Topic unliked successfully' 
    });
  } catch (error) {
    console.error("Error toggling like:", error);
    res.status(500).json({ error: "Failed to update like status" });
  }
});

// Endpoint to save/unsave a topic to library
router.post("/save-to-library", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topicId, isSaved } = req.body;

  try {
    if (isSaved) {
      // Add to library
      await db.query(
        `INSERT INTO user_library (user_id, topic_id, created_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (user_id, topic_id) DO NOTHING`,
        [userId, topicId]
      );
      console.log(`📚 User ${userId} saved topic ${topicId} to library`);
      
      // Record activity
      await db.query(`
        INSERT INTO user_activities (user_id, activity_type, activity_data, related_id, related_type)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        userId, 
        'topic_saved', 
        JSON.stringify({
          title: 'Topic saved to library',
          category: 'Learning'
        }), 
        topicId, 
        'topic'
      ]);
    } else {
      // Remove from library
      await db.query(
        `DELETE FROM user_library 
         WHERE user_id = $1 AND topic_id = $2`,
        [userId, topicId]
      );
      console.log(`📖 User ${userId} removed topic ${topicId} from library`);
    }

    res.json({ 
      success: true, 
      message: isSaved ? 'Topic saved to library' : 'Topic removed from library' 
    });
  } catch (error) {
    console.error("Error saving to library:", error);
    res.status(500).json({ error: "Failed to update library status" });
  }
});

// Endpoint to get user's like and save status for topics
router.get("/user-status/:topicId", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topicId } = req.params;

  try {
    const [favoriteResult, libraryResult] = await Promise.all([
      db.query(
        `SELECT 1 FROM user_favorites WHERE user_id = $1 AND topic_id = $2`,
        [userId, topicId]
      ),
      db.query(
        `SELECT 1 FROM user_library WHERE user_id = $1 AND topic_id = $2`,
        [userId, topicId]
      )
    ]);

    res.json({
      isLiked: favoriteResult.rows.length > 0,
      isSaved: libraryResult.rows.length > 0
    });
  } catch (error) {
    console.error("Error fetching user status:", error);
    res.status(500).json({ error: "Failed to fetch user status" });
  }
});

// Endpoint to get user's favorite topics
router.get("/favorites", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await db.query(
      `SELECT 
        gt.id, gt.category, gt.topic, gt.summary, gt.quiz_data, 
        gt.created_at, gt.reading_time_minutes, gt.key_points, gt.quiz_count,
        gt.user_id, 'generated' as type,
        uf.created_at as favorited_at
       FROM generated_topics gt
       INNER JOIN user_favorites uf ON gt.id = uf.topic_id
       WHERE uf.user_id = $1
       ORDER BY uf.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const topics = result.rows.map(row => {
      try {
        return {
          id: row.id,
          category: row.category,
          topic: row.topic,
          summary: row.summary,
          quiz_data: typeof row.quiz_data === 'string' ? JSON.parse(row.quiz_data) : row.quiz_data,
          created_at: row.created_at,
          reading_time_minutes: row.reading_time_minutes,
          key_points: row.key_points,
          quiz_count: row.quiz_count,
          user_id: row.user_id,
          type: row.type,
          favorited_at: row.favorited_at,
          isLiked: true, // Since these are from favorites
          isSaved: true // Check if also in library
        };
      } catch (parseError) {
        console.error('Error parsing topic data:', parseError);
        return null;
      }
    }).filter(Boolean);

    // Check library status for each topic
    for (let topic of topics) {
      try {
        const libraryCheck = await db.query(
          'SELECT 1 FROM user_library WHERE user_id = $1 AND topic_id = $2',
          [userId, topic.id]
        );
        topic.isSaved = libraryCheck.rows.length > 0;
      } catch (error) {
        console.error(`Error checking library status for topic ${topic.id}:`, error);
        topic.isSaved = false;
      }
    }

    res.json({ topics });
  } catch (error) {
    console.error("Error fetching favorites:", error);
    res.status(500).json({ error: "Failed to fetch favorites" });
  }
});

// Endpoint to get user's library (saved topics)
router.get("/library", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const result = await db.query(
      `SELECT 
        gt.id, gt.category, gt.topic, gt.summary, gt.quiz_data, 
        gt.created_at, gt.reading_time_minutes, gt.key_points, gt.quiz_count,
        gt.user_id, 'generated' as type,
        ul.created_at as saved_at
       FROM generated_topics gt
       INNER JOIN user_library ul ON gt.id = ul.topic_id
       WHERE ul.user_id = $1
       ORDER BY ul.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const topics = result.rows.map(row => {
      try {
        return {
          id: row.id,
          category: row.category,
          topic: row.topic,
          summary: row.summary,
          quiz_data: typeof row.quiz_data === 'string' ? JSON.parse(row.quiz_data) : row.quiz_data,
          created_at: row.created_at,
          reading_time_minutes: row.reading_time_minutes,
          key_points: row.key_points,
          quiz_count: row.quiz_count,
          user_id: row.user_id,
          type: row.type,
          saved_at: row.saved_at,
          isLiked: false, // Check if also in favorites
          isSaved: true // Since these are from library
        };
      } catch (parseError) {
        console.error('Error parsing topic data:', parseError);
        return null;
      }
    }).filter(Boolean);

    // Check favorites status for each topic
    for (let topic of topics) {
      try {
        const favoritesCheck = await db.query(
          'SELECT 1 FROM user_favorites WHERE user_id = $1 AND topic_id = $2',
          [userId, topic.id]
        );
        topic.isLiked = favoritesCheck.rows.length > 0;
      } catch (error) {
        console.error(`Error checking favorites status for topic ${topic.id}:`, error);
        topic.isLiked = false;
      }
    }

    res.json({ topics });
  } catch (error) {
    console.error("Error fetching library:", error);
    res.status(500).json({ error: "Failed to fetch library" });
  }
});

// Random Quiz Endpoints - Must come before /:lessonId to avoid route conflicts
// Endpoint to get a random quiz that the user hasn't answered yet
router.get("/random-quiz", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  console.log('🎯 Random quiz request from user:', userId);
  
  try {
    // Get a random quiz that the user hasn't answered yet
    const result = await db.query(`
      SELECT rq.id, rq.question, rq.options, rq.correct_answer, rq.explanation, rq.category, rq.difficulty
      FROM random_quizzes rq
      WHERE rq.is_active = true
      AND rq.id NOT IN (
        SELECT uqa.quiz_id 
        FROM user_quiz_attempts uqa 
        WHERE uqa.user_id = $1
      )
      ORDER BY RANDOM()
      LIMIT 1
    `, [userId]);
    
    if (result.rows.length === 0) {
      console.log('❌ No random quiz found for user, checking availability...');
      
      // Check if user has answered all available quizzes
      const totalQuizzes = await db.query(`
        SELECT COUNT(*) as total FROM random_quizzes WHERE is_active = true
      `);
      
      const answeredQuizzes = await db.query(`
        SELECT COUNT(*) as answered FROM user_quiz_attempts WHERE user_id = $1
      `, [userId]);
      
      const total = parseInt(totalQuizzes.rows[0].total);
      const answered = parseInt(answeredQuizzes.rows[0].answered);
      
      console.log(`📊 Quiz stats - Total: ${total}, Answered: ${answered}`);
      
      if (answered >= total) {
        // User has completed all quizzes, try to generate more
        console.log(`🎯 User ${userId} has completed all ${total} quizzes. Attempting to generate more...`);
        
        try {
          // Check if API key is available
          if (!process.env.OPENROUTER_API_KEY) {
            console.log('⚠️ OPENROUTER_API_KEY not set, cannot generate new quizzes');
            return res.status(404).json({ 
              error: "No quizzes available",
              message: "You've completed all available quizzes! More quizzes will be generated soon."
            });
          }
          
          // Generate 10 new quizzes
          await generateMoreQuizzes(10);
          
          // Try to get a new quiz
          const newResult = await db.query(`
            SELECT rq.id, rq.question, rq.options, rq.correct_answer, rq.explanation, rq.category, rq.difficulty
            FROM random_quizzes rq
            WHERE rq.is_active = true
            AND rq.id NOT IN (
              SELECT uqa.quiz_id 
              FROM user_quiz_attempts uqa 
              WHERE uqa.user_id = $1
            )
            ORDER BY RANDOM()
            LIMIT 1
          `, [userId]);
          
          if (newResult.rows.length === 0) {
            return res.status(404).json({ 
              error: "No quizzes available",
              message: "All quizzes completed. New quizzes are being generated."
            });
          }
          
          const quiz = newResult.rows[0];
          res.json({
            quizId: quiz.id,
            question: quiz.question,
            options: quiz.options,
            category: quiz.category,
            difficulty: quiz.difficulty
          });
        } catch (error) {
          console.error('Error generating more quizzes:', error);
          return res.status(404).json({ 
            error: "No quizzes available",
            message: "You've completed all available quizzes! More quizzes will be generated soon."
          });
        }
      } else {
        return res.status(404).json({ 
          error: "No quizzes available",
          message: "No more quizzes available for you at the moment."
        });
      }
    } else {
      const quiz = result.rows[0];
      console.log(`✅ Found random quiz for user: ${quiz.id} - ${quiz.question.substring(0, 50)}...`);
      res.json({
        quizId: quiz.id,
        question: quiz.question,
        options: quiz.options,
        correctAnswer: quiz.correct_answer,
        explanation: quiz.explanation,
        category: quiz.category,
        difficulty: quiz.difficulty
      });
    }
  } catch (error) {
    console.error("Error getting random quiz:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ error: "Failed to get random quiz", details: error.message });
  }
});

// Endpoint to submit quiz answer
router.post("/random-quiz/:quizId/answer", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { quizId } = req.params;
  const { selectedAnswer } = req.body;
  
  try {
    // Get the quiz
    const quizResult = await db.query(`
      SELECT id, correct_answer, explanation
      FROM random_quizzes
      WHERE id = $1 AND is_active = true
    `, [quizId]);
    
    if (quizResult.rows.length === 0) {
      return res.status(404).json({ error: "Quiz not found" });
    }
    
    const quiz = quizResult.rows[0];
    const isCorrect = quiz.correct_answer === selectedAnswer;
    
    // Check if user has already answered this quiz
    const existingAttempt = await db.query(`
      SELECT id FROM user_quiz_attempts 
      WHERE user_id = $1 AND quiz_id = $2
    `, [userId, quizId]);
    
    if (existingAttempt.rows.length > 0) {
      return res.status(400).json({ error: "Quiz already answered" });
    }
    
    // Record the attempt
    await db.query(`
      INSERT INTO user_quiz_attempts (user_id, quiz_id, selected_answer, is_correct)
      VALUES ($1, $2, $3, $4)
    `, [userId, quizId, selectedAnswer, isCorrect]);
    
    // Record activity
    await db.query(`
      INSERT INTO user_activities (user_id, activity_type, activity_data, related_id, related_type)
      VALUES ($1, $2, $3, $4, $5)
    `, [
      userId, 
      'quiz_completed', 
      JSON.stringify({
        score: isCorrect ? 100 : 0,
        selectedAnswer: selectedAnswer,
        correctAnswer: quiz.correct_answer
      }), 
      quizId, 
      'quiz'
    ]);
    
    res.json({
      correct: isCorrect,
      correctAnswer: quiz.correct_answer,
      explanation: quiz.explanation || "Great job! Keep learning!",
      selectedAnswer: selectedAnswer
    });
  } catch (error) {
    console.error("Error submitting quiz answer:", error);
    res.status(500).json({ error: "Failed to submit quiz answer" });
  }
});

// Endpoint to get user's quiz statistics
router.get("/quiz-stats", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_attempts,
        SUM(CASE WHEN is_correct THEN 1 ELSE 0 END) as correct_answers,
        AVG(CASE WHEN is_correct THEN 1 ELSE 0 END) * 100 as accuracy_percentage
      FROM user_quiz_attempts
      WHERE user_id = $1
    `, [userId]);
    
    const categoryStats = await db.query(`
      SELECT 
        rq.category,
        COUNT(*) as attempts,
        SUM(CASE WHEN uqa.is_correct THEN 1 ELSE 0 END) as correct
      FROM user_quiz_attempts uqa
      JOIN random_quizzes rq ON uqa.quiz_id = rq.id
      WHERE uqa.user_id = $1
      GROUP BY rq.category
      ORDER BY attempts DESC
    `, [userId]);
    
    const result = stats.rows[0];
    res.json({
      totalAttempts: parseInt(result.total_attempts) || 0,
      correctAnswers: parseInt(result.correct_answers) || 0,
      accuracyPercentage: parseFloat(result.accuracy_percentage || 0).toFixed(1),
      categoryStats: categoryStats.rows
    });
  } catch (error) {
    console.error("Error getting quiz stats:", error);
    res.status(500).json({ error: "Failed to get quiz statistics" });
  }
});

// Activity tracking endpoints
// Endpoint to record user activity
router.post("/activity", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { activityType, activityData, relatedId, relatedType } = req.body;
  
  console.log('📝 Recording activity:', {
    userId,
    activityType,
    activityData,
    relatedId,
    relatedType
  });
  
  try {
    // First, verify that the user exists
    const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      console.error(`❌ User with ID ${userId} does not exist`);
      return res.status(404).json({ error: "User not found" });
    }

    const result = await db.query(`
      INSERT INTO user_activities (user_id, activity_type, activity_data, related_id, related_type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, created_at
    `, [userId, activityType, JSON.stringify(activityData), relatedId, relatedType]);
    
    console.log('✅ Activity recorded successfully:', result.rows[0]);
    
    res.status(201).json({
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at
    });
  } catch (error) {
    console.error("Error recording activity:", error);
    
    // Handle specific foreign key constraint errors
    if (error.code === '23503') {
      console.error(`Foreign key constraint violation: ${error.detail}`);
      return res.status(400).json({ 
        error: "Invalid reference - user or related item not found",
        details: error.detail 
      });
    }
    
    res.status(500).json({ error: "Failed to record activity" });
  }
});

// Endpoint to get user's recent activities
router.get("/activities", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { limit = 10, offset = 0 } = req.query;
  
  try {
    const activities = await db.query(`
      SELECT 
        ua.id,
        ua.activity_type,
        ua.activity_data,
        ua.related_id,
        ua.related_type,
        ua.created_at,
        CASE 
          WHEN ua.activity_type = 'topic_created' THEN gt.topic
          WHEN ua.activity_type = 'quiz_completed' THEN rq.question
          WHEN ua.activity_type = 'topic_liked' THEN gt.topic
          WHEN ua.activity_type = 'topic_saved' THEN gt.topic
          WHEN ua.activity_type = 'lesson_started' THEN gt.topic
          WHEN ua.activity_type = 'lesson_completed' THEN gt.topic
          WHEN ua.activity_type = 'lesson_reading' THEN gt.topic
          ELSE NULL
        END as title,
        CASE 
          WHEN ua.activity_type = 'topic_created' THEN gt.category
          WHEN ua.activity_type = 'quiz_completed' THEN rq.category
          WHEN ua.activity_type = 'topic_liked' THEN gt.category
          WHEN ua.activity_type = 'topic_saved' THEN gt.category
          WHEN ua.activity_type = 'lesson_started' THEN gt.category
          WHEN ua.activity_type = 'lesson_completed' THEN gt.category
          WHEN ua.activity_type = 'lesson_reading' THEN gt.category
          ELSE NULL
        END as category
      FROM user_activities ua
      LEFT JOIN generated_topics gt ON ua.related_id = gt.id AND ua.related_type = 'topic'
      LEFT JOIN random_quizzes rq ON ua.related_id = rq.id AND ua.related_type = 'quiz'
      WHERE ua.user_id = $1
      ORDER BY ua.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, parseInt(limit), parseInt(offset)]);
    
    // Helper functions for activity formatting
    const getActivityIcon = (activityType) => {
      const icons = {
        'topic_created': '📝',
        'quiz_completed': '🎯',
        'topic_liked': '❤️',
        'topic_saved': '📚',
        'lesson_started': '📖',
        'lesson_completed': '✅',
        'lesson_reading': '⏱️',
        'streak_milestone': '🔥',
        'achievement_earned': '🏆'
      };
      return icons[activityType] || '📊';
    };

    const getActivityDescription = (activityType, activityData) => {
      const descriptions = {
        'topic_created': `Created a new topic about ${activityData.category || 'learning'}`,
        'quiz_completed': `Completed a quiz with ${activityData.score || 0}% accuracy`,
        'topic_liked': `Liked a topic about ${activityData.category || 'learning'}`,
        'topic_saved': `Saved a topic to your library`,
        'lesson_started': `Started learning about ${activityData.topic || 'a new topic'}`,
        'lesson_completed': `Completed a lesson about ${activityData.topic || 'a topic'}`,
        'lesson_reading': `Read about ${activityData.topic || 'a topic'}`,
        'streak_milestone': `Reached a ${activityData.streak || 0} day learning streak!`,
        'achievement_earned': `Earned the "${activityData.achievement || 'Achievement'}" badge!`
      };
      return descriptions[activityType] || 'Completed an activity';
    };
    
    // Format activities for frontend
    const formattedActivities = activities.rows.map(activity => {
      let activityData = {};
      try {
        // Check if activity_data is already an object or needs parsing
        if (typeof activity.activity_data === 'object' && activity.activity_data !== null) {
          activityData = activity.activity_data;
        } else if (typeof activity.activity_data === 'string') {
          activityData = JSON.parse(activity.activity_data);
        }
      } catch (parseError) {
        console.error('Error parsing activity data:', parseError);
        activityData = {};
      }
      
      const formattedActivity = {
        id: activity.id,
        type: activity.activity_type,
        title: activity.title || activityData.title || 'Unknown Activity',
        category: activity.category || activityData.category,
        data: activityData,
        createdAt: activity.created_at,
        icon: getActivityIcon(activity.activity_type),
        description: getActivityDescription(activity.activity_type, activityData)
      };
      
      console.log('📊 Formatted activity:', formattedActivity);
      
      return formattedActivity;
    });
    
    console.log('📊 Total activities returned:', formattedActivities.length);
    res.json(formattedActivities);
  } catch (error) {
    console.error("Error getting activities:", error);
    res.status(500).json({ error: "Failed to get activities" });
  }
});

// Helper function to get activity icon
const getActivityIcon = (activityType) => {
  const icons = {
    'topic_created': '📝',
    'quiz_completed': '🎯',
    'topic_liked': '❤️',
    'topic_saved': '📚',
    'lesson_started': '📖',
    'lesson_completed': '✅',
    'streak_milestone': '🔥',
    'achievement_earned': '🏆'
  };
  return icons[activityType] || '📊';
};

// Helper function to get activity description
const getActivityDescription = (activityType, activityData) => {
  const descriptions = {
    'topic_created': `Created a new topic about ${activityData.category || 'learning'}`,
    'quiz_completed': `Completed a quiz with ${activityData.score || 0}% accuracy`,
    'topic_liked': `Liked a topic about ${activityData.category || 'learning'}`,
    'topic_saved': `Saved a topic to your library`,
    'lesson_started': `Started learning about ${activityData.topic || 'a new topic'}`,
    'lesson_completed': `Completed a lesson about ${activityData.topic || 'a topic'}`,
    'lesson_reading': `Read about ${activityData.topic || 'a topic'}`,
    'streak_milestone': `Reached a ${activityData.streak || 0} day learning streak!`,
    'achievement_earned': `Earned the "${activityData.achievement || 'Achievement'}" badge!`
  };
  return descriptions[activityType] || 'Completed an activity';
};

// ==================== USER STATS ENDPOINTS ====================

// Get all user stats
router.get("/user-stats", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    // Get weekly stats (last 7 days)
    const weeklyStats = await db.query(`
      SELECT 
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'lesson_completed' THEN ua.related_id END) as weekly_lessons,
        COALESCE(SUM(CASE WHEN ua.activity_type IN ('lesson_completed', 'lesson_reading') THEN (ua.activity_data->>'readingTime')::float / 60.0 ELSE 0 END), 0) as weekly_minutes,
        COUNT(DISTINCT DATE(ua.created_at)) as weekly_days
      FROM user_activities ua
      WHERE ua.user_id = $1 
        AND ua.created_at >= CURRENT_DATE - INTERVAL '7 days'
    `, [userId]);

    // Get overall stats
    const overallStats = await db.query(`
      SELECT 
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'lesson_completed' THEN ua.related_id END) as total_lessons_completed,
        COUNT(DISTINCT CASE WHEN ua.activity_type IN ('lesson_started', 'lesson_completed', 'lesson_reading') THEN ua.related_id END) as total_topics_explored,
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'achievement_earned' THEN ua.related_id END) as total_achievements,
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'quiz_completed' THEN ua.related_id END) as total_quizzes_completed,
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'topic_liked' THEN ua.related_id END) as total_topics_liked,
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'topic_saved' THEN ua.related_id END) as total_topics_saved,
        COALESCE(AVG(CASE WHEN ua.activity_type = 'quiz_completed' THEN (ua.activity_data->>'score')::float ELSE NULL END), 0) as average_quiz_score,
        COALESCE(SUM(CASE WHEN ua.activity_type IN ('lesson_completed', 'lesson_reading') THEN (ua.activity_data->>'readingTime')::float / 60.0 ELSE 0 END), 0) as total_learning_time,
        (
          -- Current streak (consecutive days from today backwards)
          WITH daily_activity AS (
            SELECT DISTINCT DATE(ua2.created_at) as activity_date
            FROM user_activities ua2
            WHERE ua2.user_id = $1
              AND ua2.activity_type IN ('lesson_completed', 'quiz_completed')
              AND ua2.created_at >= CURRENT_DATE - INTERVAL '365 days'
            ORDER BY activity_date DESC
          ),
          current_streak_calc AS (
            SELECT 
              activity_date,
              ROW_NUMBER() OVER (ORDER BY activity_date DESC) as day_number,
              activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date DESC) - 1)::integer as expected_date
            FROM daily_activity
          )
          SELECT COALESCE(COUNT(*), 0) as current_streak
          FROM current_streak_calc
          WHERE activity_date = expected_date
            AND activity_date >= CURRENT_DATE - INTERVAL '365 days'
        ) as current_streak,
        (
          -- Best streak (longest consecutive period)
          WITH daily_activity AS (
            SELECT DISTINCT DATE(ua2.created_at) as activity_date
            FROM user_activities ua2
            WHERE ua2.user_id = $1
              AND ua2.activity_type IN ('lesson_completed', 'quiz_completed')
              AND ua2.created_at >= CURRENT_DATE - INTERVAL '365 days'
            ORDER BY activity_date DESC
          ),
          with_prev_date AS (
            SELECT 
              activity_date,
              LAG(activity_date) OVER (ORDER BY activity_date DESC) as prev_date
            FROM daily_activity
          ),
          streak_groups AS (
            SELECT 
              activity_date,
              CASE 
                WHEN prev_date IS NULL OR activity_date - prev_date > 1 THEN 1
                ELSE 0
              END as new_streak
            FROM with_prev_date
          ),
          streak_numbers AS (
            SELECT 
              activity_date,
              SUM(new_streak) OVER (ORDER BY activity_date DESC) as streak_id
            FROM streak_groups
          ),
          streak_lengths AS (
            SELECT streak_id, COUNT(*) as days_count
            FROM streak_numbers
            GROUP BY streak_id
          )
          SELECT COALESCE(MAX(days_count), 0) as best_streak
          FROM streak_lengths
        ) as best_streak
      FROM user_activities ua
      WHERE ua.user_id = $1
    `, [userId]);

    const weekly = weeklyStats.rows[0];
    const overall = overallStats.rows[0];

    console.log('📊 Weekly stats raw:', weekly);
    console.log('📊 Overall stats raw:', overall);

    const response = {
      // Weekly stats
      weeklyLessons: parseInt(weekly.weekly_lessons) || 0,
      weeklyMinutes: parseFloat(weekly.weekly_minutes) || 0,
      weeklyDays: parseInt(weekly.weekly_days) || 0,
      
      // Overall stats
      totalLessonsCompleted: parseInt(overall.total_lessons_completed) || 0,
      totalTopicsExplored: parseInt(overall.total_topics_explored) || 0,
      totalAchievements: parseInt(overall.total_achievements) || 0,
      totalQuizzesCompleted: parseInt(overall.total_quizzes_completed) || 0,
      totalTopicsLiked: parseInt(overall.total_topics_liked) || 0,
      totalTopicsSaved: parseInt(overall.total_topics_saved) || 0,
      averageQuizScore: parseFloat(overall.average_quiz_score) || 0,
      totalLearningTime: parseFloat(overall.total_learning_time) || 0,
      
      // Streak stats
      currentStreak: parseInt(overall.current_streak) || 0,
      bestStreak: parseInt(overall.best_streak) || 0,
    };

    console.log('📊 Final response:', response);
    res.json(response);

  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

// Get weekly stats only
router.get("/weekly-stats", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const result = await db.query(`
      SELECT 
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'lesson_completed' THEN ua.related_id END) as lessons,
        COALESCE(SUM(CASE WHEN ua.activity_type IN ('lesson_completed', 'lesson_reading') THEN (ua.activity_data->>'readingTime')::float / 60.0 ELSE 0 END), 0) as minutes,
        COUNT(DISTINCT DATE(ua.created_at)) as days
      FROM user_activities ua
      WHERE ua.user_id = $1 
        AND ua.created_at >= CURRENT_DATE - INTERVAL '7 days'
    `, [userId]);

    const stats = result.rows[0];
    res.json({
      lessons: parseInt(stats.lessons) || 0,
      minutes: parseFloat(stats.minutes) || 0,
      days: parseInt(stats.days) || 0,
    });

  } catch (error) {
    console.error('Error fetching weekly stats:', error);
    res.status(500).json({ error: 'Failed to fetch weekly stats' });
  }
});

// Get overall stats only
router.get("/overall-stats", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    const result = await db.query(`
      SELECT 
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'lesson_completed' THEN ua.related_id END) as lessons_completed,
        COUNT(DISTINCT CASE WHEN ua.activity_type IN ('lesson_started', 'lesson_completed', 'lesson_reading') THEN ua.related_id END) as topics_explored,
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'achievement_earned' THEN ua.related_id END) as achievements,
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'quiz_completed' THEN ua.related_id END) as quizzes_completed,
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'topic_liked' THEN ua.related_id END) as topics_liked,
        COUNT(DISTINCT CASE WHEN ua.activity_type = 'topic_saved' THEN ua.related_id END) as topics_saved,
        COALESCE(AVG(CASE WHEN ua.activity_type = 'quiz_completed' THEN (ua.activity_data->>'score')::float ELSE NULL END), 0) as average_quiz_score,
        COALESCE(SUM(CASE WHEN ua.activity_type IN ('lesson_completed', 'lesson_reading') THEN (ua.activity_data->>'readingTime')::float / 60.0 ELSE 0 END), 0) as total_learning_time,
        (
          -- Current streak (consecutive days from today backwards)
          WITH daily_activity AS (
            SELECT DISTINCT DATE(ua2.created_at) as activity_date
            FROM user_activities ua2
            WHERE ua2.user_id = $1
              AND ua2.activity_type IN ('lesson_completed', 'quiz_completed')
              AND ua2.created_at >= CURRENT_DATE - INTERVAL '365 days'
            ORDER BY activity_date DESC
          ),
          current_streak_calc AS (
            SELECT 
              activity_date,
              ROW_NUMBER() OVER (ORDER BY activity_date DESC) as day_number,
              activity_date - (ROW_NUMBER() OVER (ORDER BY activity_date DESC) - 1)::integer as expected_date
            FROM daily_activity
          )
          SELECT COALESCE(COUNT(*), 0) as current_streak
          FROM current_streak_calc
          WHERE activity_date = expected_date
            AND activity_date >= CURRENT_DATE - INTERVAL '365 days'
        ) as current_streak,
        (
          -- Best streak (longest consecutive period)
          WITH daily_activity AS (
            SELECT DISTINCT DATE(ua2.created_at) as activity_date
            FROM user_activities ua2
            WHERE ua2.user_id = $1
              AND ua2.activity_type IN ('lesson_completed', 'quiz_completed')
              AND ua2.created_at >= CURRENT_DATE - INTERVAL '365 days'
            ORDER BY activity_date DESC
          ),
          with_prev_date AS (
            SELECT 
              activity_date,
              LAG(activity_date) OVER (ORDER BY activity_date DESC) as prev_date
            FROM daily_activity
          ),
          streak_groups AS (
            SELECT 
              activity_date,
              CASE 
                WHEN prev_date IS NULL OR activity_date - prev_date > 1 THEN 1
                ELSE 0
              END as new_streak
            FROM with_prev_date
          ),
          streak_numbers AS (
            SELECT 
              activity_date,
              SUM(new_streak) OVER (ORDER BY activity_date DESC) as streak_id
            FROM streak_groups
          ),
          streak_lengths AS (
            SELECT streak_id, COUNT(*) as days_count
            FROM streak_numbers
            GROUP BY streak_id
          )
          SELECT COALESCE(MAX(days_count), 0) as best_streak
          FROM streak_lengths
        ) as best_streak
      FROM user_activities ua
      WHERE ua.user_id = $1
    `, [userId]);

    const stats = result.rows[0];
    res.json({
      lessonsCompleted: parseInt(stats.lessons_completed) || 0,
      topicsExplored: parseInt(stats.topics_explored) || 0,
      achievements: parseInt(stats.achievements) || 0,
      quizzesCompleted: parseInt(stats.quizzes_completed) || 0,
      topicsLiked: parseInt(stats.topics_liked) || 0,
      topicsSaved: parseInt(stats.topics_saved) || 0,
      averageQuizScore: parseFloat(stats.average_quiz_score) || 0,
      totalLearningTime: parseFloat(stats.total_learning_time) || 0,
      currentStreak: parseInt(stats.current_streak) || 0,
      bestStreak: parseInt(stats.best_streak) || 0,
    });

  } catch (error) {
    console.error('Error fetching overall stats:', error);
    res.status(500).json({ error: 'Failed to fetch overall stats' });
  }
});

// Update user stats (called when user performs actions)
router.post("/update-stats", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { actionType, data, timestamp } = req.body;
  
  try {
    // This endpoint is mainly for tracking purposes
    // The actual stats are calculated from user_activities table
    // We could add additional stats tracking here if needed
    
    console.log(`📊 Stats update: User ${userId} performed ${actionType}`);
    
    res.json({ success: true, message: 'Stats updated' });
  } catch (error) {
    console.error('Error updating stats:', error);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

// User preferences endpoints (must come before /:lessonId route)
router.get("/preferences", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { key } = req.query;
    
    console.log('🔍 Fetching preferences for user:', userId, 'key:', key);
    
    if (key) {
      // Get specific preference
      const result = await db.query(
        'SELECT preference_value FROM user_preferences WHERE user_id = $1 AND preference_key = $2',
        [userId, key]
      );
      
      console.log('📊 Query result:', result.rows);
      
      if (result.rows.length > 0) {
        res.json({ value: result.rows[0].preference_value });
      } else {
        res.json({ value: null });
      }
    } else {
      // Get all preferences
      const result = await db.query(
        'SELECT preference_key, preference_value FROM user_preferences WHERE user_id = $1',
        [userId]
      );
      
      const preferences = {};
      result.rows.forEach(row => {
        preferences[row.preference_key] = row.preference_value;
      });
      
      res.json(preferences);
    }
  } catch (error) {
    console.error('❌ Error fetching user preferences:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to fetch preferences',
      details: error.message 
    });
  }
});

router.post("/preferences", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { key, value } = req.body;
    
    console.log('💾 Saving preference for user:', userId, 'key:', key, 'value:', value);
    
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value are required' });
    }
    
    await db.query(
      `INSERT INTO user_preferences (user_id, preference_key, preference_value, updated_at) 
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, preference_key) 
       DO UPDATE SET preference_value = $3, updated_at = CURRENT_TIMESTAMP`,
      [userId, key, value]
    );
    
    console.log('✅ Preference saved successfully');
    res.json({ success: true, message: 'Preference saved successfully' });
  } catch (error) {
    console.error('❌ Error saving user preference:', error);
    console.error('❌ Error details:', error.message);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to save preference',
      details: error.message 
    });
  }
});

// Endpoint to get user's learning history
router.get("/learning-history", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    // First, let's check all activities for this user to debug
    const allActivitiesResult = await db.query(`
      SELECT 
        ua.id,
        ua.activity_type,
        ua.related_id,
        ua.related_type,
        ua.created_at,
        gt.id as topic_id,
        gt.topic
      FROM user_activities ua
      LEFT JOIN generated_topics gt ON ua.related_id = gt.id AND ua.related_type = 'topic'
      WHERE ua.user_id = $1
      ORDER BY ua.created_at DESC
    `, [userId]);
    
    console.log('All activities for user:', allActivitiesResult.rows.length);
    console.log('Activity types:', allActivitiesResult.rows.map(r => r.activity_type));
    console.log('Activities with topic_id:', allActivitiesResult.rows.filter(r => r.topic_id).length);
    console.log('Activities without topic_id:', allActivitiesResult.rows.filter(r => !r.topic_id).length);
    
    // Get learning history from user_activities and topic_interactions
    const result = await db.query(`
      SELECT 
        ua.id,
        ua.activity_type,
        ua.activity_data,
        ua.created_at,
        gt.id as topic_id,
        gt.topic,
        gt.category,
        gt.summary,
        gt.key_points,
        gt.quiz_data,
        gt.is_public,
        cvr.factual_accuracy_score, cvr.educational_value_score, cvr.clarity_engagement_score, cvr.overall_quality_score,
        cvr.verification_timestamp, tps.is_private as user_made_private,
        ti.interaction_type,
        ti.content as interaction_content,
        ti.metadata as interaction_metadata
      FROM user_activities ua
      LEFT JOIN generated_topics gt ON ua.related_id = gt.id AND ua.related_type = 'topic'
      LEFT JOIN content_verification_results cvr ON gt.id = cvr.topic_id
      LEFT JOIN topic_privacy_settings tps ON gt.id = tps.topic_id AND tps.user_id = $1
      LEFT JOIN topic_interactions ti ON gt.id = ti.topic_id AND ti.user_id = $1
      WHERE ua.user_id = $1 
        AND ua.activity_type IN ('lesson_reading', 'lesson_completed', 'lesson_started', 'quiz_completed', 'topic_favorited', 'topic_saved', 'topic_created', 'topic_liked', 'topic_learned')
      ORDER BY ua.created_at DESC
      LIMIT 100
    `, [userId]);

    // Group activities by topic and create learning history items
    const topicHistory = {};
    
    console.log('Learning history raw data:', result.rows);
    console.log('Total rows returned:', result.rows.length);
    
    result.rows.forEach(row => {
      // Skip activities that don't have a topic_id (topic doesn't exist)
      if (!row.topic_id) {
        console.log('Skipping activity without topic_id:', {
          activity_id: row.id,
          activity_type: row.activity_type,
          related_id: row.related_id,
          related_type: row.related_type
        });
        return;
      }
      
      if (!topicHistory[row.topic_id]) {
        topicHistory[row.topic_id] = {
          topic_id: row.topic_id,
          topic: row.topic,
          category: row.category,
          summary: row.summary,
          key_points: row.key_points || [],
          quiz_data: row.quiz_data,
          factual_accuracy_score: row.factual_accuracy_score || null,
          educational_value_score: row.educational_value_score || null,
          clarity_engagement_score: row.clarity_engagement_score || null,
          overall_quality_score: row.overall_quality_score || null,
          verification_timestamp: row.verification_timestamp || null,
          is_public: row.is_public,
          user_made_private: row.user_made_private,
          activities: [],
          last_activity: row.created_at,
          quiz_taken: false,
          quiz_score: null,
          time_spent_seconds: 0,
          completion_percentage: 0
        };
      }
      
      // Add activity
      topicHistory[row.topic_id].activities.push({
        type: row.activity_type,
        data: row.activity_data,
        created_at: row.created_at
      });
      
      // Update quiz info if available
      if (row.activity_type === 'quiz_completed' && row.activity_data) {
        const quizData = row.activity_data;
        topicHistory[row.topic_id].quiz_taken = true;
        
        // Initialize quiz scores array if it doesn't exist
        if (!topicHistory[row.topic_id].quiz_scores) {
          topicHistory[row.topic_id].quiz_scores = [];
        }
        
        // Add the quiz score to the array
        if (quizData.score !== null && quizData.score !== undefined) {
          topicHistory[row.topic_id].quiz_scores.push(quizData.score);
        }
        
        // Calculate average quiz score
        if (topicHistory[row.topic_id].quiz_scores.length > 0) {
          const totalScore = topicHistory[row.topic_id].quiz_scores.reduce((sum, score) => sum + score, 0);
          topicHistory[row.topic_id].quiz_score = Math.round(totalScore / topicHistory[row.topic_id].quiz_scores.length);
        }
      }
      
      // Also check for quiz interactions from topic_interactions table
      if (row.interaction_type === 'quiz' && row.interaction_content) {
        console.log('Found quiz interaction for topic:', row.topic_id);
        topicHistory[row.topic_id].quiz_taken = true;
        
        // Initialize quiz scores array if it doesn't exist
        if (!topicHistory[row.topic_id].quiz_scores) {
          topicHistory[row.topic_id].quiz_scores = [];
        }
        
        try {
          const quizData = typeof row.interaction_content === 'object' 
            ? row.interaction_content 
            : JSON.parse(row.interaction_content);
          
          console.log('Quiz data parsed:', quizData);
          
          // Add the quiz score to the array
          if (quizData.score !== null && quizData.score !== undefined) {
            topicHistory[row.topic_id].quiz_scores.push(quizData.score);
            console.log('Added quiz score:', quizData.score, 'for topic:', row.topic_id);
          }
          
          // Calculate average quiz score
          if (topicHistory[row.topic_id].quiz_scores.length > 0) {
            const totalScore = topicHistory[row.topic_id].quiz_scores.reduce((sum, score) => sum + score, 0);
            topicHistory[row.topic_id].quiz_score = Math.round(totalScore / topicHistory[row.topic_id].quiz_scores.length);
            console.log('Updated quiz score to:', topicHistory[row.topic_id].quiz_score, 'for topic:', row.topic_id);
          }
        } catch (parseError) {
          console.error('Error parsing quiz interaction content:', parseError);
        }
      }
      
      // Update learning time and completion from lesson activities
      if (row.activity_type === 'lesson_reading' && row.activity_data) {
        const readingData = row.activity_data;
        // readingTime is already in seconds, no conversion needed
        const readingTimeSeconds = readingData.readingTime || 0;
        topicHistory[row.topic_id].time_spent_seconds += readingTimeSeconds;
      }
      
      // Handle topic_learned activities (learning sessions)
      if (row.activity_type === 'topic_learned' && row.activity_data) {
        const sessionData = row.activity_data;
        if (sessionData.time_spent_seconds) {
          topicHistory[row.topic_id].time_spent_seconds += sessionData.time_spent_seconds;
        }
        if (sessionData.completion_percentage) {
          topicHistory[row.topic_id].completion_percentage = Math.max(
            topicHistory[row.topic_id].completion_percentage, 
            sessionData.completion_percentage
          );
        }
      }
      
      // Mark as completed if lesson_completed activity exists
      if (row.activity_type === 'lesson_completed') {
        topicHistory[row.topic_id].completion_percentage = 100;
      }
    });

    const history = Object.values(topicHistory).map(item => ({
      id: item.topic_id,
      topic_id: item.topic_id,
      topic: item.topic,
      category: item.category,
      summary: item.summary,
      key_points: item.key_points,
      quiz_data: item.quiz_data,
      factual_accuracy_score: item.factual_accuracy_score || null,
      educational_value_score: item.educational_value_score || null,
      clarity_engagement_score: item.clarity_engagement_score || null,
      overall_quality_score: item.overall_quality_score || null,
      verification_timestamp: item.verification_timestamp || null,
      is_public: item.is_public,
      user_made_private: item.user_made_private,
      activities: item.activities,
      last_activity: item.last_activity,
      quiz_taken: item.quiz_taken,
      quiz_score: item.quiz_score,
      time_spent_seconds: item.time_spent_seconds,
      completion_percentage: item.completion_percentage,
      created_at: item.last_activity
    }));

    console.log('Final learning history count:', history.length);
    console.log('Final learning history:', history.map(item => ({
      topic: item.topic,
      time_spent_seconds: item.time_spent_seconds,
      completion_percentage: item.completion_percentage,
      quiz_score: item.quiz_score,
      quiz_scores: item.quiz_scores || []
    })));

    res.json(history);
  } catch (error) {
    console.error("Error fetching learning history:", error);
    res.status(500).json({ error: "Failed to fetch learning history" });
  }
});

// Endpoint to start a learning session
router.post("/learning-session/start", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topic_id } = req.body;

  try {
    const sessionId = `session_${Date.now()}_${userId}_${topic_id}`;
    
    // Record learning session start in user_activities
    const result = await db.query(`
      INSERT INTO user_activities (user_id, activity_type, activity_data, related_id, related_type)
      VALUES ($1, 'topic_learned', $2, $3, 'topic')
      RETURNING id
    `, [userId, JSON.stringify({ session_id: sessionId, start_time: new Date().toISOString() }), topic_id]);

    res.json({
      session_id: sessionId,
      history_id: result.rows[0].id,
      message: "Learning session started"
    });
  } catch (error) {
    console.error("Error starting learning session:", error);
    res.status(500).json({ error: "Failed to start learning session" });
  }
});

// Endpoint to end a learning session
router.post("/learning-session/end", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { session_id, time_spent_seconds, completion_percentage, notes } = req.body;

  try {
    // Record learning session end in user_activities
    const result = await db.query(`
      INSERT INTO user_activities (user_id, activity_type, activity_data, related_id, related_type)
      VALUES ($1, 'topic_learned', $2, $3, 'topic')
      RETURNING id
    `, [userId, JSON.stringify({ 
      session_id: session_id, 
      end_time: new Date().toISOString(),
      time_spent_seconds: time_spent_seconds,
      completion_percentage: completion_percentage,
      notes: notes
    }), req.body.topic_id]);

    res.json({
      message: "Learning session ended",
      history_id: result.rows[0].id
    });
  } catch (error) {
    console.error("Error ending learning session:", error);
    res.status(500).json({ error: "Failed to end learning session" });
  }
});

// Endpoint to update quiz results
router.post("/learning-session/quiz-result", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { session_id, quiz_score, topic_id } = req.body;

  try {
    // Record quiz completion in user_activities
    const result = await db.query(`
      INSERT INTO user_activities (user_id, activity_type, activity_data, related_id, related_type)
      VALUES ($1, 'quiz_completed', $2, $3, 'topic')
      RETURNING id
    `, [userId, JSON.stringify({ 
      session_id: session_id, 
      score: quiz_score,
      completed_at: new Date().toISOString()
    }), topic_id]);

    res.json({
      message: "Quiz result updated",
      history_id: result.rows[0].id
    });
  } catch (error) {
    console.error("Error updating quiz result:", error);
    res.status(500).json({ error: "Failed to update quiz result" });
  }
});

// Endpoint to toggle topic privacy
router.post("/topic-privacy", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topic_id, is_private, privacy_reason } = req.body;

  try {
    // Check if user owns the topic
    const topicCheck = await db.query(`
      SELECT id FROM generated_topics WHERE id = $1 AND user_id = $2
    `, [topic_id, userId]);

    if (topicCheck.rows.length === 0) {
      return res.status(403).json({ error: "You can only manage privacy for your own topics" });
    }

    // Update or insert privacy setting
    const result = await db.query(`
      INSERT INTO topic_privacy_settings (user_id, topic_id, is_private, privacy_reason)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, topic_id) 
      DO UPDATE SET 
        is_private = $3,
        privacy_reason = $4,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `, [userId, topic_id, is_private, privacy_reason]);

    res.json({
      message: `Topic ${is_private ? 'made private' : 'made public'}`,
      privacy_id: result.rows[0].id
    });
  } catch (error) {
    console.error("Error updating topic privacy:", error);
    res.status(500).json({ error: "Failed to update topic privacy" });
  }
});

// Endpoint to get quiz review options
router.get("/quiz-review/options", authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    // Get user's learning history with topics from user_activities
    const result = await db.query(`
      SELECT DISTINCT
        gt.id,
        gt.topic,
        gt.category,
        gt.quiz_data,
        COUNT(ua.id) as learning_sessions,
        AVG(CASE WHEN ua.activity_type = 'quiz_completed' THEN (ua.activity_data->>'score')::DECIMAL ELSE NULL END) as avg_quiz_score,
        MAX(ua.created_at) as last_learned
      FROM generated_topics gt
      JOIN user_activities ua ON gt.id = ua.related_id AND ua.related_type = 'topic'
      WHERE ua.user_id = $1 AND ua.activity_type IN ('topic_learned', 'quiz_completed')
      GROUP BY gt.id, gt.topic, gt.category, gt.quiz_data
      ORDER BY last_learned DESC
    `, [userId]);

    const topics = result.rows.map(row => ({
      id: row.id,
      topic: row.topic,
      category: row.category,
      quiz_data: row.quiz_data,
      learning_sessions: parseInt(row.learning_sessions),
      avg_quiz_score: parseFloat(row.avg_quiz_score) || 0,
      last_learned: row.last_learned
    }));

    res.json({
      topics,
      total_topics: topics.length,
      can_review_all: topics.length > 0
    });
  } catch (error) {
    console.error("Error fetching quiz review options:", error);
    res.status(500).json({ error: "Failed to fetch quiz review options" });
  }
});

// Endpoint to start a quiz review session
router.post("/quiz-review/start", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { session_type, topic_id } = req.body; // session_type: 'single_topic', 'all_topics', 'random'

  try {
    let sessionData = {};
    let totalQuestions = 0;

    if (session_type === 'single_topic') {
      // Get quiz data for specific topic
      const topicResult = await db.query(`
        SELECT quiz_data FROM generated_topics WHERE id = $1
      `, [topic_id]);
      
      if (topicResult.rows.length === 0) {
        return res.status(404).json({ error: "Topic not found" });
      }
      
      sessionData = {
        topic_id: topic_id,
        quiz_data: topicResult.rows[0].quiz_data
      };
      totalQuestions = 1;
    } else {
      // Get multiple topics for review
      const topicsResult = await db.query(`
        SELECT gt.id, gt.topic, gt.quiz_data
        FROM generated_topics gt
        JOIN user_learning_history ulh ON gt.id = ulh.topic_id
        WHERE ulh.user_id = $1
        ORDER BY ulh.created_at DESC
        LIMIT ${session_type === 'all_topics' ? 50 : 10}
      `, [userId]);

      sessionData = {
        topics: topicsResult.rows,
        session_type: session_type
      };
      totalQuestions = topicsResult.rows.length;
    }

    const sessionId = `review_${Date.now()}_${userId}`;
    
    const result = await db.query(`
      INSERT INTO quiz_review_sessions (user_id, session_type, topic_id, total_questions, session_data)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [userId, session_type, topic_id || null, totalQuestions, JSON.stringify(sessionData)]);

    res.json({
      session_id: sessionId,
      review_session_id: result.rows[0].id,
      session_data: sessionData,
      total_questions: totalQuestions,
      message: "Quiz review session started"
    });
  } catch (error) {
    console.error("Error starting quiz review session:", error);
    res.status(500).json({ error: "Failed to start quiz review session" });
  }
});

// Endpoint to end a quiz review session
router.post("/quiz-review/end", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { review_session_id, questions_answered, correct_answers, session_duration_seconds } = req.body;

  try {
    const result = await db.query(`
      UPDATE quiz_review_sessions 
      SET completed_at = CURRENT_TIMESTAMP,
          questions_answered = $1,
          correct_answers = $2,
          session_duration_seconds = $3
      WHERE id = $4 AND user_id = $5
      RETURNING id, session_type
    `, [questions_answered, correct_answers, session_duration_seconds, review_session_id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Review session not found" });
    }

    const accuracy = questions_answered > 0 ? (correct_answers / questions_answered) * 100 : 0;

    res.json({
      message: "Quiz review session completed",
      session_type: result.rows[0].session_type,
      accuracy: accuracy.toFixed(1),
      correct_answers,
      total_questions: questions_answered
    });
  } catch (error) {
    console.error("Error ending quiz review session:", error);
    res.status(500).json({ error: "Failed to end quiz review session" });
  }
});

// Endpoint to get user's quiz review history
router.get("/quiz-review/history", authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await db.query(`
      SELECT 
        id,
        session_type,
        topic_id,
        questions_answered,
        correct_answers,
        total_questions,
        session_duration_seconds,
        started_at,
        completed_at,
        CASE 
          WHEN questions_answered > 0 THEN (correct_answers::DECIMAL / questions_answered) * 100
          ELSE 0 
        END as accuracy_percentage
      FROM quiz_review_sessions
      WHERE user_id = $1 AND completed_at IS NOT NULL
      ORDER BY completed_at DESC
      LIMIT 50
    `, [userId]);

    const history = result.rows.map(row => ({
      id: row.id,
      session_type: row.session_type,
      topic_id: row.topic_id,
      questions_answered: row.questions_answered,
      correct_answers: row.correct_answers,
      total_questions: row.total_questions,
      session_duration_seconds: row.session_duration_seconds,
      accuracy_percentage: parseFloat(row.accuracy_percentage),
      started_at: row.started_at,
      completed_at: row.completed_at
    }));

    res.json(history);
  } catch (error) {
    console.error("Error fetching quiz review history:", error);
    res.status(500).json({ error: "Failed to fetch quiz review history" });
  }
});

// Endpoint to get the current version of a lesson
router.get("/:lessonId", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  
  try {
    const lessonResult = await db.query(`
      SELECT l.id, l.title, lv.id as version_id, lv.content, lv.quiz_data, 
             lv.audio_url, lv.version_number
      FROM lessons l
      JOIN lesson_versions lv ON l.current_version_id = lv.id
      WHERE l.id = $1
    `, [lessonId]);
    
    if (lessonResult.rows.length === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }
    
    const lesson = lessonResult.rows[0];
    res.json(lesson);
  } catch (error) {
    console.error("Error fetching lesson:", error);
    res.status(500).json({ error: "Failed to fetch lesson" });
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

    if (currentLesson.rows.length === 0) {
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
            content: `Original content: "${oldContent}"\n\nRevision instruction: "${revisionPrompt}". Use this format: Title: ..., Explanation: ..., Quiz: ...`,
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
    const newAudioUrl = await generateAudio(parsedContent.content, uuidv4());

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
    console.error("Error revising lesson:", err.message);
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
    if (lesson.rows.length === 0) return res.status(404).send("Lesson not found.");

    const currentVersion = await db.query(
      "SELECT version_number FROM lesson_versions WHERE id = $1",
      [lesson.rows[0].current_version_id]
    );
    const newVersionNumber = currentVersion.rows[0].version_number + 1;

    // Generate new audio for the revised content
    // const newAudioUrl = await generateAudio(content);

    // Create the new version
    const newVersionResult = await db.query(
      `INSERT INTO lesson_versions (lesson_id, content, quiz_data, audio_url, version_number, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_review') RETURNING id`,
      [lessonId, content, quiz_data, "newAudioUrl", newVersionNumber, userId]
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
    if (history.rows.length === 0)
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
    // Check if text is empty or just whitespace
    if (!text || text.trim().length === 0) {
      console.error("parseLLMResponse: Empty or whitespace-only text provided");
      throw new Error("Empty response from AI");
    }
    
    console.log("parseLLMResponse: Processing text of length:", text.length);
    console.log("parseLLMResponse: Text preview:", text.substring(0, 100));
    
    // Try to extract components using regex patterns
    const titleMatch = text.match(/Title:\s*(.*?)(?:\n|$)/i);
    const contentMatch = text.match(/Explanation:\s*([\s\S]*?)(?=Quiz:|$)/i);
    const quizMatch = text.match(/Quiz:\s*([\s\S]*)/i);
    
    // Extract values with fallbacks
    const title = titleMatch?.[1]?.trim() || "Generated Lesson";
    const content = contentMatch?.[1]?.trim() || text.trim();
    const quizText = quizMatch?.[1]?.trim() || "What did you learn from this lesson?";
    
    console.log("parseLLMResponse: Extracted content length:", content.length);
    
    // If we have some content, return it even if parsing wasn't perfect
    if (content && content.length > 10) {
      return {
        title,
        content,
        quiz_data: {
          question: quizText,
          options: ["Option A", "Option B", "Option C", "Option D"],
          correct_answer: "Option A"
        }
      };
    }
    
    // If we can't extract meaningful content, return null
    throw new Error("Failed to extract meaningful content from the response.");
  } catch (e) {
    console.error("Parsing failed:", e);
    console.log("Raw text that failed to parse:", text);
    return null;
  }
}

// Endpoint to mark a topic as a favorite
router.post("/favorite", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topicId, isFavorite } = req.body;

  console.log('Favorite request:', {
    userId,
    topicId,
    isFavorite
  });

  try {
    if (isFavorite) {
      // Add to favorites
    const query = `
        INSERT INTO user_favorites (user_id, topic_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, topic_id) DO NOTHING;
      `;
      await db.query(query, [userId, topicId]);
      res.status(200).json({ message: "Topic added to favorites." });
    } else {
      // Remove from favorites
      const query = `
        DELETE FROM user_favorites 
        WHERE user_id = $1 AND topic_id = $2;
      `;
      await db.query(query, [userId, topicId]);
      res.status(200).json({ message: "Topic removed from favorites." });
    }
  } catch (error) {
    console.error("Error updating favorite status:", error);
    res.status(500).json({ error: "Failed to update favorite status." });
  }
});

// Get random lesson (for discovery)
router.get("/random", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  
  try {
    // Get a random lesson that the user hasn't viewed yet
    const result = await db.query(`
      SELECT l.id, l.title
      FROM lessons l
      WHERE l.id NOT IN (
        SELECT lesson_id FROM user_lessons WHERE user_id = $1
      )
      ORDER BY RANDOM()
      LIMIT 1
    `, [userId]);
    
    if (result.rows.length === 0) {
      // If user has seen all lessons, get a random one
      const fallbackResult = await db.query(`
        SELECT l.id, l.title
        FROM lessons l
        ORDER BY RANDOM()
        LIMIT 1
      `);
      
      if (fallbackResult.rows.length === 0) {
        return res.status(404).json({ error: "No lessons available" });
      }
      
      return res.json(fallbackResult.rows[0]);
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error getting random lesson:", error);
    res.status(500).json({ error: "Failed to get random lesson" });
  }
});

// Submit quiz answer and get feedback
router.post("/:lessonId/quiz", authenticateToken, async (req, res) => {
  const { lessonId } = req.params;
  const { answer } = req.body;
  const userId = req.user.userId;
  
  try {
    // Get the lesson with quiz data
    const lessonResult = await db.query(`
      SELECT lv.quiz_data
      FROM lessons l
      JOIN lesson_versions lv ON l.current_version_id = lv.id
      WHERE l.id = $1
    `, [lessonId]);
    
    if (lessonResult.rows.length === 0) {
      return res.status(404).json({ error: "Lesson not found" });
    }
    
    const quizData = lessonResult.rows[0].quiz_data;
    const isCorrect = quizData.correctAnswer === answer;
    
    // Store quiz result (you might want to add a quiz_results table)
    
    res.json({
      correct: isCorrect,
      correctAnswer: quizData.correctAnswer,
      explanation: quizData.explanation || "Great job! Keep learning!"
    });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
});

// Endpoint to learn more about a topic
router.post("/learn-more", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topic, category, currentContent, topicId } = req.body;
  
  console.log(`🚀 Learn more request - User ID: ${userId}, Topic ID: ${topicId}`);

  try {
    // First, check if we have existing learn more content for this topic
    if (topicId) {
      console.log(`🔍 Checking for existing learn more content for topic ${topicId}, user ${userId}`);
      const existingContent = await db.query(
        `SELECT content, created_at 
         FROM topic_interactions 
         WHERE user_id = $1 AND topic_id = $2 AND interaction_type = 'learn_more'
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId, topicId]
      );

      console.log(`📊 Found ${existingContent.rows.length} existing interactions`);

      if (existingContent.rows.length > 0) {
        try {
          // PostgreSQL returns JSONB as JavaScript objects, no need to parse
          const savedContent = existingContent.rows[0].content;
          console.log(`✅ Found existing learn more content for topic ${topicId}`);
          return res.json({ 
            content: savedContent.content,
            fromCache: true,
            createdAt: existingContent.rows[0].created_at
          });
        } catch (accessError) {
          console.error('❌ Error accessing saved content:', accessError);
          // Continue to generate new content if access fails
        }
      }
    }

    // If no existing content found, generate new content
    console.log(`🔄 Generating new learn more content for topic: ${topic}`);
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "system",
            content: "You are an educational expert. Provide additional, engaging details about the given topic. Focus on interesting facts, examples, and deeper explanations that complement the existing content. Keep it concise but informative.",
          },
          {
            role: "user",
            content: `Topic: ${topic}\nCategory: ${category}\nCurrent Content: ${currentContent}\n\nProvide additional details and interesting facts about this topic.`,
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

    const additionalContent = response.data.choices[0].message.content;
    
    // Save the new interaction to database
    if (topicId) {
      // First check if the topic exists
      const topicCheck = await db.query(
        'SELECT id FROM generated_topics WHERE id = $1',
        [topicId]
      );
      
      if (topicCheck.rows.length === 0) {
        console.log(`⚠️ Topic ${topicId} not found in database, skipping interaction tracking`);
        console.log(`📝 Topic: "${topic}", Category: "${category}"`);
      } else {
        await db.query(
          `INSERT INTO topic_interactions (user_id, topic_id, interaction_type, content, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            userId,
            topicId,
            'learn_more',
            JSON.stringify({ content: additionalContent }),
            JSON.stringify({ topic, category })
          ]
        );
        console.log(`✅ Saved learn more interaction for topic ${topicId}`);
      }
    }
    
    res.json({ 
      content: additionalContent,
      fromCache: false,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error generating learn more content:", error);
    res.status(500).json({ error: "Failed to generate additional content" });
  }
});

// Endpoint to ask questions about a topic
router.post("/ask-question", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topic, category, question, conversationHistory = [], topicId } = req.body;

  console.log('Ask question request:', {
    userId,
    topic,
    category,
    question,
    topicId,
    conversationHistoryLength: conversationHistory.length
  });

  try {
    // First, check if we have an existing answer for this exact question
    if (topicId) {
      const existingAnswer = await db.query(
        `SELECT content, created_at 
         FROM topic_interactions 
         WHERE user_id = $1 AND topic_id = $2 AND interaction_type = 'question'
         AND content->>'question' = $3
         ORDER BY created_at DESC 
         LIMIT 1`,
        [userId, topicId, question]
      );

      if (existingAnswer.rows.length > 0) {
        let savedContent;
        const rawContent = existingAnswer.rows[0].content;
        console.log('🔍 Raw content type:', typeof rawContent);
        console.log('🔍 Raw content preview:', typeof rawContent === 'string' ? rawContent.substring(0, 100) : rawContent);
        
        try {
          // Try to parse as JSON first
          savedContent = JSON.parse(rawContent);
          console.log('✅ Successfully parsed content as JSON');
        } catch (parseError) {
          // If parsing fails, it might already be an object
          console.log('⚠️ Content is not JSON string, treating as object:', parseError.message);
          savedContent = rawContent;
        }
        
        console.log(`✅ Found existing answer for question: "${question}"`);
        return res.json({ 
          answer: savedContent.answer,
          fromCache: true,
          createdAt: existingAnswer.rows[0].created_at
        });
      }
    }

    // If no existing answer found, generate new answer
    console.log(`🔄 Generating new answer for question: "${question}"`);
    
    // Build conversation context
    const messages = [
      {
        role: "system",
        content: "You are an educational expert. Answer questions about the given topic clearly and accurately. Provide helpful, informative responses that help users understand the topic better.",
      },
      {
        role: "user",
        content: `Topic: ${topic}\nCategory: ${category}\n\nQuestion: ${question}`,
      },
    ];

    // Add conversation history for context
    conversationHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    let response;
    let answer;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`🔄 Ask question attempt ${retryCount + 1}/${maxRetries} for question: "${question}"`);
        
        response = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "mistralai/mistral-7b-instruct",
            messages: messages,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: 60000 // 60 seconds timeout for question answering
          }
        );

        answer = response.data.choices[0].message.content;
        console.log(`📝 Answer response (attempt ${retryCount + 1}):`, answer ? answer.substring(0, 100) + '...' : 'EMPTY RESPONSE');
        console.log(`📝 Answer length:`, answer ? answer.length : 0);
        
        // Check if response is empty or just whitespace
        if (!answer || answer.trim().length === 0) {
          console.log(`⚠️ Empty answer response on attempt ${retryCount + 1} for question: "${question}"`);
          retryCount++;
          if (retryCount < maxRetries) {
            console.log(`🔄 Retrying question answering in 2 seconds... (${retryCount}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            continue;
          } else {
            console.error(`❌ All ${maxRetries} question answering attempts failed for question: "${question}"`);
            break;
          }
        } else {
          console.log(`✅ Valid answer received on attempt ${retryCount + 1} for question: "${question}"`);
          break;
        }
      } catch (error) {
        console.error(`❌ Question answering error on attempt ${retryCount + 1} for question: "${question}":`, error.message);
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`🔄 Retrying question answering in 2 seconds... (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          continue;
        } else {
          console.error(`❌ All ${maxRetries} question answering attempts failed for question: "${question}"`);
          throw error;
        }
      }
    }
    
    // If we still don't have an answer after all retries, use fallback
    if (!answer || answer.trim().length === 0) {
      console.log(`🔄 Using fallback answer after ${maxRetries} failed attempts...`);
      answer = `I apologize, but I'm having trouble generating a response for your question about "${topic}". This might be due to a temporary service issue. Please try asking your question again, or try rephrasing it in a different way.`;
    }
    
    // Save the new interaction to database
    if (topicId) {
      // First check if the topic exists
      const topicCheck = await db.query(
        'SELECT id FROM generated_topics WHERE id = $1',
        [topicId]
      );
      
      if (topicCheck.rows.length === 0) {
        console.log(`⚠️ Topic ${topicId} not found in database, skipping interaction tracking`);
        console.log(`📝 Topic: "${topic}", Category: "${category}", Question: "${question}"`);
      } else {
        await db.query(
          `INSERT INTO topic_interactions (user_id, topic_id, interaction_type, content, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            userId,
            topicId,
            'question',
            JSON.stringify({ question, answer }),
            JSON.stringify({ topic, category, conversationHistory })
          ]
        );
        console.log(`✅ Saved new answer for question: "${question}"`);
      }
    }
    
    res.json({ 
      answer,
      fromCache: false,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error answering question:", error);
    res.status(500).json({ error: "Failed to answer question" });
  }
});

// Endpoint to generate a quiz for a topic
router.post("/generate-quiz", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topic, category, topicId } = req.body;

  // Helper function to create fallback quiz
  function createFallbackQuiz(topic, category) {
    return {
      question: `What is the main concept of ${topic}?`,
      options: [
        `The primary principle of ${topic}`,
        `A fundamental aspect of ${topic}`,
        `The core concept in ${topic}`,
        `An important element of ${topic}`
      ],
      correctAnswer: `The primary principle of ${topic}`,
      explanation: `This question tests your understanding of the fundamental concepts related to ${topic}. The correct answer represents the core principle or main idea that defines this topic.`
    };
  }

  try {
    let response;
    let quizContent;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`🔄 Quiz generation attempt ${retryCount + 1}/${maxRetries} for topic: "${topic}"`);
        
        response = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "mistralai/mistral-7b-instruct",
            messages: [
              {
                role: "system",
                content: "You are an educational expert. Create a quiz question about the given topic. Provide exactly 4 multiple choice options with meaningful content (not just A, B, C, D), indicate the correct answer, and provide a detailed explanation. IMPORTANT: Your response must be valid JSON only, no additional text. Format: {\"question\": \"What is the main concept of...?\", \"options\": [\"Option 1 text\", \"Option 2 text\", \"Option 3 text\", \"Option 4 text\"], \"correctAnswer\": \"Option 1 text\", \"explanation\": \"Detailed explanation...\"}",
              },
              {
                role: "user",
                content: `Topic: ${topic}\nCategory: ${category}\n\nCreate a quiz question about this topic with a detailed explanation.`,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json",
            },
            timeout: 60000 // 60 seconds timeout for quiz generation
          }
        );

        quizContent = response.data.choices[0].message.content;
        console.log(`🤖 Raw AI quiz response (attempt ${retryCount + 1}):`, quizContent ? quizContent.substring(0, 100) + '...' : 'EMPTY RESPONSE');
        console.log(`📝 Quiz response length:`, quizContent ? quizContent.length : 0);
        
        // Check if response is empty or just whitespace
        if (!quizContent || quizContent.trim().length === 0) {
          console.log(`⚠️ Empty quiz response on attempt ${retryCount + 1} for topic: "${topic}"`);
          retryCount++;
          if (retryCount < maxRetries) {
            console.log(`🔄 Retrying quiz generation in 2 seconds... (${retryCount}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            continue;
          } else {
            console.error(`❌ All ${maxRetries} quiz generation attempts failed for topic: "${topic}"`);
            break;
          }
        } else {
          console.log(`✅ Valid quiz response received on attempt ${retryCount + 1} for topic: "${topic}"`);
          break;
        }
      } catch (error) {
        console.error(`❌ Quiz generation error on attempt ${retryCount + 1} for topic: "${topic}":`, error.message);
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`🔄 Retrying quiz generation in 2 seconds... (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
          continue;
        } else {
          console.error(`❌ All ${maxRetries} quiz generation attempts failed for topic: "${topic}"`);
          throw error;
        }
      }
    }
    
    // If we still don't have content after all retries, use fallback
    if (!quizContent || quizContent.trim().length === 0) {
      console.log(`🔄 Using fallback quiz generation after ${maxRetries} failed attempts...`);
      const fallbackQuiz = createFallbackQuiz(topic, category);
      return res.json({
        quiz: fallbackQuiz,
        message: "Quiz generated using fallback due to AI service issues"
      });
    }
    
    // Try to parse JSON response
    let quizData;
    try {
      // Clean the response before parsing
      let cleanedContent = quizContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      quizData = JSON.parse(cleanedContent);
      console.log('✅ Successfully parsed quiz JSON:', quizData);
    } catch (parseError) {
      console.log('❌ JSON parsing failed:', parseError.message);
      console.log('📝 Raw content that failed to parse:', quizContent);
      
      // Try to extract quiz data using regex patterns
      const questionMatch = quizContent.match(/question["\s]*:["\s]*"([^"]+)"/i);
      const optionsMatch = quizContent.match(/options["\s]*:["\s]*\[([^\]]+)\]/i);
      const correctAnswerMatch = quizContent.match(/correctAnswer["\s]*:["\s]*"([^"]+)"/i);
      
      if (questionMatch && optionsMatch && correctAnswerMatch) {
        console.log('🔧 Attempting regex extraction...');
        try {
          const extractedOptions = JSON.parse(`[${optionsMatch[1]}]`);
          quizData = {
            question: questionMatch[1],
            options: extractedOptions,
            correctAnswer: correctAnswerMatch[1],
            explanation: `This question tests your understanding of ${topic}.`
          };
          console.log('✅ Successfully extracted quiz data via regex:', quizData);
        } catch (regexError) {
          console.log('❌ Regex extraction also failed:', regexError.message);
          // Fall back to generic options
          quizData = createFallbackQuiz(topic, category);
        }
      } else {
        console.log('❌ No regex patterns matched, using fallback');
        // Fall back to generic options
        quizData = createFallbackQuiz(topic, category);
      }
    }
    
    // Save the interaction to database
    if (topicId) {
      // First check if the topic exists
      const topicCheck = await db.query(
        'SELECT id FROM generated_topics WHERE id = $1',
        [topicId]
      );
      
      if (topicCheck.rows.length === 0) {
        console.log(`⚠️ Topic ${topicId} not found in database, skipping quiz interaction tracking`);
        console.log(`📝 Topic: "${topic}", Category: "${category}"`);
      } else {
        await db.query(
          `INSERT INTO topic_interactions (user_id, topic_id, interaction_type, content, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            userId,
            topicId,
            'quiz',
            JSON.stringify(quizData),
            JSON.stringify({ topic, category })
          ]
        );
        console.log(`✅ Saved quiz interaction for topic ${topicId}`);
      }
    }
    
    res.json(quizData);
  } catch (error) {
    console.error("Error generating quiz:", error);
    res.status(500).json({ error: "Failed to generate quiz" });
  }
});

// Endpoint to save topic interactions
router.post("/topic-interactions", authenticateToken, async (req, res) => {
  console.log('POST /topic-interactions endpoint hit');
  const userId = req.user.userId;
  const { topic_id, interaction_type, content, metadata } = req.body;

  console.log('POST /topic-interactions called with:', {
    userId,
    topic_id,
    interaction_type,
    content: content ? 'Content present' : 'No content',
    metadata: metadata ? 'Metadata present' : 'No metadata'
  });

  try {
    // First check if the topic exists
    const topicCheck = await db.query(
      'SELECT id FROM generated_topics WHERE id = $1',
      [topic_id]
    );
    
    if (topicCheck.rows.length === 0) {
      console.log(`⚠️ Topic ${topic_id} not found in database, skipping interaction tracking`);
      console.log(`📝 Interaction type: "${interaction_type}"`);
      
      res.json({
        message: "Topic not found, interaction not tracked",
        warning: `Topic ${topic_id} does not exist in database`
      });
      return;
    }

    const result = await db.query(
      `INSERT INTO topic_interactions (user_id, topic_id, interaction_type, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, topic_id, interaction_type, JSON.stringify(content), JSON.stringify(metadata)]
    );

    console.log('Topic interaction saved successfully:', result.rows[0].id);

    res.json({
      message: "Interaction saved successfully",
      interaction_id: result.rows[0].id
    });
  } catch (error) {
    console.error("Error saving topic interaction:", error);
    res.status(500).json({ error: "Failed to save interaction" });
  }
});

// Endpoint to get saved interactions for a topic
router.get("/topic-interactions/:topicId", authenticateToken, async (req, res) => {
  const userId = req.user.userId;
  const { topicId } = req.params;

  try {
    const result = await db.query(
      `SELECT id, interaction_type, content, metadata, created_at
       FROM topic_interactions
       WHERE user_id = $1 AND topic_id = $2
       ORDER BY created_at DESC`,
      [userId, topicId]
    );

    console.log('Topic interactions query result:', {
      userId,
      topicId,
      totalInteractions: result.rows.length,
      interactions: result.rows
    });

    res.json({ interactions: result.rows });
  } catch (error) {
    console.error("Error fetching topic interactions:", error);
    res.status(500).json({ error: "Failed to fetch interactions" });
  }
});

// Create audio cache directory
const audioCacheDir = path.join(__dirname, "../public/audio-cache");
fs.mkdir(audioCacheDir, { recursive: true });

// Function to generate cache key for audio
const generateAudioCacheKey = (text, voice, language) => {
  const crypto = require('crypto');
  const content = `${text}-${voice}-${language}`;
  return crypto.createHash('md5').update(content).digest('hex');
};

// Function to generate text hash
const generateTextHash = (text) => {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(text).digest('hex');
};

// Endpoint for text-to-speech
router.post("/text-to-speech", authenticateToken, async (req, res) => {
  const { text, voice, language } = req.body;

  // Filter out asterisks and other problematic characters for TTS
  const filteredText = text
    .replace(/\*/g, '') // Remove asterisks
    .replace(/[^\w\s.,!?;:()'"-]/g, '') // Remove special characters except basic punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  try {
    console.log(`🎵 Processing TTS request for text: "${filteredText.substring(0, 50)}..."`);

    // Generate cache key and text hash
    const cacheKey = generateAudioCacheKey(filteredText, voice, language);
    const textHash = generateTextHash(filteredText);
    const cachedFilePath = path.join(audioCacheDir, `${cacheKey}.mp3`);

    // Check database first for cached audio
    const cachedEntry = await db.query(
      'SELECT * FROM audio_cache_metadata WHERE text_hash = $1',
      [cacheKey]
    );

    if (cachedEntry.rows.length > 0) {
      // Audio is cached - serve from file system
      try {
        const cachedAudio = await fs.readFile(cachedEntry.rows[0].audio_file_path);
        console.log(`✅ Serving cached audio: ${cacheKey}.mp3 (${cachedEntry.rows[0].access_count + 1} accesses)`);
        
        // Update access statistics
        await db.query(
          'UPDATE audio_cache_metadata SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP WHERE text_hash = $1',
          [cacheKey]
        );
        
        // Convert to base64 and return
        const base64Audio = cachedAudio.toString('base64');
        res.json({ 
          audioContent: base64Audio,
          format: 'base64',
          mimeType: 'audio/mpeg',
          cached: true,
          cacheStats: {
            accessCount: cachedEntry.rows[0].access_count + 1,
            apiCallsSaved: cachedEntry.rows[0].api_calls_saved + 1
          }
        });
        return;
      } catch (fileError) {
        console.log(`⚠️ Cached file not found, removing from database: ${cacheKey}`);
        // Remove invalid cache entry
        await db.query('DELETE FROM audio_cache_metadata WHERE text_hash = $1', [cacheKey]);
      }
    }

    console.log(`📝 Cache miss, generating new audio for: ${cacheKey}`);

    // Use Google Cloud Text-to-Speech REST API directly
    
    
    // Map voice names to Google Cloud voices (comprehensive list)
    const voiceMapping = {
      // US English voices (12 voices total)
      'en-US-Standard-A': 'en-US-Standard-A',
      'en-US-Standard-B': 'en-US-Standard-B',
      'en-US-Standard-C': 'en-US-Standard-C',
      'en-US-Standard-D': 'en-US-Standard-D',
      'en-US-Standard-E': 'en-US-Standard-E',
      'en-US-Standard-F': 'en-US-Standard-F',
      'en-US-Standard-G': 'en-US-Standard-G',
      'en-US-Standard-H': 'en-US-Standard-H',
      'en-US-Standard-I': 'en-US-Standard-I',
      'en-US-Standard-J': 'en-US-Standard-J',
      
      // UK English voices (4 voices)
      'en-GB-Standard-A': 'en-GB-Standard-A',
      'en-GB-Standard-B': 'en-GB-Standard-B',
      'en-GB-Standard-C': 'en-GB-Standard-C',
      'en-GB-Standard-D': 'en-GB-Standard-D',
      
      // Australian English voices (4 voices)
      'en-AU-Standard-A': 'en-AU-Standard-A',
      'en-AU-Standard-B': 'en-AU-Standard-B',
      'en-AU-Standard-C': 'en-AU-Standard-C',
      'en-AU-Standard-D': 'en-AU-Standard-D',
    };

    console.log(`🎤 Voice selection: ${voice} -> ${voiceMapping[voice] || 'en-US-Standard-F'}`);
    const selectedVoice = voiceMapping[voice] || 'en-US-Standard-F';
    
    // Validate that the voice exists in our mapping
    if (!voiceMapping[voice]) {
      console.log(`⚠️ Voice "${voice}" not found in mapping, using default: en-US-Standard-F`);
    }

    const requestBody = {
      input: { text: filteredText },
      voice: { 
        languageCode: language || 'en-US',
        name: selectedVoice,
        ssmlGender: 'NEUTRAL'
      },
      audioConfig: { 
        audioEncoding: 'MP3',
        speakingRate: 1.0,
        pitch: 0,
        volumeGainDb: 0
      },
    };

    console.log(`🎵 TTS Request:`, {
      voice: selectedVoice,
      language: language || 'en-US',
      textLength: filteredText.length
    });

    const response = await axios.post(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_CLOUD_API_KEY}`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const audioContent = response.data.audioContent;
    
    // Save to cache for future use
    try {
      const audioBuffer = Buffer.from(audioContent, 'base64');
      await fs.writeFile(cachedFilePath, audioBuffer);
      
      // Save metadata to database
      const fileSize = audioBuffer.length;
      await db.query(
        `INSERT INTO audio_cache_metadata 
         (text_hash, audio_file_path, voice_settings, file_size, created_at, last_accessed, access_count) 
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
         ON CONFLICT (text_hash) DO UPDATE SET
         audio_file_path = EXCLUDED.audio_file_path,
         voice_settings = EXCLUDED.voice_settings,
         file_size = EXCLUDED.file_size,
         last_accessed = CURRENT_TIMESTAMP,
         access_count = audio_cache_metadata.access_count + 1`,
        [textHash, cachedFilePath, JSON.stringify({voice, language}), fileSize]
      );
      
      console.log(`💾 Audio cached successfully: ${cacheKey}.mp3 (${fileSize} bytes)`);
    } catch (cacheError) {
      if (cacheError.code === '23505') { // Unique constraint violation
        console.log(`⚠️ Audio already cached for text hash: ${textHash}`);
      } else {
        console.log(`⚠️ Failed to cache audio:`, cacheError.message);
      }
    }

    // Send the audio content directly as base64 string
    res.json({ 
      audioContent: audioContent,
      format: 'base64',
      mimeType: 'audio/mpeg',
      cached: false,
      cacheStats: {
        accessCount: 1,
        apiCallsSaved: 0
      }
    });
    
  } catch (error) {
    console.error("❌ Error generating Google Cloud TTS:", error);
    
    // Return a simple error response
    res.status(500).json({ 
      error: "Failed to generate speech",
      details: error.message 
    });
  }
});



// Endpoint to get enhanced audio cache statistics
router.get("/audio-cache/stats", authenticateToken, async (req, res) => {
  try {
    // Get database statistics
    const dbStats = await db.query(`
      SELECT 
        COUNT(*) as total_entries,
        SUM(file_size) as total_size_bytes,
        SUM(access_count) as total_accesses,
        SUM(api_calls_saved) as total_api_calls_saved,
        AVG(access_count) as avg_accesses_per_entry
      FROM audio_cache_metadata
    `);
    
    // Get file system statistics
    const files = await fs.readdir(audioCacheDir);
    const totalFiles = files.length;
    
    // Calculate total size from files
    let totalSize = 0;
    for (const file of files) {
      const filePath = path.join(audioCacheDir, file);
      const stats = await fs.stat(filePath);
      totalSize += stats.size;
    }
    
    // Get most popular cached items
    const popularItems = await db.query(`
      SELECT text_hash, voice_settings, access_count, created_at
      FROM audio_cache_metadata 
      ORDER BY access_count DESC 
      LIMIT 5
    `);
    
    const stats = dbStats.rows[0];
    
    res.json({
      // File system stats
      totalFiles,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      cacheDirectory: audioCacheDir,
      
      // Database stats
      totalEntries: parseInt(stats.total_entries) || 0,
      totalSizeBytesDB: parseInt(stats.total_size_bytes) || 0,
      totalSizeMBDB: ((parseInt(stats.total_size_bytes) || 0) / (1024 * 1024)).toFixed(2),
      totalAccesses: parseInt(stats.total_accesses) || 0,
      totalApiCallsSaved: parseInt(stats.total_api_calls_saved) || 0,
      avgAccessesPerEntry: parseFloat(stats.avg_accesses_per_entry || 0).toFixed(2),
      
      // Popular items
      popularItems: popularItems.rows
    });
  } catch (error) {
    console.error("Error getting cache stats:", error);
    res.status(500).json({ error: "Failed to get cache statistics" });
  }
});

// Endpoint to clear audio cache
router.delete("/audio-cache", authenticateToken, async (req, res) => {
  try {
    // Get all cached files from database
    const cachedFiles = await db.query('SELECT file_path FROM audio_cache_metadata');
    
    // Delete files from file system
    let deletedFiles = 0;
    for (const row of cachedFiles.rows) {
      try {
        await fs.unlink(row.file_path);
        deletedFiles++;
      } catch (fileError) {
        console.log(`⚠️ Could not delete file: ${row.file_path}`);
      }
    }
    
    // Clear database entries
    await db.query('DELETE FROM audio_cache_metadata');
    
    res.json({
      message: `Cache cleared successfully`,
      deletedFiles: deletedFiles,
      deletedEntries: cachedFiles.rows.length
    });
  } catch (error) {
    console.error("Error clearing cache:", error);
    res.status(500).json({ error: "Failed to clear cache" });
  }
});

// Helper function to generate more quizzes
async function generateMoreQuizzes(count = 10) {
  const categories = [
    'Science', 'Technology', 'History', 'Geography', 'Mathematics', 
    'Literature', 'Arts', 'Music', 'Sports', 'Philosophy', 'Psychology',
    'Economics', 'Politics', 'Business', 'Health', 'Languages', 'Environment',
    'Cooking', 'Travel', 'Fashion', 'Career', 'Finance', 'Education'
  ];
  
  try {
    console.log(`🎯 Generating ${count} additional quizzes...`);
    
    for (let i = 0; i < count; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      
      const prompt = `Generate a multiple choice quiz question about ${category}. 
      
      Requirements:
      - Create an engaging, educational question
      - Provide exactly 4 answer options (A, B, C, D)
      - Include one correct answer
      - Add a brief explanation for the correct answer
      - Make it suitable for general knowledge
      
      Format your response as JSON:
      {
        "question": "Your question here?",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correct_answer": "Option A",
        "explanation": "Brief explanation of why this is correct"
      }`;

      try {
        const response = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "mistralai/mistral-7b-instruct",
            messages: [
              {
                role: "system",
                content: "You are an expert quiz creator. Generate engaging, educational multiple choice questions with exactly 4 options and clear explanations."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 500
          },
          {
            headers: {
              "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "Content-Type": "application/json"
            }
          }
        );

        const content = response.data.choices[0].message.content;
        
        let quizData;
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            quizData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } catch (parseError) {
          quizData = {
            question: `What is a key concept in ${category}?`,
            options: [
              "A fundamental principle",
              "A basic element", 
              "A core concept",
              "An essential idea"
            ],
            correct_answer: "A fundamental principle",
            explanation: `This is a fundamental concept in ${category} that forms the basis for understanding the subject.`
          };
        }

        if (!quizData.question || !quizData.options || !quizData.correct_answer) {
          continue;
        }

        if (!Array.isArray(quizData.options) || quizData.options.length !== 4) {
          continue;
        }

        await db.query(`
          INSERT INTO random_quizzes (question, options, correct_answer, explanation, category)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          quizData.question,
          JSON.stringify(quizData.options),
          quizData.correct_answer,
          quizData.explanation || `This is the correct answer for the question about ${category}.`,
          category
        ]);

        console.log(`✅ Generated additional quiz: ${quizData.question.substring(0, 50)}...`);

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        console.error(`❌ Error generating additional quiz for ${category}:`, error.message);
        continue;
      }
    }

    console.log(`🎉 Successfully generated ${count} additional quizzes!`);

  } catch (error) {
    console.error('❌ Error in additional quiz generation:', error);
  }
}

// Admin endpoints for category management
// Create a new category
router.post("/admin/categories", authenticateToken, async (req, res) => {
  try {
    const { name, description, icon, color, sort_order } = req.body;
    
    if (!name || !icon || !color) {
      return res.status(400).json({ error: 'Name, icon, and color are required' });
    }

    const result = await db.query(
      `INSERT INTO categories (name, description, icon, color, sort_order) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, name, description, icon, color, sort_order`,
      [name, description, icon, color, sort_order || 0]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Update a category
router.put("/admin/categories/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, icon, color, sort_order, is_active } = req.body;

    const result = await db.query(
      `UPDATE categories 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           icon = COALESCE($3, icon), 
           color = COALESCE($4, color), 
           sort_order = COALESCE($5, sort_order), 
           is_active = COALESCE($6, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 
       RETURNING id, name, description, icon, color, sort_order, is_active`,
      [name, description, icon, color, sort_order, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete a category (soft delete by setting is_active to false)
router.delete("/admin/categories/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE categories 
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 
       RETURNING id, name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully', category: result.rows[0] });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// Get all categories (including inactive ones for admin)
router.get("/admin/categories", authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, description, icon, color, sort_order, is_active, created_at, updated_at
       FROM categories 
       ORDER BY sort_order ASC, name ASC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

module.exports = router;
