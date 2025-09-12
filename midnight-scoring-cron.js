#!/usr/bin/env node

/**
 * Midnight Scoring Cron Job
 * Runs every night at midnight to score topics that don't have scores yet
 */

const axios = require('axios');
const db = require('./db');
require('dotenv').config();

// Enhanced timeout configuration for slow connections
const TIMEOUT_CONFIG = {
  short: 15000,  // 15 seconds for quick operations
  medium: 30000, // 30 seconds for standard operations
  long: 60000,   // 60 seconds for complex operations
  retries: 2     // Number of retries for failed requests
};

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

// Function to score a single topic
const scoreTopic = async (topic) => {
  console.log(`\n🎯 Scoring topic: "${topic.topic}" (ID: ${topic.id})`);
  
  const verificationResults = {
    factualAccuracy: { score: 0, feedback: "", model: "" },
    educationalValue: { score: 0, feedback: "", model: "" },
    clarityAndEngagement: { score: 0, feedback: "", model: "" },
    overallQuality: { score: 0, feedback: "", model: "" }
  };

  try {
    // Parse the content
    const content = {
      summary: topic.summary,
      quiz: JSON.parse(topic.quiz_data || '{}')
    };

    // 1. Factual Accuracy using Mistral-7B
    try {
      const factualResponse = await makeApiCallWithRetry({
        method: 'post',
        url: "https://openrouter.ai/api/v1/chat/completions",
        data: {
          model: "mistralai/mistral-7b-instruct",
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
              content: `Topic: ${topic.topic}
Category: ${topic.category}
Content: ${content.summary}

Verify factual accuracy.`
            }
          ],
          max_tokens: 300
        },
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: TIMEOUT_CONFIG.medium
      }, "Factual Accuracy Check");

      const factualResult = JSON.parse(factualResponse.data.choices[0].message.content);
      verificationResults.factualAccuracy = {
        score: factualResult.score || 0,
        feedback: factualResult.feedback || "",
        model: "Mistral-7B"
      };
      console.log(`✅ Factual accuracy: ${factualResult.score}/10`);
    } catch (error) {
      console.log(`❌ Factual accuracy failed: ${error.message}`);
    }

    // 2. Educational Value using Llama-3.1
    try {
      const educationalResponse = await makeApiCallWithRetry({
        method: 'post',
        url: "https://openrouter.ai/api/v1/chat/completions",
        data: {
          model: "meta-llama/llama-3.1-8b-instruct",
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
              content: `Topic: ${topic.topic}
Category: ${topic.category}
Content: ${content.summary}
Quiz: ${JSON.stringify(content.quiz)}

Evaluate educational value.`
            }
          ],
          max_tokens: 300
        },
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: TIMEOUT_CONFIG.medium
      }, "Educational Value Check");

      const educationalResult = JSON.parse(educationalResponse.data.choices[0].message.content);
      verificationResults.educationalValue = {
        score: educationalResult.score || 0,
        feedback: educationalResult.feedback || "",
        model: "Llama-3.1"
      };
      console.log(`✅ Educational value: ${educationalResult.score}/10`);
    } catch (error) {
      console.log(`❌ Educational value failed: ${error.message}`);
    }

    // 3. Clarity and Engagement using Llama-3.1
    try {
      const clarityResponse = await makeApiCallWithRetry({
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
              content: `Topic: ${topic.topic}
Category: ${topic.category}
Content: ${content.summary}

Evaluate clarity and engagement.`
            }
          ],
          max_tokens: 300
        },
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: TIMEOUT_CONFIG.medium
      }, "Clarity and Engagement Check");

      const clarityResult = JSON.parse(clarityResponse.data.choices[0].message.content);
      verificationResults.clarityAndEngagement = {
        score: clarityResult.score || 0,
        feedback: clarityResult.feedback || "",
        model: "Llama-3.1"
      };
      console.log(`✅ Clarity and engagement: ${clarityResult.score}/10`);
    } catch (error) {
      console.log(`❌ Clarity and engagement failed: ${error.message}`);
    }

    // Calculate overall quality score
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
      console.log(`✅ Overall quality: ${verificationResults.overallQuality.score}/10`);
    }

    // Update database with scores
    await db.query(
      `UPDATE content_verification_results SET
        factual_accuracy_score = $1, factual_accuracy_feedback = $2, factual_accuracy_model = $3,
        educational_value_score = $4, educational_value_feedback = $5, educational_value_model = $6,
        clarity_engagement_score = $7, clarity_engagement_feedback = $8, clarity_engagement_model = $9,
        overall_quality_score = $10, overall_quality_feedback = $11, overall_quality_model = $12,
        meets_quality_standards = $13,
        verification_timestamp = CURRENT_TIMESTAMP
      WHERE topic_id = $14`,
      [
        verificationResults.factualAccuracy.score,
        verificationResults.factualAccuracy.feedback,
        verificationResults.factualAccuracy.model,
        verificationResults.educationalValue.score,
        verificationResults.educationalValue.feedback,
        verificationResults.educationalValue.model,
        verificationResults.clarityAndEngagement.score,
        verificationResults.clarityAndEngagement.feedback,
        verificationResults.clarityAndEngagement.model,
        verificationResults.overallQuality.score,
        verificationResults.overallQuality.feedback,
        verificationResults.overallQuality.model,
        verificationResults.overallQuality.score >= 7, // Quality threshold
        topic.id
      ]
    );

    console.log(`✅ Updated scores for topic ID: ${topic.id}`);
    return true;

  } catch (error) {
    console.error(`❌ Error scoring topic ${topic.id}:`, error.message);
    return false;
  }
};

