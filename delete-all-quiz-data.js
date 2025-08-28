const db = require('./db');

async function deleteAllQuizData() {
  try {
    console.log('🗑️ Starting to delete all quiz data...');
    
    // Delete all topic interactions that are quiz type
    const deleteQuizInteractions = await db.query(
      'DELETE FROM topic_interactions WHERE interaction_type = $1',
      ['quiz']
    );
    console.log(`✅ Deleted ${deleteQuizInteractions.rowCount} quiz interactions`);
    
    // Delete all quiz-related user activities
    const deleteQuizActivities = await db.query(
      'DELETE FROM user_activities WHERE activity_type = $1',
      ['quiz_completed']
    );
    console.log(`✅ Deleted ${deleteQuizActivities.rowCount} quiz activities`);
    
    // Reset quiz scores in learning history (this will be recalculated)
    const resetQuizScores = await db.query(
      'UPDATE user_activities SET activity_data = NULL WHERE activity_type = $1',
      ['quiz_completed']
    );
    console.log(`✅ Reset quiz scores for ${resetQuizScores.rowCount} activities`);
    
    console.log('🎉 All quiz data has been deleted successfully!');
    
  } catch (error) {
    console.error('❌ Error deleting quiz data:', error);
  } finally {
    process.exit(0);
  }
}

deleteAllQuizData();
