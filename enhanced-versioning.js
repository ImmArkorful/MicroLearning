const { Pool } = require('pg');
const axios = require('axios');

// Load environment variables
require("dotenv").config();

// Database configuration
const pool = new Pool({
  user: process.env.PG_USER || 'postgres',
  host: process.env.PG_HOST || 'localhost',
  database: process.env.PG_DATABASE || 'microapp',
  password: process.env.PG_PASSWORD || 'Emmakwesi2',
  port: process.env.PG_PORT || 5433,
});

// Enhanced versioning logic
class EnhancedVersioning {
  
  // Check for exact and similar topics
  static async checkTopicExists(userId, category, topic) {
    try {
      // Check for exact match
      const exactMatch = await pool.query(
        `SELECT id, topic, summary, quiz_data, created_at 
         FROM generated_topics 
         WHERE user_id = $1 AND category = $2 AND LOWER(topic) = LOWER($3)
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, category, topic]
      );

      if (exactMatch.rows.length > 0) {
        return {
          type: 'exact',
          topic: exactMatch.rows[0],
          message: 'This exact topic already exists'
        };
      }

      // Check for similar topics
      const similarTopics = await pool.query(
        `SELECT id, topic, summary, quiz_data, created_at 
         FROM generated_topics 
         WHERE user_id = $1 AND category = $2 AND (
           LOWER(topic) LIKE LOWER($3) OR 
           LOWER($3) LIKE LOWER(topic) OR
           (LOWER(topic) LIKE LOWER($4) AND LOWER($3) LIKE LOWER($4))
         )
         ORDER BY created_at DESC`,
        [userId, category, `%${topic}%`, topic]
      );

      if (similarTopics.rows.length > 0) {
        return {
          type: 'similar',
          topics: similarTopics.rows,
          message: `Found ${similarTopics.rows.length} similar topics`
        };
      }

      return {
        type: 'new',
        message: 'This is a new topic'
      };
    } catch (error) {
      console.error('Error checking topic existence:', error);
      throw error;
    }
  }

  // Generate smart topic name
  static generateTopicName(baseTopic, versionNumber, similarTopics = []) {
    if (versionNumber === 1) {
      return baseTopic;
    }

    // Extract common patterns from similar topics
    const patterns = this.extractNamingPatterns(similarTopics);
    
    if (patterns.hasSuffix) {
      // Use existing suffix pattern
      return `${baseTopic} ${patterns.suffix} (v${versionNumber})`;
    } else if (patterns.hasPrefix) {
      // Use existing prefix pattern
      return `${patterns.prefix} ${baseTopic} (v${versionNumber})`;
    } else {
      // Generate descriptive suffix based on version
      const suffixes = [
        'Advanced Concepts',
        'Practical Applications', 
        'Real-World Examples',
        'Deep Dive',
        'Comprehensive Guide',
        'Essential Principles',
        'Core Fundamentals',
        'Expert Insights'
      ];
      
      const suffix = suffixes[(versionNumber - 2) % suffixes.length];
      return `${baseTopic} - ${suffix} (v${versionNumber})`;
    }
  }

  // Extract naming patterns from existing topics
  static extractNamingPatterns(topics) {
    const patterns = {
      hasSuffix: false,
      hasPrefix: false,
      suffix: '',
      prefix: ''
    };

    if (topics.length === 0) return patterns;

    // Look for common suffixes
    const suffixes = ['Basics', 'Fundamentals', 'Advanced', 'Essentials', 'Core', 'Principles'];
    const prefixes = ['Introduction to', 'Understanding', 'Mastering', 'Exploring', 'Learning'];

    for (const topic of topics) {
      const topicName = topic.topic.toLowerCase();
      
      // Check for suffixes
      for (const suffix of suffixes) {
        if (topicName.includes(suffix.toLowerCase())) {
          patterns.hasSuffix = true;
          patterns.suffix = suffix;
          break;
        }
      }

      // Check for prefixes
      for (const prefix of prefixes) {
        if (topicName.includes(prefix.toLowerCase())) {
          patterns.hasPrefix = true;
          patterns.prefix = prefix;
          break;
        }
      }
    }

    return patterns;
  }

  // Calculate next version number
  static calculateVersionNumber(similarTopics) {
    if (similarTopics.length === 0) return 1;

    const versionNumbers = similarTopics
      .map(topic => {
        const versionMatch = topic.topic.match(/\(v(\d+)\)$/i);
        return versionMatch ? parseInt(versionMatch[1]) : 1;
      })
      .filter(num => !isNaN(num));

    return versionNumbers.length > 0 ? Math.max(...versionNumbers) + 1 : 2;
  }

  // Generate content with version-aware prompts
  static async generateVersionedContent(topic, category, versionNumber, similarTopics = []) {
    try {
      // Create version-aware prompt
      const versionPrompt = this.createVersionPrompt(topic, category, versionNumber, similarTopics);

      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "mistralai/mistral-7b-instruct",
          messages: [
            {
              role: "system",
              content: versionPrompt
            },
            {
              role: "user",
              content: `Create educational content about "${topic}" in the context of ${category}. ${versionNumber > 1 ? `This is version ${versionNumber}, so provide different perspectives or approaches.` : ''}`
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error generating versioned content:', error);
      throw error;
    }
  }

  // Create version-aware prompt
  static createVersionPrompt(topic, category, versionNumber, similarTopics) {
    let prompt = `You are an expert educator specializing in ${category}. Create engaging, educational content that is:
1. Clear and easy to understand for everyday learners
2. Practical and immediately applicable to daily life
3. Includes real-world examples and actionable insights
4. Focuses on skills and knowledge that improve quality of life
5. Encourages curiosity and further learning`;

    if (versionNumber > 1) {
      prompt += `\n\nThis is version ${versionNumber} of "${topic}". Please ensure this content:`;
      prompt += `\n- Provides different perspectives or approaches from previous versions`;
      prompt += `\n- Covers new aspects or applications of the topic`;
      prompt += `\n- Builds upon but doesn't repeat previous content`;
      prompt += `\n- Offers fresh examples and insights`;
    }

    prompt += `\n\nFormat your response as JSON:
{
  "summary": "A comprehensive but concise explanation of the topic with practical applications and real-world examples (2-3 paragraphs). Focus on how this knowledge can be applied in everyday situations.",
  "quiz": {
    "question": "A practical question that tests understanding of how to apply this knowledge in real life",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "The correct option"
  }
}`;

    return prompt;
  }

  // Handle topic generation with enhanced versioning
  static async handleTopicGeneration(userId, category, topic) {
    try {
      // Check existing topics
      const checkResult = await this.checkTopicExists(userId, category, topic);
      
      if (checkResult.type === 'exact') {
        return {
          action: 'return_existing',
          topic: checkResult.topic,
          message: 'Using existing content for this exact topic'
        };
      }

      let versionNumber = 1;
      let topicName = topic;
      let similarTopics = [];

      if (checkResult.type === 'similar') {
        similarTopics = checkResult.topics;
        versionNumber = this.calculateVersionNumber(similarTopics);
        topicName = this.generateTopicName(topic, versionNumber, similarTopics);
      }

      // Generate new content
      const content = await this.generateVersionedContent(topic, category, versionNumber, similarTopics);
      
      return {
        action: 'create_new',
        content: content,
        topicName: topicName,
        versionNumber: versionNumber,
        isNewVersion: versionNumber > 1,
        similarTopics: similarTopics,
        message: versionNumber > 1 ? `Created version ${versionNumber} of this topic` : 'New topic created successfully'
      };

    } catch (error) {
      console.error('Error in enhanced topic generation:', error);
      throw error;
    }
  }
}

// Test the enhanced versioning system
async function testEnhancedVersioning() {
  try {
    console.log('🧪 Testing Enhanced Versioning System...\n');

    const userId = 1; // Test user ID
    const category = 'Technology';
    
    // Test 1: New topic
    console.log('=== Test 1: New Topic ===');
    const result1 = await EnhancedVersioning.handleTopicGeneration(userId, category, 'Artificial Intelligence');
    console.log('Result:', result1.action, result1.message);
    
    // Test 2: Similar topic (should create v2)
    console.log('\n=== Test 2: Similar Topic ===');
    const result2 = await EnhancedVersioning.handleTopicGeneration(userId, category, 'AI Basics');
    console.log('Result:', result2.action, result2.topicName, result2.message);
    
    // Test 3: Exact duplicate
    console.log('\n=== Test 3: Exact Duplicate ===');
    const result3 = await EnhancedVersioning.handleTopicGeneration(userId, category, 'Artificial Intelligence');
    console.log('Result:', result3.action, result3.message);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

// Export for use in other files
module.exports = { EnhancedVersioning };

// Run test if this file is executed directly
if (require.main === module) {
  testEnhancedVersioning();
}