// Main function to run the scoring job
const runMidnightScoring = async () => {
  console.log('🌙 Starting midnight scoring job...');
  console.log(`⏰ Job started at: ${new Date().toISOString()}`);

  try {
    // Find topics that need scoring (no scores or scores are 0)
    const topicsToScore = await db.query(`
      SELECT gt.id, gt.topic, gt.category, gt.summary, gt.quiz_data
      FROM generated_topics gt
      LEFT JOIN content_verification_results cvr ON gt.id = cvr.topic_id
      WHERE cvr.topic_id IS NULL 
         OR (cvr.factual_accuracy_score = 0 
             AND cvr.educational_value_score = 0 
             AND cvr.clarity_engagement_score = 0)
      ORDER BY gt.created_at ASC
      LIMIT 50
    `);

    console.log(`📊 Found ${topicsToScore.rows.length} topics to score`);

    if (topicsToScore.rows.length === 0) {
      console.log('✅ No topics need scoring - all caught up!');
      return;
    }

    let successCount = 0;
    let failureCount = 0;

    // Score topics in batches to avoid overwhelming the API
    for (let i = 0; i < topicsToScore.rows.length; i++) {
      const topic = topicsToScore.rows[i];
      
      try {
        const success = await scoreTopic(topic);
        if (success) {
          successCount++;
        } else {
          failureCount++;
        }
        
        // Add delay between topics to be respectful to the API
        if (i < topicsToScore.rows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
      } catch (error) {
        console.error(`❌ Failed to score topic ${topic.id}:`, error.message);
        failureCount++;
      }
    }

    console.log(`\n📊 Scoring job completed:`);
    console.log(`✅ Successfully scored: ${successCount} topics`);
    console.log(`❌ Failed to score: ${failureCount} topics`);
    console.log(`⏰ Job completed at: ${new Date().toISOString()}`);

  } catch (error) {
    console.error('❌ Midnight scoring job failed:', error);
  }
};

// Run the job if this script is executed directly
if (require.main === module) {
  runMidnightScoring()
    .then(() => {
      console.log('🎉 Midnight scoring job finished');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Midnight scoring job crashed:', error);
      process.exit(1);
    });
}

module.exports = { runMidnightScoring, scoreTopic };
