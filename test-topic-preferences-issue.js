const axios = require('axios');

const SERVER_URL = 'http://13.218.173.57:3000';

async function testRegistrationWithTopicPreferences() {
  console.log('🧪 Testing registration with topicPreferences to identify the issue...');
  
  // Test 1: Without topicPreferences (should work)
  console.log('\n📝 Test 1: Registration WITHOUT topicPreferences');
  const userWithoutPrefs = {
    email: `user_no_prefs_${Date.now()}@test.com`,
    password: 'password123'
  };
  
  try {
    const response = await axios.post(`${SERVER_URL}/api/auth/register`, userWithoutPrefs, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    console.log('✅ SUCCESS: Registration without topicPreferences worked');
    console.log('   User ID:', response.data.user.id);
  } catch (error) {
    console.log('❌ FAILED: Registration without topicPreferences failed');
    console.log('   Error:', error.response?.data?.error || error.message);
  }
  
  // Test 2: With empty topicPreferences array (should work)
  console.log('\n📝 Test 2: Registration WITH empty topicPreferences array');
  const userWithEmptyPrefs = {
    email: `user_empty_prefs_${Date.now()}@test.com`,
    password: 'password123',
    topicPreferences: []
  };
  
  try {
    const response = await axios.post(`${SERVER_URL}/api/auth/register`, userWithEmptyPrefs, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    console.log('✅ SUCCESS: Registration with empty topicPreferences worked');
    console.log('   User ID:', response.data.user.id);
  } catch (error) {
    console.log('❌ FAILED: Registration with empty topicPreferences failed');
    console.log('   Error:', error.response?.data?.error || error.message);
  }
  
  // Test 3: With actual topicPreferences (this is what was failing)
  console.log('\n📝 Test 3: Registration WITH actual topicPreferences');
  const userWithPrefs = {
    email: `user_with_prefs_${Date.now()}@test.com`,
    password: 'password123',
    topicPreferences: ['science', 'technology']
  };
  
  try {
    const response = await axios.post(`${SERVER_URL}/api/auth/register`, userWithPrefs, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    console.log('✅ SUCCESS: Registration with topicPreferences worked');
    console.log('   User ID:', response.data.user.id);
  } catch (error) {
    console.log('❌ FAILED: Registration with topicPreferences failed (this was the original issue)');
    console.log('   Error:', error.response?.data?.error || error.message);
    
    if (error.response?.status === 500) {
      console.log('\n🔍 Analysis: The 500 error occurs when topicPreferences contains actual values');
      console.log('   This suggests an issue with:');
      console.log('   1. The user_preferences table structure');
      console.log('   2. The INSERT query for topic preferences');
      console.log('   3. Database constraints or foreign keys');
    }
  }
}

async function runTopicPreferencesTests() {
  try {
    await testRegistrationWithTopicPreferences();
    
    console.log('\n📋 Summary:');
    console.log('   - Registration works without topicPreferences');
    console.log('   - The issue is specifically with storing topic preferences');
    console.log('   - This is likely a database schema issue');
    
  } catch (error) {
    console.log('\n💥 Test suite failed:', error.message);
  }
}

// Run the tests
runTopicPreferencesTests();
