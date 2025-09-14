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

// Function to score a single topic with all AI models
const recalculateTopicScores = async (topic) => {
  console.log(`\n🎯 Recalculating scores for: "${topic.topic}" (ID: ${topic.id})`);
  
  const verificationResults = {
    factualAccuracy: { score: null, feedback: "", model: "" },
    educationalValue: { score: null, feedback: "", model: "" },
    clarityAndEngagement: { score: null, feedback: "", model: "" },
    overallQuality: { score: null, feedback: "", model: "" }
  };

  try {
    // Parse the content
    const content = {
      summary: topic.summary,
      quiz: topic.quiz_data || null
    };

    // 1. Factual Accuracy using Mistral-7B
    console.log("🔍 Recalculating factual accuracy with Mistral-7B...");
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

      const responseContent = factualResponse.data.choices[0].message.content;
      console.log("🔍 Raw factual accuracy response:", responseContent);
      
      let factualResult;
      try {
        // Clean the response content
        const cleanedContent = responseContent
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .replace(/\n/g, ' ')
          .trim();
        
        factualResult = JSON.parse(cleanedContent);
        verificationResults.factualAccuracy = {
          score: factualResult.score || null,
          feedback: factualResult.feedback || "",
          model: "Mistral-7B"
        };
        console.log(`✅ Factual accuracy: ${factualResult.score}/10`);
      } catch (parseError) {
        console.log("⚠️ Failed to parse factual accuracy response");
        console.log("Parse error:", parseError.message);
        console.log("Response content:", responseContent);
        
        // Try to extract score from response if JSON parsing fails
        const scoreMatch = responseContent.match(/"score":\s*(\d+)/);
        if (scoreMatch) {
          const extractedScore = parseInt(scoreMatch[1]);
          verificationResults.factualAccuracy = {
            score: extractedScore,
            feedback: "Score extracted from response",
            model: "Mistral-7B"
          };
          console.log(`✅ Extracted factual accuracy score: ${extractedScore}/10`);
        } else {
          console.log("⚠️ Factual accuracy parsing failed - will be scored by cron job");
        }
      }
    } catch (error) {
      console.log(`❌ Factual accuracy failed: ${error.message}`);
    }

    // 2. Educational Value using Llama-3.1
    console.log("🎓 Recalculating educational value with Llama-3.1...");
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

      const responseContent = educationalResponse.data.choices[0].message.content;
      console.log("🔍 Raw educational value response:", responseContent);
      
      let educationalResult;
      try {
        // Clean the response content
        const cleanedContent = responseContent
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .replace(/\n/g, ' ')
          .trim();
        
        educationalResult = JSON.parse(cleanedContent);
        verificationResults.educationalValue = {
          score: educationalResult.score || null,
          feedback: educationalResult.feedback || "",
          model: "Llama-3.1"
        };
        console.log(`✅ Educational value: ${educationalResult.score}/10`);
      } catch (parseError) {
        console.log("⚠️ Failed to parse educational value response");
        console.log("Parse error:", parseError.message);
        console.log("Response content:", responseContent);
        
        // Try to extract score from response if JSON parsing fails
        const scoreMatch = responseContent.match(/"score":\s*(\d+)/);
        if (scoreMatch) {
          const extractedScore = parseInt(scoreMatch[1]);
          verificationResults.educationalValue = {
            score: extractedScore,
            feedback: "Score extracted from response",
            model: "Llama-3.1"
          };
          console.log(`✅ Extracted educational value score: ${extractedScore}/10`);
        } else {
          console.log("⚠️ Educational value parsing failed - will be scored by cron job");
        }
      }
    } catch (error) {
      console.log(`❌ Educational value failed: ${error.message}`);
    }

    // 3. Clarity and Engagement using Llama-3.1
    console.log("📝 Recalculating clarity and engagement with Llama-3.1...");
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

      const responseContent = clarityResponse.data.choices[0].message.content;
      console.log("🔍 Raw clarity response:", responseContent);
      
      let clarityResult;
      try {
        // Clean the response content
        const cleanedContent = responseContent
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .replace(/\n/g, ' ')
          .trim();
        
        clarityResult = JSON.parse(cleanedContent);
        verificationResults.clarityAndEngagement = {
          score: clarityResult.score || null,
          feedback: clarityResult.feedback || "",
          model: "Llama-3.1"
        };
        console.log(`✅ Clarity and engagement: ${clarityResult.score}/10`);
      } catch (parseError) {
        console.log("⚠️ Failed to parse clarity response");
        console.log("Parse error:", parseError.message);
        console.log("Response content:", responseContent);
        
        // Try to extract score from response if JSON parsing fails
        const scoreMatch = responseContent.match(/"score":\s*(\d+)/);
        if (scoreMatch) {
          const extractedScore = parseInt(scoreMatch[1]);
          verificationResults.clarityAndEngagement = {
            score: extractedScore,
            feedback: "Score extracted from response",
            model: "Llama-3.1"
          };
          console.log(`✅ Extracted clarity score: ${extractedScore}/10`);
        } else {
          console.log("⚠️ Clarity parsing failed - will be scored by cron job");
        }
      }
    } catch (error) {
      console.log(`❌ Clarity and engagement failed: ${error.message}`);
    }

    // Calculate overall quality score
    const scores = [
      verificationResults.factualAccuracy.score,
      verificationResults.educationalValue.score,
      verificationResults.clarityAndEngagement.score
    ].filter(score => score > 0).map(score => Number(score));

    if (scores.length > 0) {
      const average = scores.reduce((a, b) => a + b, 0) / scores.length;
      // Standard rounding: 6.33 → 6, 6.5 → 7, 6.67 → 7
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
    console.error(`❌ Error recalculating scores for topic ${topic.id}:`, error.message);
    return {
      success: false,
      topicId: topic.id,
      error: error.message
    };
  }
};

