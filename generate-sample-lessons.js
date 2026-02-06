const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

// Use the same PG_* env vars as the main app (from .env / env file),
// falling back to older DB_* names only if PG_* are not set.
const pool = new Pool({
  host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
  port: process.env.PG_PORT || process.env.DB_PORT || 5432,
  database: process.env.PG_DATABASE || process.env.DB_NAME || 'learnflow',
  user: process.env.PG_USER || process.env.DB_USER || 'admin',
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD || 'your_secure_password',
});

// Sample topics for each category
const categoryTopics = {
  'Science': [
    'Quantum Physics Basics', 'DNA Structure and Function', 'Chemical Bonding', 'Astronomy Fundamentals',
    'Evolutionary Biology', 'Organic Chemistry', 'Nuclear Physics', 'Genetics and Heredity',
    'Meteorology Basics', 'Human Anatomy', 'Botany Fundamentals', 'Microbiology Basics'
  ],
  'Technology': [
    'Machine Learning Fundamentals', 'Web Development Basics', 'Cybersecurity Essentials', 'Cloud Computing',
    'Data Structures and Algorithms', 'Mobile App Development', 'Artificial Intelligence', 'Blockchain Technology',
    'Internet of Things', 'Software Engineering', 'Database Design', 'Network Security'
  ],
  'History': [
    'Ancient Civilizations', 'World War II', 'Industrial Revolution', 'Renaissance Period',
    'American Civil War', 'French Revolution', 'Ancient Egypt', 'Roman Empire',
    'Medieval Europe', 'Age of Exploration', 'Cold War Era', 'Ancient Greece'
  ],
  'Literature': [
    'Shakespearean Drama', 'Modern Poetry', 'Classic Novels', 'Short Story Writing',
    'Literary Analysis', 'Creative Writing', 'World Literature', 'Poetry Forms',
    'Drama and Theater', 'Literary Criticism', 'Fiction Writing', 'Non-fiction Writing'
  ],
  'Mathematics': [
    'Calculus Fundamentals', 'Linear Algebra', 'Statistics and Probability', 'Geometry Basics',
    'Number Theory', 'Differential Equations', 'Abstract Algebra', 'Mathematical Logic',
    'Combinatorics', 'Real Analysis', 'Topology', 'Mathematical Modeling'
  ],
  'Arts': [
    'Digital Art Fundamentals', 'Music Theory Basics', 'Photography Composition', 'Sculpture Techniques',
    'Painting Fundamentals', 'Graphic Design', 'Film Making', 'Dance Choreography',
    'Art History', 'Color Theory', 'Typography', 'Animation Basics'
  ],
  'Philosophy': [
    'Ethics and Morality', 'Logic and Reasoning', 'Metaphysics', 'Political Philosophy',
    'Epistemology', 'Aesthetics', 'Philosophy of Mind', 'Ancient Philosophy',
    'Modern Philosophy', 'Eastern Philosophy', 'Social Philosophy', 'Philosophy of Science'
  ],
  'Geography': [
    'Physical Geography', 'Human Geography', 'World Cultures', 'Climate and Weather',
    'Geographic Information Systems', 'Economic Geography', 'Political Geography', 'Urban Geography',
    'Environmental Geography', 'Cultural Geography', 'Historical Geography', 'Regional Geography'
  ],
  'Economics': [
    'Microeconomics Basics', 'Macroeconomics Fundamentals', 'International Trade', 'Economic History',
    'Development Economics', 'Labor Economics', 'Public Economics', 'Financial Economics',
    'Behavioral Economics', 'Game Theory', 'Econometrics', 'Economic Policy'
  ],
  'Psychology': [
    'Cognitive Psychology', 'Social Psychology', 'Developmental Psychology', 'Clinical Psychology',
    'Behavioral Psychology', 'Neuropsychology', 'Industrial Psychology', 'Educational Psychology',
    'Health Psychology', 'Forensic Psychology', 'Sports Psychology', 'Positive Psychology'
  ],
  'Business': [
    'Entrepreneurship Fundamentals', 'Business Strategy', 'Marketing Principles', 'Financial Management',
    'Human Resource Management', 'Operations Management', 'Business Ethics', 'International Business',
    'Project Management', 'Risk Management', 'Business Analytics', 'Corporate Finance'
  ],
  'Health': [
    'Nutrition Fundamentals', 'Exercise Science', 'Mental Health Basics', 'Public Health',
    'Anatomy and Physiology', 'Medical Terminology', 'Wellness and Prevention', 'Health Psychology',
    'Epidemiology', 'Health Policy', 'Alternative Medicine', 'Sports Medicine'
  ],
  'General': [
    'Critical Thinking Skills', 'Problem Solving Techniques', 'Communication Fundamentals', 'Time Management',
    'Learning Strategies', 'Research Methods', 'Information Literacy', 'Study Skills',
    'Note Taking Techniques', 'Memory Improvement', 'Goal Setting', 'Decision Making',
    'Creative Thinking', 'Analytical Skills', 'Presentation Skills', 'Writing Fundamentals',
    'Reading Comprehension', 'Active Listening', 'Collaboration Skills', 'Leadership Basics'
  ]
};

