const axios = require('axios');
const db = require('./db');
require('dotenv').config();

// Timeout configuration
const TIMEOUT_CONFIG = {
  short: 10000,   // 10 seconds
  medium: 30000,  // 30 seconds
  long: 60000     // 60 seconds
};

// Retry configuration
const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelay: 1000
};

// Function to make API calls with retry logic
const makeApiCallWithRetry = async (config, operationName) => {
  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`🔄 ${operationName} - Attempt ${attempt}/${RETRY_CONFIG.maxRetries}`);
      const response = await axios(config);
      console.log(`✅ ${operationName} - Success on attempt ${attempt}`);
      return response;
    } catch (error) {
      console.log(`❌ ${operationName} - Attempt ${attempt} failed: ${error.message}`);
      if (attempt === RETRY_CONFIG.maxRetries) {
        throw error;
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.baseDelay * attempt));
    }
  }
};

// Function to clean and parse JSON response
const parseJsonResponse = (responseContent, modelName) => {
  try {
    // Clean the response content
    const cleanedContent = responseContent
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .replace(/\n/g, ' ')
      .trim();
    
    return JSON.parse(cleanedContent);
  } catch (parseError) {
    console.log(`⚠️ Failed to parse ${modelName} response`);
    console.log("Parse error:", parseError.message);
    console.log("Response content:", responseContent);
    
    // Try to extract score from response if JSON parsing fails
    const scoreMatch = responseContent.match(/"score":\s*(\d+)/);
    if (scoreMatch) {
      const extractedScore = parseInt(scoreMatch[1]);
      console.log(`✅ Extracted ${modelName} score: ${extractedScore}/10`);
      return { score: extractedScore, feedback: "Score extracted from response" };
    } else {
      console.log(`⚠️ ${modelName} parsing failed - no score extracted`);
      return null;
    }
  }
};

// Function to fix scores for a single topic
const fixTopicScores = async (topic) => {
  console.log(`\n🔧 Fixing scores for: "${topic.topic}" (ID: ${topic.id})`);
  
  const verificationResults = {
    factualAccuracy: { score: null, feedback: "", model: "" },
    educationalValue: { score: null, feedback: "", model: "" },
    clarityAndEngagement: { score: null, feedback: "", model: "" },
    overallQuality: { score: null, feedback: "", model: "" }
  };

  try {
    const content = {
      summary: topic.summary,
      quiz: topic.quiz_data || null
    };

    // 1. Fix Factual Accuracy if it's null
    if (!topic.factual_accuracy_score) {
      console.log("🔍 Fixing factual accuracy with Mistral-7B...");
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

        const factualResult = parseJsonResponse(factualResponse.data.choices[0].message.content, "Factual Accuracy");
        if (factualResult) {
          verificationResults.factualAccuracy = {
            score: factualResult.score,
            feedback: factualResult.feedback || "",
            model: "Mistral-7B"
          };
          console.log(`✅ Factual accuracy: ${factualResult.score}/10`);
        }
      } catch (error) {
        console.log(`❌ Factual accuracy failed: ${error.message}`);
      }
    } else {
      // Keep existing score
      verificationResults.factualAccuracy = {
        score: topic.factual_accuracy_score,
        feedback: topic.factual_accuracy_feedback || "",
        model: topic.factual_accuracy_model || "Mistral-7B"
      };
    }

    // 2. Fix Educational Value if it's null
    if (!topic.educational_value_score) {
      console.log("🎓 Fixing educational value with Llama-3.1...");
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

        const educationalResult = parseJsonResponse(educationalResponse.data.choices[0].message.content, "Educational Value");
        if (educationalResult) {
          verificationResults.educationalValue = {
            score: educationalResult.score,
            feedback: educationalResult.feedback || "",
            model: "Llama-3.1"
          };
          console.log(`✅ Educational value: ${educationalResult.score}/10`);
        }
      } catch (error) {
        console.log(`❌ Educational value failed: ${error.message}`);
      }
    } else {
      // Keep existing score
      verificationResults.educationalValue = {
        score: topic.educational_value_score,
        feedback: topic.educational_value_feedback || "",
        model: topic.educational_value_model || "Llama-3.1"
      };
    }

    // 3. Fix Clarity and Engagement if it's null
    if (!topic.clarity_engagement_score) {
      console.log("📝 Fixing clarity and engagement with Llama-3.1...");
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

        const clarityResult = parseJsonResponse(clarityResponse.data.choices[0].message.content, "Clarity and Engagement");
        if (clarityResult) {
          verificationResults.clarityAndEngagement = {
            score: clarityResult.score,
            feedback: clarityResult.feedback || "",
            model: "Llama-3.1"
          };
          console.log(`✅ Clarity and engagement: ${clarityResult.score}/10`);
        }
      } catch (error) {
        console.log(`❌ Clarity and engagement failed: ${error.message}`);
      }
    } else {
      // Keep existing score
      verificationResults.clarityAndEngagement = {
        score: topic.clarity_engagement_score,
        feedback: topic.clarity_engagement_feedback || "",
        model: topic.clarity_engagement_model || "Llama-3.1"
      };
    }

    // Calculate overall quality score
    const scores = [
      verificationResults.factualAccuracy.score,
      verificationResults.educationalValue.score,
      verificationResults.clarityAndEngagement.score
    ].filter(score => score > 0).map(score => Number(score));

    if (scores.length > 0) {
      const average = scores.reduce((a, b) => a + b, 0) / scores.length;
      const roundedScore = Math.round(average);
      verificationResults.overallQuality = {
        score: roundedScore,
        feedback: `Overall quality based on ${scores.length} verification models`,
        model: "Multi-Model Average"
      };
      console.log(`🔍 DEBUG: Scores array: [${scores.join(', ')}]`);
      console.log(`🔍 DEBUG: Average: ${average}, Rounded: ${roundedScore}`);
      console.log(`✅ Overall quality: ${verificationResults.overallQuality.score}/10`);
    }

    // Update database with all scores
    await db.query(
      `UPDATE content_verification_results SET
        factual_accuracy_score = $1, factual_accuracy_feedback = $2, factual_accuracy_model = $3,
        educational_value_score = $4, educational_value_feedback = $5, educational_value_model = $6,
        clarity_engagement_score = $7, clarity_engagement_feedback = $8, clarity_engagement_model = $9,
        overall_quality_score = $10, overall_quality_feedback = $11, overall_quality_model = $12,
        verification_timestamp = NOW()
      WHERE topic_id = $13`,
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
        topic.id
      ]
    );

    console.log(`✅ Updated all scores for topic ID: ${topic.id}`);
    return {
      success: true,
      topicId: topic.id,
      scores: verificationResults
    };

  } catch (error) {
    console.error(`❌ Error fixing scores for topic ${topic.id}:`, error.message);
    return {
      success: false,
      topicId: topic.id,
      error: error.message
    };
  }
};

