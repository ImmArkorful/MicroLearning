const db = require('./db');

const sampleQuizzes = [
  {
    question: "What is the capital of France?",
    options: ["London", "Berlin", "Paris", "Madrid"],
    correct_answer: "Paris",
    explanation: "Paris is the capital and largest city of France. It is known as the 'City of Light' and is famous for its culture, art, fashion, and cuisine.",
    category: "Geography"
  },
  {
    question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Saturn"],
    correct_answer: "Mars",
    explanation: "Mars is called the Red Planet because of its reddish appearance, which is due to iron oxide (rust) on its surface.",
    category: "Science"
  },
  {
    question: "What is the largest ocean on Earth?",
    options: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean"],
    correct_answer: "Pacific Ocean",
    explanation: "The Pacific Ocean is the largest and deepest ocean on Earth, covering about one-third of the Earth's surface.",
    category: "Geography"
  },
  {
    question: "Who wrote 'Romeo and Juliet'?",
    options: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"],
    correct_answer: "William Shakespeare",
    explanation: "William Shakespeare wrote 'Romeo and Juliet' in the late 16th century. It is one of his most famous tragedies.",
    category: "Literature"
  },
  {
    question: "What is the chemical symbol for gold?",
    options: ["Ag", "Au", "Fe", "Cu"],
    correct_answer: "Au",
    explanation: "Au is the chemical symbol for gold, derived from the Latin word 'aurum'.",
    category: "Science"
  },
  {
    question: "Which year did World War II end?",
    options: ["1943", "1944", "1945", "1946"],
    correct_answer: "1945",
    explanation: "World War II ended in 1945 with the surrender of Germany in May and Japan in September.",
    category: "History"
  },
  {
    question: "What is the main component of the sun?",
    options: ["Liquid lava", "Molten iron", "Hot plasma", "Solid rock"],
    correct_answer: "Hot plasma",
    explanation: "The sun is primarily composed of hot plasma, which is a state of matter where atoms are ionized.",
    category: "Science"
  },
  {
    question: "How many sides does a hexagon have?",
    options: ["5", "6", "7", "8"],
    correct_answer: "6",
    explanation: "A hexagon is a polygon with six sides and six angles.",
    category: "Mathematics"
  },
  {
    question: "What is the largest mammal in the world?",
    options: ["African Elephant", "Blue Whale", "Giraffe", "Polar Bear"],
    correct_answer: "Blue Whale",
    explanation: "The blue whale is the largest mammal in the world, reaching lengths of up to 100 feet and weights of up to 200 tons.",
    category: "Science"
  },
  {
    question: "Which country is home to the kangaroo?",
    options: ["New Zealand", "South Africa", "Australia", "Brazil"],
    correct_answer: "Australia",
    explanation: "Kangaroos are native to Australia and are one of the country's most iconic animals.",
    category: "Geography"
  }
];

async function addSampleRandomQuizzes() {
  try {
    console.log('🎯 Adding sample random quizzes...');
    
    for (const quiz of sampleQuizzes) {
      await db.query(
        `INSERT INTO random_quizzes (question, options, correct_answer, explanation, category, difficulty, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [
          quiz.question,
          JSON.stringify(quiz.options),
          quiz.correct_answer,
          quiz.explanation,
          quiz.category,
          'medium',
          true
        ]
      );
    }
    
    console.log(`✅ Added ${sampleQuizzes.length} sample random quizzes`);
    
    // Check how many quizzes are now in the database
    const result = await db.query('SELECT COUNT(*) as total FROM random_quizzes WHERE is_active = true');
    console.log(`📊 Total active random quizzes: ${result.rows[0].total}`);
    
  } catch (error) {
    console.error('❌ Error adding sample quizzes:', error);
  } finally {
    process.exit(0);
  }
}

addSampleRandomQuizzes();