// Main function to recalculate all scores
async function recalculateAllScores() {
  console.log('🔄 Starting comprehensive score recalculation...');
  console.log('⏰ Started at:', new Date().toISOString());
  
  try {
    // Get all topics that have content
    const result = await db.query(`
      SELECT gt.id, gt.topic, gt.category, gt.summary, gt.quiz_data
      FROM generated_topics gt
      WHERE gt.summary IS NOT NULL 
        AND gt.summary != ''
        AND gt.summary != 'null'
      ORDER BY gt.created_at DESC
    `);
    
    console.log(`📊 Found ${result.rows.length} topics to recalculate`);
    
    let successCount = 0;
    let errorCount = 0;
    const results = [];
    
    // Process topics in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < result.rows.length; i += batchSize) {
      const batch = result.rows.slice(i, i + batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(result.rows.length/batchSize)} (${batch.length} topics)`);
      
      const batchPromises = batch.map(topic => recalculateTopicScores(topic));
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successCount++;
          results.push(result.value);
        } else {
          errorCount++;
          console.error(`❌ Failed to process topic ${batch[index].id}: ${result.reason || result.value?.error}`);
        }
      });
      
      // Add delay between batches to be respectful to the API
      if (i + batchSize < result.rows.length) {
        console.log('⏳ Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log('\n🎉 Score recalculation completed!');
    console.log(`✅ Successfully processed: ${successCount} topics`);
    console.log(`❌ Failed: ${errorCount} topics`);
    console.log('⏰ Finished at:', new Date().toISOString());
    
    // Show some examples of updated scores
    if (results.length > 0) {
      console.log('\n📊 Examples of updated scores:');
      results.slice(0, 5).forEach(result => {
        const scores = result.scores;
        console.log(`- Topic ID ${result.topicId}:`);
        console.log(`  Factual: ${scores.factualAccuracy.score}/10 (${scores.factualAccuracy.model})`);
        console.log(`  Educational: ${scores.educationalValue.score}/10 (${scores.educationalValue.model})`);
        console.log(`  Clarity: ${scores.clarityAndEngagement.score}/10 (${scores.clarityAndEngagement.model})`);
        console.log(`  Overall: ${scores.overallQuality.score}/10 (${scores.overallQuality.model})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error during score recalculation:', error.message);
  }
  
  process.exit(0);
}

// Run the recalculation
recalculateAllScores();
