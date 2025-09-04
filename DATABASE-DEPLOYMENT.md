# 🚀 Database Deployment Guide

This guide shows you how to export your current database and deploy it to your new Ubuntu server.

## 📋 Prerequisites

- Your current database is running and accessible
- Ubuntu server is set up with PostgreSQL and Node.js
- SSH access to your Ubuntu server
- The server IP address

## 🔄 Step-by-Step Process

### **Step 1: Export Current Database (Local Machine)**

```bash
# Navigate to your backend directory
cd MicroApp

# Run the export script
node export-database.js
```

This will create a `database-export.json` file containing all your data.

**✅ Export Complete!** Your database has been exported with:
- **12 Categories** (Science, Technology, Business, Health, etc.)
- **143 Topics** with full content and quizzes
- **143 Content Verifications** with quality scores
- **2 Users** (without passwords for security)
- **16 User Preferences** (topic interests)
- **170 User Activities** (learning progress)
- **36 Random Quizzes** (daily challenges)

### **Step 2: Deploy to Ubuntu Server**

#### **Option A: Using the Automated Script (Recommended)**

```bash
# Make sure the script is executable
chmod +x deploy-to-server.sh

# Run the deployment script
./deploy-to-server.sh <SERVER_IP> <USERNAME>

# Example:
./deploy-to-server.sh 192.168.1.100 ubuntu
```

#### **Option B: Manual Deployment**

```bash
# 1. Create deployment package
tar -czf database-export.tar.gz \
    database-export.json \
    restore-database.js \
    package.json \
    .env.example \
    dbsetup.js

# 2. Copy to server
scp database-export.tar.gz ubuntu@<SERVER_IP>:~/

# 3. SSH into server and run setup
ssh ubuntu@<SERVER_IP>

# 4. On the server, extract and setup
tar -xzf database-export.tar.gz
npm install
node dbsetup.js
node restore-database.js
```

### **Step 3: Configure Environment Variables**

On your Ubuntu server, edit the `.env` file:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=learnflow
DB_USER=admin
DB_PASSWORD=your_secure_password

# Server
PORT=3000
NODE_ENV=production

# JWT Secret
JWT_SECRET=your_very_secure_jwt_secret_here

# AI API Keys (if you have them)
OPENROUTER_API_KEY=your_openrouter_api_key
```

### **Step 4: Generate Sample Lessons (Optional)**

If you want to populate your database with sample content:

```bash
# Generate 120 lessons (10 per category)
node generate-sample-lessons.js
```

This will create:
- **10 lessons per category** across all 12 categories
- **Full content** with summaries, key points, and quizzes
- **Quality verification** with factual accuracy scores
- **Public lessons** ready for users to access

### **Step 5: Start the Application**

```bash
# Start with PM2 (recommended for production)
pm2 start server.js --name "learnflow-backend"
pm2 save
pm2 startup

# Or start directly
npm start
```

## 🔧 Troubleshooting

### **Permission Issues**
If you get permission errors:
```bash
sudo -u postgres psql
CREATE USER admin WITH PASSWORD 'password' CREATEDB CREATEROLE SUPERUSER;
GRANT ALL PRIVILEGES ON DATABASE learnflow TO admin;
\q
```

### **Port Already in Use**
```bash
# Check what's using port 3000
sudo netstat -tlnp | grep :3000

# Kill the process if needed
sudo kill -9 <PID>
```

### **Database Connection Issues**
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check if database exists
sudo -u postgres psql -l
```

## 📊 What Gets Exported

The export includes:
- ✅ **Categories** (12 categories with descriptions)
- ✅ **Generated Topics** (143 topics with content)
- ✅ **Content Verification** (factual accuracy scores)
- ✅ **Users** (without passwords for security)
- ✅ **User Preferences** (topic interests)
- ✅ **User Activities** (learning progress)
- ✅ **Random Quizzes** (daily challenges)

## 🎯 Testing the Deployment

```bash
# Test if server is running
curl http://localhost:3000/api/health

# Test database connection
curl http://localhost:3000/api/lessons/categories

# Test from external machine
curl http://<SERVER_IP>:3000/api/lessons/categories
```

## 🔒 Security Notes

- **⚠️ IMPORTANT**: User passwords are NOT exported for security reasons
- Users will need to reset their passwords after restoration
- Change default passwords
- Use strong JWT secrets
- Configure firewall rules
- Keep dependencies updated
- Monitor server logs

## 📱 Frontend Updates

After deployment, update your frontend configuration:

```typescript
// LearnFlowApp/src/config/api.ts
export const LOCAL_IP = 'your_server_public_ip';
export const LOCAL_PORT = '3000';
```

## 🆘 Need Help?

If you encounter issues:
1. Check the server logs: `pm2 logs learnflow-backend`
2. Verify database connection: `node -e "require('./db').test()"`
3. Check PostgreSQL logs: `sudo tail -f /var/log/postgresql/postgresql-*.log`

---

**Happy Deploying! 🚀**