// Main function to fix failed scores
async function fixFailedScores() {
  console.log('🔧 Starting fix for failed scores...');
  console.log('⏰ Started at:', new Date().toISOString());
  
  try {
    // Get topics that have null scores (failed parsing)
    const result = await db.query(`
      SELECT gt.id, gt.topic, gt.category, gt.summary, gt.quiz_data,
             cvr.factual_accuracy_score, cvr.educational_value_score, 
             cvr.clarity_engagement_score, cvr.factual_accuracy_feedback,
             cvr.educational_value_feedback, cvr.clarity_engagement_feedback,
             cvr.factual_accuracy_model, cvr.educational_value_model, cvr.clarity_engagement_model
      FROM generated_topics gt
      LEFT JOIN content_verification_results cvr ON gt.id = cvr.topic_id
      WHERE gt.summary IS NOT NULL 
        AND gt.summary != ''
        AND gt.summary != 'null'
        AND (cvr.factual_accuracy_score IS NULL 
             OR cvr.educational_value_score IS NULL 
             OR cvr.clarity_engagement_score IS NULL)
      ORDER BY gt.created_at DESC
    `);
    
    console.log(`📊 Found ${result.rows.length} topics with failed scores to fix`);
    
    let successCount = 0;
    let errorCount = 0;
    const results = [];
    
    // Process topics one by one to avoid overwhelming the API
    for (const topic of result.rows) {
      console.log(`\n📦 Processing topic ${topic.id}: ${topic.topic}`);
      
      const result = await fixTopicScores(topic);
      if (result.success) {
        successCount++;
        results.push(result);
      } else {
        errorCount++;
        console.error(`❌ Failed to fix topic ${topic.id}: ${result.error}`);
      }
      
      // Add delay between topics to be respectful to the API
      console.log('⏳ Waiting 1 second before next topic...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 Fix completed!');
    console.log(`✅ Successfully fixed: ${successCount} topics`);
    console.log(`❌ Failed: ${errorCount} topics`);
    console.log('⏰ Finished at:', new Date().toISOString());
    
    // Show some examples of fixed scores
    if (results.length > 0) {
      console.log('\n📊 Examples of fixed scores:');
      results.slice(0, 3).forEach(result => {
        const scores = result.scores;
        console.log(`- Topic ID ${result.topicId}:`);
        console.log(`  Factual: ${scores.factualAccuracy.score}/10 (${scores.factualAccuracy.model})`);
        console.log(`  Educational: ${scores.educationalValue.score}/10 (${scores.educationalValue.model})`);
        console.log(`  Clarity: ${scores.clarityAndEngagement.score}/10 (${scores.clarityAndEngagement.model})`);
        console.log(`  Overall: ${scores.overallQuality.score}/10 (${scores.overallQuality.model})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error during score fixing:', error.message);
  }
  
  process.exit(0);
}

// Run the fix
fixFailedScores();
