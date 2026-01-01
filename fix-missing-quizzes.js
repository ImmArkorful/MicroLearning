/* eslint-disable no-await-in-loop */
const axios = require('axios');
const db = require('./db');
require('dotenv').config();

const PLACEHOLDER_MATCHES = [
  '%Quiz data unavailable%',
  '%Error parsing quiz%',
  '%Quiz data missing%',
];

const createFallbackQuiz = (topic = 'this topic') => ({
  question: `What is the main concept of ${topic}?`,
  options: [
    `The primary principle of ${topic}`,
    `A fundamental aspect of ${topic}`,
    `The core concept in ${topic}`,
    `An important element of ${topic}`,
  ],
  correctAnswer: `The primary principle of ${topic}`,
  explanation: `This question checks your understanding of ${topic}'s core concept.`,
});

const fetchTopicsNeedingQuizzes = async () => {
  const result = await db.query(
    `
      SELECT id, topic, category, summary
      FROM generated_topics
      WHERE quiz_data IS NULL
         OR quiz_data::text ILIKE $1
         OR quiz_data::text ILIKE $2
         OR quiz_data::text ILIKE $3
    `,
    PLACEHOLDER_MATCHES,
  );

  return result.rows;
};

const generateQuiz = async (topic, category, summary) => {
  const modelPrompt = {
    model: 'mistralai/mistral-7b-instruct',
    messages: [
      {
        role: 'system',
        content:
          'You are an educational expert. Create one multiple choice question about the given topic. Provide valid JSON only with keys: question, options (array of 4 strings), correctAnswer (string), explanation (string).',
      },
      {
        role: 'user',
        content: `Topic: ${topic}\nCategory: ${category}\nSummary:\n${summary}\n\nCreate the quiz JSON.`,
      },
    ],
  };

  const headers = {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', modelPrompt, {
    headers,
    timeout: 60000,
  });

  let content = response?.data?.choices?.[0]?.message?.content;
  if (!content) {
    return createFallbackQuiz(topic);
  }

  content = content.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(content);
    if (
      parsed?.question &&
      Array.isArray(parsed?.options) &&
      parsed.options.length === 4 &&
      parsed?.correctAnswer
    ) {
      return parsed;
    }
    return createFallbackQuiz(topic);
  } catch (error) {
    console.warn('Failed to parse AI quiz JSON, using fallback.', error.message);
    return createFallbackQuiz(topic);
  }
};

const saveQuiz = async (id, quiz) => {
  await db.query(
    `
      UPDATE generated_topics
      SET quiz_data = $1::jsonb,
          quiz_count = 1,
          updated_at = NOW()
      WHERE id = $2
    `,
    [JSON.stringify(quiz), id],
  );
};

const run = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set in environment variables.');
  }

  console.log('🔍 Looking for topics with missing quizzes…');
  const topics = await fetchTopicsNeedingQuizzes();

  if (!topics.length) {
    console.log('✅ No topics need quiz generation.');
    process.exit(0);
  }

  console.log(`🔧 Generating quizzes for ${topics.length} topics…`);

  for (const topic of topics) {
    const { id, topic: title, category, summary } = topic;

    console.log(`\n➡️ Topic #${id}: ${title || 'Untitled'} (${category || 'General'})`);
    try {
      const quiz = await generateQuiz(title || 'this topic', category || 'General', summary || '');
      await saveQuiz(id, quiz);
      console.log('✅ Quiz stored.');
    } catch (error) {
      console.error(`❌ Failed to generate quiz for topic ${id}:`, error.message);
    }
  }

  console.log('\n🎉 Quiz generation complete.');
  process.exit(0);
};

run().catch((error) => {
  console.error('❌ Quiz generation script failed:', error);
  process.exit(1);
});

