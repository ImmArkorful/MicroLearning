const fs = require('fs');
const path = require('path');

console.log('🔧 Setting up environment variables for MicroApp...\n');

const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

// Create .env.example if it doesn't exist
const envExampleContent = `# Google Cloud Configuration
# Add your Google Cloud API key here for Text-to-Speech functionality
GOOGLE_CLOUD_API_KEY=your-google-cloud-api-key-here

# Database Configuration
DATABASE_URL=sqlite:./learnflow.db

# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# OpenRouter API (for content generation)
OPENROUTER_API_KEY=your-openrouter-api-key
`;

if (!fs.existsSync(envExamplePath)) {
  fs.writeFileSync(envExamplePath, envExampleContent);
  console.log('✅ Created .env.example file');
}

// Check if .env exists
if (fs.existsSync(envPath)) {
  console.log('📁 .env file already exists');
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  if (!envContent.includes('GOOGLE_CLOUD_API_KEY=')) {
    console.log('⚠️  GOOGLE_CLOUD_API_KEY is missing from .env file');
    console.log('   Please add: GOOGLE_CLOUD_API_KEY=your-api-key-here');
  } else {
    console.log('✅ GOOGLE_CLOUD_API_KEY is configured');
  }
} else {
  console.log('📝 Creating .env file...');
  console.log('   Please add your Google Cloud API key to the .env file');
  console.log('   Example: GOOGLE_CLOUD_API_KEY=your-api-key-here');
  
  // Create a basic .env file
  const basicEnvContent = `# Google Cloud Configuration
GOOGLE_CLOUD_API_KEY=

# Database Configuration
DATABASE_URL=sqlite:./learnflow.db

# Server Configuration
PORT=3000
NODE_ENV=development

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# OpenRouter API (for content generation)
OPENROUTER_API_KEY=
`;
  
  fs.writeFileSync(envPath, basicEnvContent);
  console.log('✅ Created .env file');
}

console.log('\n📋 Next steps:');
console.log('1. Get your Google Cloud API key from: https://console.cloud.google.com/apis/credentials');
console.log('2. Enable the Text-to-Speech API in your Google Cloud project');
console.log('3. Add your API key to the .env file');
console.log('4. Run: npm start');
console.log('\n🎯 The TTS functionality will work once you add your Google Cloud API key!');
