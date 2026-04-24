# Reputation Notification System

This document describes the comprehensive reputation notification system that has been implemented to notify users of significant reputation changes, milestone achievements, and level ups.

## Features Implemented

### 1. Reputation Change Notifications (>50 points)
- **Trigger**: When a user's reputation score changes by more than their configured threshold (default: 50 points)
- **Notification Types**: Real-time via WebSocket, email, and push notifications
- **Content**: Shows previous score, new score, change amount, and context

### 2. Level Up Achievement Notifications
- **Trigger**: When a user reaches a new reputation level (BRONZE → SILVER → GOLD → PLATINUM → DIAMOND)
- **Notification Types**: Real-time via WebSocket, email, and push notifications
- **Content**: Celebration message with level achievement and current score

### 3. Weekly Reputation Summary Emails
- **Trigger**: Every Sunday at 9 AM (configurable)
- **Content**: 
  - Score change for the week
  - Activities performed
  - Top activity type
  - Personalized improvement tips
  - Current level and progress

### 4. Reputation Improvement Tips
- **Dynamic**: Personalized based on user's current reputation profile
- **Categories**: Transactions, Community, Projects, Social, Expertise, Reliability
- **Filtering**: Tips are filtered by impact (HIGH/MEDIUM/LOW) and difficulty (EASY/MEDIUM/HARD)

### 5. Notification Preference Settings
- **Granular Control**: Users can enable/disable specific notification types
- **Threshold Configuration**: Users can set their own reputation change threshold
- **Channel Selection**: Users can choose between email and push notifications

## Database Schema Changes

### New Tables

#### `reputation_tips`
```sql
CREATE TABLE reputation_tips (
  id VARCHAR PRIMARY KEY,
  category VARCHAR,
  title VARCHAR,
  description TEXT,
  impact VARCHAR, -- HIGH, MEDIUM, LOW
  difficulty VARCHAR, -- EASY, MEDIUM, HARD
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### `weekly_reputation_summaries`
```sql
CREATE TABLE weekly_reputation_summaries (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR REFERENCES users(id),
  week_start_date TIMESTAMP,
  previous_score INTEGER,
  current_score INTEGER,
  score_change INTEGER,
  level VARCHAR,
  activities_count INTEGER,
  top_activity_type VARCHAR,
  improvement_tips JSON,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(user_id, week_start_date)
);
```

### Modified Tables

#### `notification_settings`
Added new columns:
- `notify_reputation_changes` (BOOLEAN, default true)
- `notify_level_ups` (BOOLEAN, default true)
- `notify_weekly_summary` (BOOLEAN, default true)
- `reputation_change_threshold` (INTEGER, default 50)

#### `notifications`
Added new notification types:
- `REPUTATION_CHANGE`
- `LEVEL_UP`
- `WEEKLY_REPUTATION_SUMMARY`
- `REPUTATION_MILESTONE`

## API Endpoints

### Notification Settings

#### GET `/reputation/notifications/settings`
Get user's current notification settings.

#### PUT `/reputation/notifications/settings`
Update user's notification settings.

```json
{
  "emailEnabled": true,
  "pushEnabled": false,
  "notifyReputationChanges": true,
  "notifyLevelUps": true,
  "notifyWeeklySummary": true,
  "reputationChangeThreshold": 50
}
```

### Improvement Tips

#### GET `/reputation/notifications/tips`
Get personalized improvement tips for the user.

### Weekly Summaries

#### GET `/reputation/notifications/weekly-summaries`
Get user's weekly reputation summaries (last 12 weeks).

### Testing Endpoints (Development)

#### POST `/reputation/notifications/test-reputation-change`
Test reputation change notification.

#### POST `/reputation/notifications/test-level-up`
Test level up notification.

#### POST `/reputation/notifications/initialize-tips`
Initialize default reputation tips (admin only).

## Service Integration

### ReputationService Integration
The `ReputationService` now automatically triggers notifications when:
1. A user's reputation score changes significantly
2. A user levels up to a new tier

### NotificationService Integration
The `NotificationService` has been updated to handle the new notification types and respect user preferences.

## Scheduled Tasks

### Weekly Summary Generation
- **Schedule**: Every Sunday at 9 AM
- **Process**: 
  1. Identifies users with weekly summary enabled
  2. Calculates weekly reputation changes
  3. Generates personalized improvement tips
  4. Sends notifications via enabled channels

## Setup Instructions

### 1. Database Migration
```bash
# Generate Prisma client with new schema
npm run db:generate

# Apply database changes
npm run db:migrate
```

### 2. Initialize Default Tips
```bash
# Run the setup script
psql $DATABASE_URL -f scripts/setup-reputation-notifications.sql
```

Or via API:
```bash
curl -X POST http://localhost:3000/reputation/notifications/initialize-tips
```

### 3. Verify Configuration
Ensure the following environment variables are set:
- `DATABASE_URL`: PostgreSQL connection string
- Email service configuration (SendGrid)
- Push notification service configuration

## Notification Content Examples

### Reputation Change Notification
```
📈 Reputation Score increased!
Your reputation score has increased by 75 points (450 → 525). Keep up the great work!
```

### Level Up Notification
```
🏆 Congratulations! You've reached GOLD level!
Amazing achievement! Your reputation score of 625 has earned you the GOLD level. You've officially leveled up from SILVER!
```

### Weekly Summary
```
📈 Your Weekly Reputation Summary
Your reputation improved by 25 points this week. Current score: 525 (GOLD level). You had 8 activities this week.
```

## Configuration Options

### Environment Variables
- `NOTIFICATION_DEDUP_WINDOW_MS`: Deduplication window (default: 300000)
- `NOTIFICATION_MAX_RETRY_ATTEMPTS`: Max retry attempts (default: 3)
- `NOTIFICATION_RETRY_BACKOFF_MS`: Retry backoff base (default: 60000)

### Cron Schedules
- Weekly summaries: `0 9 * * 0` (Sunday 9 AM)
- Daily reputation recalculation: `0 0 * * *` (Midnight)

## Monitoring and Metrics

The system tracks:
- Notification delivery rates
- Failed delivery attempts
- User engagement with notifications
- Reputation change patterns

## Troubleshooting

### Common Issues

1. **Notifications not sending**: Check user notification settings and email/push configuration
2. **Weekly summaries not generating**: Verify cron job is running and users have weekly summary enabled
3. **Database errors**: Ensure Prisma schema is synchronized and migrations are applied

### Debug Commands
```bash
# Check notification settings
SELECT * FROM notification_settings WHERE user_id = 'user-id';

# Check weekly summaries
SELECT * FROM weekly_reputation_summaries WHERE user_id = 'user-id' ORDER BY week_start_date DESC;

# Check reputation tips
SELECT * FROM reputation_tips WHERE is_active = true;
```

## Future Enhancements

1. **Real-time reputation tracking**: WebSocket events for live score updates
2. **Advanced tip algorithms**: Machine learning-based tip recommendations
3. **Gamification elements**: Badges, achievements, and streaks
4. **Social reputation sharing**: Allow users to share achievements
5. **Reputation analytics dashboard**: Detailed insights and trends

## Security Considerations

1. **User privacy**: Only users can view their own reputation data
2. **Rate limiting**: Notification endpoints are rate-limited to prevent abuse
3. **Data validation**: All user inputs are validated and sanitized
4. **Access control**: Admin-only endpoints require proper authentication
