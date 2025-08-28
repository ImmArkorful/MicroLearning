const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'microapp',
  password: process.env.PG_PASSWORD || 'Emmakwesi2',
  port: process.env.PG_PORT || 5433,
});

const categories = [
  'Science', 'Technology', 'History', 'Geography', 'Mathematics', 
  'Literature', 'Art', 'Music', 'Sports', 'Philosophy', 'Psychology',
  'Economics', 'Politics', 'Biology', 'Chemistry', 'Physics', 'Astronomy'
];

async function generateRandomQuizzes(count = 20) {
  try {
    console.log(`🎯 Generating ${count} random quizzes...`);

    for (let i = 0; i < count; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      
      console.log(`\n📝 Generating quiz ${i + 1}/${count} for category: ${category}`);
      
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
        
        // Try to extract JSON from the response
        let quizData;
        try {
          // Look for JSON in the response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            quizData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } catch (parseError) {
          console.log(`⚠️ Failed to parse JSON, creating fallback quiz for ${category}`);
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

        // Validate quiz data
        if (!quizData.question || !quizData.options || !quizData.correct_answer) {
          console.log(`⚠️ Invalid quiz data for ${category}, skipping...`);
          continue;
        }

        // Ensure exactly 4 options
        if (!Array.isArray(quizData.options) || quizData.options.length !== 4) {
          console.log(`⚠️ Quiz must have exactly 4 options for ${category}, skipping...`);
          continue;
        }

        // Insert quiz into database
        await pool.query(`
          INSERT INTO random_quizzes (question, options, correct_answer, explanation, category)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          quizData.question,
          JSON.stringify(quizData.options),
          quizData.correct_answer,
          quizData.explanation || `This is the correct answer for the question about ${category}.`,
          category
        ]);

        console.log(`✅ Generated quiz: ${quizData.question.substring(0, 50)}...`);

        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Error generating quiz for ${category}:`, error.message);
        continue;
      }
    }

    // Record generation history
    await pool.query(`
      INSERT INTO quiz_generation_history (batch_size, categories, status)
      VALUES ($1, $2, $3)
    `, [count, categories, 'completed']);

    console.log(`\n🎉 Successfully generated ${count} random quizzes!`);

  } catch (error) {
    console.error('❌ Error in quiz generation:', error);
  } finally {
    await pool.end();
  }
}

// Load environment variables
require('dotenv').config();

// Generate quizzes
generateRandomQuizzes(30); // Generate 30 initial quizzes
