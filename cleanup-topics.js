const db = require('./db');

async function cleanupTopics() {
  console.log('🧹 Starting database cleanup...\n');

  try {
    // 1. Find topics with insufficient content (less than 200 characters)
    const shortTopics = await db.query(
      'SELECT id, topic, summary, LENGTH(summary) as summary_length FROM generated_topics WHERE LENGTH(summary) < 200'
    );

    console.log(`📝 Found ${shortTopics.rows.length} topics with insufficient content:`);
    shortTopics.rows.forEach(topic => {
      console.log(`   - ID ${topic.id}: "${topic.topic}" (${topic.summary_length} chars)`);
    });

    // 2. Find topics with malformed quiz data (JSON embedded in summary)
    const malformedTopics = await db.query(
      `SELECT id, topic, summary FROM generated_topics 
       WHERE summary LIKE '%"quiz":%' OR summary LIKE '%"question":%'`
    );

    console.log(`\n🔧 Found ${malformedTopics.rows.length} topics with malformed quiz data:`);
    malformedTopics.rows.forEach(topic => {
      console.log(`   - ID ${topic.id}: "${topic.topic}"`);
    });

    // 3. Delete topics with insufficient content
    if (shortTopics.rows.length > 0) {
      const shortTopicIds = shortTopics.rows.map(t => t.id);
      await db.query(
        'DELETE FROM generated_topics WHERE id = ANY($1)',
        [shortTopicIds]
      );
      console.log(`\n✅ Deleted ${shortTopics.rows.length} topics with insufficient content`);
    }

    // 4. Fix malformed topics by extracting quiz data and cleaning summary
    for (const topic of malformedTopics.rows) {
      try {
        // Try to parse the summary as JSON
        const parsed = JSON.parse(topic.summary);
        
        if (parsed.summary && parsed.quiz) {
          // Extract clean summary and quiz data
          const cleanSummary = parsed.summary;
          const quizData = parsed.quiz;
          
          // Update the topic with clean data
          await db.query(
            'UPDATE generated_topics SET summary = $1, quiz_data = $2 WHERE id = $3',
            [cleanSummary, JSON.stringify(quizData), topic.id]
          );
          
          console.log(`   ✅ Fixed topic ID ${topic.id}: "${topic.topic}"`);
        }
      } catch (parseError) {
        console.log(`   ❌ Could not parse topic ID ${topic.id}: "${topic.topic}"`);
      }
    }

    // 5. Show final statistics
    const finalCount = await db.query('SELECT COUNT(*) as total FROM generated_topics');
    console.log(`\n📊 Final database state: ${finalCount.rows[0].total} topics remaining`);

    // 6. Show sample of cleaned topics
    const sampleTopics = await db.query(
      'SELECT id, topic, LENGTH(summary) as summary_length FROM generated_topics ORDER BY summary_length DESC LIMIT 5'
    );
    
    console.log('\n📋 Sample of remaining topics:');
    sampleTopics.rows.forEach(topic => {
      console.log(`   - ID ${topic.id}: "${topic.topic}" (${topic.summary_length} chars)`);
    });

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

cleanupTopics();
