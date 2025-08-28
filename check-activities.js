const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkActivities() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking Activities in Database...\n');
    
    // 1. Check all activity types
    console.log('1. All activity types in database:');
    const activityTypes = await client.query(`
      SELECT DISTINCT activity_type, COUNT(*) as count
      FROM user_activities
      GROUP BY activity_type
      ORDER BY count DESC;
    `);
    
    activityTypes.rows.forEach(row => {
      console.log(`  - ${row.activity_type}: ${row.count} activities`);
    });
    
    // 2. Check recent activities with details
    console.log('\n2. Recent activities (last 10):');
    const recentActivities = await client.query(`
      SELECT 
        id,
        user_id,
        activity_type,
        activity_data,
        related_id,
        related_type,
        created_at
      FROM user_activities
      ORDER BY created_at DESC
      LIMIT 10;
    `);
    
    recentActivities.rows.forEach((activity, index) => {
      console.log(`\n  Activity ${index + 1}:`);
      console.log(`    ID: ${activity.id}`);
      console.log(`    Type: ${activity.activity_type}`);
      console.log(`    User ID: ${activity.user_id}`);
      console.log(`    Related ID: ${activity.related_id}`);
      console.log(`    Related Type: ${activity.related_type}`);
      console.log(`    Created: ${activity.created_at}`);
      
      let activityData = {};
      try {
        activityData = typeof activity.activity_data === 'string' 
          ? JSON.parse(activity.activity_data) 
          : activity.activity_data;
        console.log(`    Data: ${JSON.stringify(activityData, null, 2)}`);
      } catch (e) {
        console.log(`    Data: Error parsing - ${activity.activity_data}`);
      }
    });
    
    // 3. Check for activities with missing related data
    console.log('\n3. Activities with missing related data:');
    const missingData = await client.query(`
      SELECT 
        ua.activity_type,
        ua.related_id,
        ua.related_type,
        COUNT(*) as count
      FROM user_activities ua
      LEFT JOIN generated_topics gt ON ua.related_id = gt.id AND ua.related_type = 'topic'
      LEFT JOIN random_quizzes rq ON ua.related_id = rq.id AND ua.related_type = 'quiz'
      WHERE gt.id IS NULL AND rq.id IS NULL AND ua.related_id IS NOT NULL
      GROUP BY ua.activity_type, ua.related_id, ua.related_type
      ORDER BY count DESC;
    `);
    
    if (missingData.rows.length > 0) {
      missingData.rows.forEach(row => {
        console.log(`  - ${row.activity_type} (${row.related_type} ID ${row.related_id}): ${row.count} activities`);
      });
    } else {
      console.log('  ✅ All activities have valid related data');
    }
    
  } catch (error) {
    console.error('Error checking activities:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkActivities();