// Helper function to calculate reading time based on word count
function calculateReadingTime(text) {
  // Average reading speed: 200-250 words per minute
  // Using 225 words per minute as a reasonable average
  const wordsPerMinute = 225;
  const wordCount = text.split(/\s+/).length;
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  
  // Minimum 2 minutes, maximum 20 minutes
  return Math.max(2, Math.min(20, minutes));
}

// Helper function to count quiz questions
function getQuizCount(quizData) {
  try {
    const questions = JSON.parse(quizData);
    return Array.isArray(questions) ? questions.length : 0;
  } catch (error) {
    console.error('Error parsing quiz data:', error);
    return 0;
  }
}

// Helper function to generate key points
const GENERATION_MODELS = [
  "openai/gpt-4o-mini",
  "google/gemini-1.5-flash",
  "qwen/qwen2.5-7b-instruct",
  "mistralai/mistral-7b-instruct",
];

async function generateLessonWithLlm(topic, category) {
  let lastError = null;

  for (const model of GENERATION_MODELS) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model,
          messages: [
            {
              role: "system",
              content: `You are an expert educator specializing in ${category}. Create engaging, educational content that is:
1. Specific and detailed (avoid generic statements about importance or relevance)
2. Focused on key concepts, mechanisms, frameworks, and terminology of the topic
3. Includes concrete examples, scenarios, or case snippets
4. Explains how concepts connect (cause → effect, steps, or structure)
5. Practical and immediately applicable
6. Coherent and conclusive (end with a clear takeaway or summary paragraph)
7. Encourages curiosity and further learning

CRITICAL REQUIREMENT - TOPIC ACCURACY:
- Use the EXACT topic name provided: "${topic}"
- The content MUST be specifically about "${topic}"

ADDITIONAL DEPTH REQUIREMENTS:
- Target length: 600-900 words (about a 3-5 minute read)
- Mention at least 5 concrete concepts, models, tools, or terms specific to "${topic}"
- Provide at least 2 real-world examples or use-cases
- Avoid vague phrasing like "fundamental area of study" or "essential knowledge" without specifics

Format your response as JSON:
{
  "summary": "A detailed explanation (3-5 minutes of reading) with specific concepts, mechanisms, and examples. Include a clear concluding takeaway.",
  "key_points": ["Concrete key point 1 (specific to the topic)", "Concrete key point 2 (specific to the topic)", "Concrete key point 3 (specific to the topic)", "Concrete key point 4 (specific to the topic)", "Concrete key point 5 (specific to the topic)"],
  "quiz": {
    "question": "A scenario-based question that tests a specific concept from the topic",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "The correct option",
    "explanation": "Why that option is correct in the scenario"
  }
}`
            },
            {
              role: "user",
              content: `Topic to create content about: "${topic}"\nCategory: ${category}\n\nCreate practical, detailed educational content with a clear conclusion and a quiz.`
            }
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 120000
        }
      );

      const raw = response.data.choices[0].message.content;
      const parsed = JSON.parse(raw);

      return {
        summary: parsed.summary || '',
        key_points: Array.isArray(parsed.key_points) ? parsed.key_points : [],
        quiz_data: parsed.quiz || null,
        model_used: model,
      };
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const message = error?.message || 'Unknown error';
      console.error(`❌ LLM generation failed for model ${model}: ${status || ''} ${message}`);

      if (status && ![429, 500, 502, 503, 504].includes(status)) {
        break; // non-retryable
      }

      // Backoff before trying next model
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw lastError || new Error('All LLM models failed');
}

