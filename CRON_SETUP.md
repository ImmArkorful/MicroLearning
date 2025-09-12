# Midnight Scoring Cron Job Setup

This guide explains how to set up the midnight scoring cron job to automatically score topics that don't have scores yet.

## Overview

The midnight scoring job runs every night at midnight to:
- Find topics without scores (or with 0 scores)
- Score them using AI models (Mistral-7B, Llama-3.1)
- Update the database with the calculated scores
- Process up to 50 topics per night to avoid API rate limits

## Setup Instructions

### 1. Make the Script Executable
```bash
chmod +x midnight-scoring-cron.js
```

### 2. Test the Script Manually
```bash
# Test the scoring job
npm run score-topics

# Or run directly
node midnight-scoring-cron.js
```

### 3. Set Up Cron Job

#### Option A: Using crontab (Recommended)
```bash
# Edit crontab
crontab -e

# Add this line to run every night at midnight
0 0 * * * cd /path/to/your/MicroApp && npm run score-topics >> /var/log/midnight-scoring.log 2>&1

# Example with full path:
0 0 * * * cd /home/ubuntu/MicroLearning && npm run score-topics >> /var/log/midnight-scoring.log 2>&1
```

#### Option B: Using systemd timer (Linux)
Create `/etc/systemd/system/midnight-scoring.service`:
```ini
[Unit]
Description=Midnight Scoring Job
After=network.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/home/ubuntu/MicroLearning
ExecStart=/usr/bin/node midnight-scoring-cron.js
StandardOutput=journal
StandardError=journal
```

Create `/etc/systemd/system/midnight-scoring.timer`:
```ini
[Unit]
Description=Run midnight scoring job daily
Requires=midnight-scoring.service

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start:
```bash
sudo systemctl enable midnight-scoring.timer
sudo systemctl start midnight-scoring.timer
```

### 4. Monitor the Cron Job

#### Check cron logs:
```bash
# View cron logs
tail -f /var/log/midnight-scoring.log

# Check if cron is running
sudo systemctl status cron
```

#### Check systemd timer:
```bash
# Check timer status
sudo systemctl status midnight-scoring.timer

# View logs
sudo journalctl -u midnight-scoring.service -f
```

## Configuration

### Environment Variables
Make sure these are set in your `.env` file:
```env
OPENROUTER_API_KEY=your_api_key_here
DATABASE_URL=your_database_url_here
```

### Customization
You can modify the cron job behavior by editing `midnight-scoring-cron.js`:

- **Batch size**: Change `LIMIT 50` to process more/fewer topics per night
- **Delay between topics**: Change `setTimeout(resolve, 2000)` to adjust API rate limiting
- **Scoring models**: Modify the model names in the API calls
- **Quality threshold**: Change `verificationResults.overallQuality.score >= 7`

## Troubleshooting

### Common Issues

1. **Permission denied**
   ```bash
   chmod +x midnight-scoring-cron.js
   ```

2. **Database connection issues**
   - Check your `.env` file has correct database credentials
   - Ensure the database is running

3. **API rate limits**
   - Reduce batch size in the script
   - Increase delay between API calls

4. **Cron not running**
   ```bash
   # Check if cron service is running
   sudo systemctl status cron
   
   # Restart cron service
   sudo systemctl restart cron
   ```

### Manual Testing
```bash
# Test database connection
node -e "require('./db').query('SELECT 1').then(() => console.log('DB OK')).catch(console.error)"

# Test API connection
node -e "require('axios').post('https://openrouter.ai/api/v1/chat/completions', {model: 'mistralai/mistral-7b-instruct', messages: [{role: 'user', content: 'test'}]}, {headers: {Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY}}).then(() => console.log('API OK')).catch(console.error)"
```

## Monitoring

### Log Files
- Cron logs: `/var/log/midnight-scoring.log`
- System logs: `sudo journalctl -u midnight-scoring.service`

### Database Queries
```sql
-- Check topics without scores
SELECT COUNT(*) FROM generated_topics gt
LEFT JOIN content_verification_results cvr ON gt.id = cvr.topic_id
WHERE cvr.topic_id IS NULL 
   OR (cvr.factual_accuracy_score = 0 
       AND cvr.educational_value_score = 0 
       AND cvr.clarity_engagement_score = 0);

-- Check recent scoring activity
SELECT topic_id, factual_accuracy_score, educational_value_score, 
       clarity_engagement_score, overall_quality_score, verification_timestamp
FROM content_verification_results 
WHERE verification_timestamp > NOW() - INTERVAL '1 day'
ORDER BY verification_timestamp DESC;
```

## Performance Notes

- The job processes up to 50 topics per night
- Each topic takes ~6-9 seconds to score (3 API calls + processing)
- Total runtime: ~5-8 minutes for 50 topics
- API costs: ~$0.01-0.02 per topic (much cheaper than GPT-4)
- Database updates are batched for efficiency

## Security

- The cron job runs with the same user permissions as your application
- API keys are loaded from environment variables
- Database credentials are secured via environment variables
- Logs are written to system directories with appropriate permissions
