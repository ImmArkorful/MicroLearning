const db = require('./db');

async function fixRemainingTopics() {
  console.log('🔧 Fixing remaining malformed topics...\n');

  try {
    // Get all topics that still have malformed data
    const malformedTopics = await db.query(
      `SELECT id, topic, summary FROM generated_topics 
       WHERE summary LIKE '%"quiz":%' OR summary LIKE '%"question":%'`
    );

    console.log(`Found ${malformedTopics.rows.length} remaining malformed topics`);

    for (const topic of malformedTopics.rows) {
      console.log(`\nProcessing topic ID ${topic.id}: "${topic.topic}"`);
      
      try {
        // Try different parsing strategies
        let cleanSummary = topic.summary;
        let quizData = null;

        // Strategy 1: Try to extract JSON from the summary
        const jsonMatch = topic.summary.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.summary && parsed.quiz) {
              cleanSummary = parsed.summary;
              quizData = parsed.quiz;
              console.log(`   ✅ Extracted JSON data`);
            }
          } catch (e) {
            console.log(`   ❌ JSON parsing failed`);
          }
        }

        // Strategy 2: If no JSON found, try to extract quiz manually
        if (!quizData) {
          const questionMatch = topic.summary.match(/"question":\s*"([^"]+)"/);
          const optionsMatch = topic.summary.match(/"options":\s*\[([^\]]+)\]/);
          const answerMatch = topic.summary.match(/"correct_answer":\s*"([^"]+)"/);

          if (questionMatch && optionsMatch && answerMatch) {
            const question = questionMatch[1];
            const optionsStr = optionsMatch[1];
            const correctAnswer = answerMatch[1];

            // Parse options
            const options = optionsStr.split(',').map(opt => 
              opt.trim().replace(/^"/, '').replace(/"$/, '')
            );

            quizData = {
              question: question,
              options: options,
              correct_answer: correctAnswer
            };

            // Extract summary (everything before the quiz)
            const summaryEnd = topic.summary.indexOf('"quiz":');
            if (summaryEnd > 0) {
              cleanSummary = topic.summary.substring(0, summaryEnd).trim();
              // Remove trailing comma and clean up
              cleanSummary = cleanSummary.replace(/,\s*$/, '').trim();
            }

            console.log(`   ✅ Manually extracted quiz data`);
          }
        }

        // Update the topic if we found clean data
        if (quizData && cleanSummary !== topic.summary) {
          await db.query(
            'UPDATE generated_topics SET summary = $1, quiz_data = $2 WHERE id = $3',
            [cleanSummary, JSON.stringify(quizData), topic.id]
          );
          console.log(`   ✅ Updated topic successfully`);
        } else {
          console.log(`   ❌ Could not extract clean data`);
        }

      } catch (error) {
        console.log(`   ❌ Error processing topic: ${error.message}`);
      }
    }

    // Show final statistics
    const finalCount = await db.query('SELECT COUNT(*) as total FROM generated_topics');
    console.log(`\n📊 Final database state: ${finalCount.rows[0].total} topics`);

    // Check for any remaining malformed topics
    const remainingMalformed = await db.query(
      `SELECT COUNT(*) as count FROM generated_topics 
       WHERE summary LIKE '%"quiz":%' OR summary LIKE '%"question":%'`
    );
    
    console.log(`📋 Remaining malformed topics: ${remainingMalformed.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error during fix:', error);
  }
}

fixRemainingTopics();