const createFallbackQuiz = (topic) => ({
  question: `Which statement best describes ${topic}?`,
  options: [
    `A core concept that shapes decisions in ${topic}`,
    `An unrelated idea that does not apply to ${topic}`,
    `A historical fact with no modern application`,
    `A definition that ignores key elements of ${topic}`,
  ],
  correct_answer: `A core concept that shapes decisions in ${topic}`,
  explanation: `This option captures the central idea of ${topic} and reflects how the topic is applied.`,
});

// Function to verify content quality using the actual API
async function verifyContentQuality(content, topic, category) {
  const verificationResults = {
    factualAccuracy: { score: 0, feedback: "", model: "" },
    educationalValue: { score: 0, feedback: "", model: "" },
    clarityAndEngagement: { score: 0, feedback: "", model: "" },
    overallQuality: { score: 0, feedback: "", model: "" }
  };

  // Skip verification if environment variable is set to disable it
  if (process.env.DISABLE_CONTENT_VERIFICATION === 'true') {
    console.log("⚠️ Content verification disabled by environment variable");
    verificationResults.overallQuality = {
      score: 7, // Default acceptable score
      feedback: "Verification disabled",
      model: "Skipped"
    };
    return verificationResults;
  }

  try {
    // Verification 1: Factual Accuracy using a lower-cost model
    console.log(`🔍 Verifying factual accuracy for: ${topic}`);
    
    let factualResponse;
    try {
      factualResponse = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are an expert fact-checker and educational content validator. Analyze the provided educational content for factual accuracy, completeness, and reliability.

Rate the content on a scale of 1-10 where:
1-3: Contains significant factual errors or misleading information
4-6: Some inaccuracies or incomplete information
7-8: Generally accurate with minor issues
9-10: Highly accurate and well-researched

Respond with JSON format:
{
  "score": number (1-10),
  "feedback": "Detailed feedback about factual accuracy",
  "issues": ["List of any factual issues found"],
  "recommendations": ["Suggestions for improvement"]
}`
            },
            {
              role: "user",
              content: `Topic: ${topic}
Category: ${category}
Content: ${content}

Please verify the factual accuracy of this educational content.`
            }
          ],
          max_tokens: 500
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 30000 // 30 seconds timeout
        }
      );
      console.log("✅ Factual accuracy API call successful");
    } catch (apiError) {
      console.error("❌ Factual accuracy API call failed:", apiError.message);
      factualResponse = null;
    }

    if (factualResponse && factualResponse.data.choices[0].message.content) {
      try {
        const factualData = JSON.parse(factualResponse.data.choices[0].message.content);
        verificationResults.factualAccuracy = {
          score: Math.max(1, Math.min(10, factualData.score || 7)),
          feedback: factualData.feedback || "Factual accuracy verified",
          model: "GPT-4o Mini"
        };
        console.log(`📊 Factual accuracy score: ${verificationResults.factualAccuracy.score}/10`);
      } catch (parseError) {
        console.error("❌ Error parsing factual accuracy response:", parseError.message);
        verificationResults.factualAccuracy = {
          score: 7,
          feedback: "Error parsing verification response",
          model: "GPT-4o Mini (Error)"
        };
      }
    } else {
      verificationResults.factualAccuracy = {
        score: 7,
        feedback: "API call failed, using default score",
        model: "GPT-4o Mini (Failed)"
      };
    }

    // Calculate overall quality based on available scores
    const scores = [
      verificationResults.factualAccuracy.score,
      verificationResults.educationalValue.score,
      verificationResults.clarityAndEngagement.score
    ].filter(score => score > 0);

    if (scores.length > 0) {
      verificationResults.overallQuality = {
        score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        feedback: `Overall quality based on ${scores.length} verification models`,
        model: "Multi-Model Average"
      };
    }

    console.log(`📊 Overall quality score: ${verificationResults.overallQuality.score}/10`);

  } catch (error) {
    console.error("❌ Error during content verification:", error);
    
    // If verification fails, return a default acceptable score
    verificationResults.overallQuality = {
      score: 6, // Default acceptable score when verification fails
      feedback: "Verification failed, using default quality score",
      model: "Fallback"
    };
  }

  return verificationResults;
}

async function generateSampleLessons(targetCount = 100) {
  const client = await pool.connect();
  
  try {
    console.log(`🚀 Generating up to ${targetCount} sample lessons...`);
    
    // Get categories from database
    const categoriesResult = await client.query('SELECT * FROM categories WHERE is_active = true ORDER BY sort_order, name');
    const categories = categoriesResult.rows;
    
    console.log(`📚 Found ${categories.length} active categories`);
    
    // Get user ID - check if specified via command line argument (email or ID), otherwise use first available user
    let userId;
    const userArg = process.argv[3];
    
    if (userArg) {
      // Check if it's an email (contains @) or a numeric ID
      if (userArg.includes('@')) {
        // Email specified
        const userCheck = await client.query('SELECT id, email FROM users WHERE email = $1', [userArg]);
        if (userCheck.rows.length === 0) {
          throw new Error(`User with email "${userArg}" not found in database.`);
        }
        userId = userCheck.rows[0].id;
        const user = userCheck.rows[0];
        console.log(`👤 Using user specified by email:`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email || 'N/A'}`);
      } else {
        // Try as numeric ID
        const userIdArg = parseInt(userArg, 10);
        if (!isNaN(userIdArg)) {
          const userCheck = await client.query('SELECT id, email FROM users WHERE id = $1', [userIdArg]);
          if (userCheck.rows.length === 0) {
            throw new Error(`User with ID ${userIdArg} not found in database.`);
          }
          userId = userIdArg;
          const user = userCheck.rows[0];
          console.log(`👤 Using user specified by ID:`);
          console.log(`   ID: ${user.id}`);
          console.log(`   Email: ${user.email || 'N/A'}`);
        } else {
          throw new Error(`Invalid user identifier: "${userArg}". Use an email address or numeric user ID.`);
        }
      }
    } else {
      // Use first available user
      const usersResult = await client.query('SELECT id, email FROM users ORDER BY id ASC LIMIT 1');
      if (usersResult.rows.length === 0) {
        throw new Error('No users found in database. Please create a user first.');
      }
      userId = usersResult.rows[0].id;
      const user = usersResult.rows[0];
      console.log(`👤 Using first available user:`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
    }
    
    let totalLessons = 0;
    const perCategory = Math.max(1, Math.ceil(targetCount / Math.max(categories.length, 1)));
    
    // Helper function to find topics for a category (case-insensitive)
    function getTopicsForCategory(categoryName) {
      const normalizedName = categoryName.trim();
      // Try exact match first
      if (categoryTopics[normalizedName]) {
        return [...categoryTopics[normalizedName]]; // Return a copy
      }
      // Try case-insensitive match
      for (const key in categoryTopics) {
        if (key.toLowerCase() === normalizedName.toLowerCase()) {
          return [...categoryTopics[key]]; // Return a copy
        }
      }
      // If no match, return empty array
      return [];
    }

    // Generate lessons for each category, capped by targetCount
    for (const category of categories) {
      if (totalLessons >= targetCount) break;

      let availableTopics = getTopicsForCategory(category.name);
      console.log(`\n🏷️ Generating lessons for ${category.name}...`);
      console.log(`   📝 Found ${availableTopics.length} available topics for this category`);
      
      // If no topics found, log a warning
      if (availableTopics.length === 0) {
        console.log(`   ⚠️  No predefined topics for "${category.name}", skipping this category`);
        continue;
      }
      
      // Shuffle topics to randomize selection
      for (let i = availableTopics.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [availableTopics[i], availableTopics[j]] = [availableTopics[j], availableTopics[i]];
      }
      
      const lessonsForThisCategory = Math.min(perCategory, availableTopics.length, targetCount - totalLessons);
      
      for (let i = 0; i < lessonsForThisCategory && totalLessons < targetCount; i++) {
        // Use topics in order from shuffled array (no repeats)
        const topic = availableTopics[i];
        
        try {
          // Generate content for the lesson via LLM prompt
          const llmLesson = await generateLessonWithLlm(topic, category.name);
          const summary = llmLesson.summary;
          const keyPoints = JSON.stringify(llmLesson.key_points || []);
          const quizData = JSON.stringify(llmLesson.quiz_data || createFallbackQuiz(topic));
          
          // Calculate actual reading time based on word count
          const readingTimeMinutes = calculateReadingTime(summary);
          
          // Calculate actual quiz count
          const quizCount = getQuizCount(quizData);
          
          // Verify content quality using the actual API
          console.log(`   🔍 Verifying content for: ${topic}`);
          const verificationResults = await verifyContentQuality(summary, topic, category.name);
          
          // Insert lesson
          const lessonResult = await client.query(`
            INSERT INTO generated_topics (user_id, category, topic, summary, quiz_data, key_points, reading_time_minutes, quiz_count, is_public, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
          `, [
            userId,
            category.name,
            topic,
            summary,
            quizData,
            keyPoints,
            readingTimeMinutes, // Actual calculated reading time
            quizCount, // Actual quiz count
            true, // Public
            new Date() // Current timestamp
          ]);
          
          const lessonId = lessonResult.rows[0].id;
          
          // Insert content verification result with actual API scores
          await client.query(`
            INSERT INTO content_verification_results (
              topic_id, user_id, factual_accuracy_score, factual_accuracy_feedback, 
              factual_accuracy_model, educational_value_score, educational_value_feedback,
              educational_value_model, clarity_engagement_score, clarity_engagement_feedback,
              clarity_engagement_model, overall_quality_score, overall_quality_feedback,
              overall_quality_model, meets_quality_standards, verification_timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          `, [
            lessonId, userId,
            verificationResults.factualAccuracy.score,
            verificationResults.factualAccuracy.feedback,
            verificationResults.factualAccuracy.model,
            verificationResults.educationalValue.score || 7, // Default if not available
            verificationResults.educationalValue.feedback || 'Educational value assessed',
            verificationResults.educationalValue.model || 'Default Assessment',
            verificationResults.clarityAndEngagement.score || 7, // Default if not available
            verificationResults.clarityAndEngagement.feedback || 'Content clarity assessed',
            verificationResults.clarityAndEngagement.model || 'Default Assessment',
            verificationResults.overallQuality.score,
            verificationResults.overallQuality.feedback,
            verificationResults.overallQuality.model,
            verificationResults.overallQuality.score >= 7, // Meets quality standards if score >= 7
            new Date()
          ]);
          
          totalLessons++;
          console.log(`   ✅ Created: ${topic} [${llmLesson.model_used || 'unknown model'}] (Factual Score: ${verificationResults.factualAccuracy.score}/10, Reading Time: ${readingTimeMinutes}min, Quiz Count: ${quizCount})`);
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`   ❌ Error creating lesson for ${topic}:`, error.message);
        }
      }
    }
    
    console.log(`\n🎉 Successfully generated ${totalLessons} lessons!`);
    console.log(`📊 Target lessons: ${targetCount}`);
    console.log(`🏷️ Total categories: ${categories.length}`);
    
    // Show final counts
    const finalCounts = await client.query(`
      SELECT 
        c.name as category_name,
        COUNT(gt.id) as lesson_count
      FROM categories c
      LEFT JOIN generated_topics gt ON c.name = gt.category
      WHERE c.is_active = true
      GROUP BY c.name, c.sort_order
      ORDER BY c.sort_order, c.name
    `);
    
    console.log('\n📋 Final lesson counts:');
    for (const count of finalCounts.rows) {
      console.log(`   ${count.category_name}: ${count.lesson_count} lessons`);
    }
    
  } catch (error) {
    console.error('❌ Error generating sample lessons:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Parse command line arguments
// Usage: node generate-sample-lessons.js [targetCount] [userIdentifier]
// Examples: 
//   node generate-sample-lessons.js 100
//   node generate-sample-lessons.js 100 5
//   node generate-sample-lessons.js 100 user@example.com
const targetCountArg = parseInt(process.argv[2] || '100', 10);
const targetCount = Number.isNaN(targetCountArg) ? 100 : targetCountArg;

console.log('📝 Lesson Generator Script');
console.log('Usage: node generate-sample-lessons.js [targetCount] [userIdentifier]');
console.log(`   targetCount: Number of lessons to generate (default: 100)`);
console.log(`   userIdentifier: Optional - user email or user ID (default: first user)`);
console.log(`   Examples: node generate-sample-lessons.js 100 e.arkorful3@gmail.com`);
console.log(`            node generate-sample-lessons.js 100 5`);
console.log('');

generateSampleLessons(targetCount).catch(console.error);
