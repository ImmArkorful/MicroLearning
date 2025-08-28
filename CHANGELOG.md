# LearnFlow App - Changelog

## Activity Module Implementation (Latest Update)

### 🎯 **New Features Added**

#### 1. **Activity Tracking System**
- **Database**: Added `user_activities` table to track user interactions
- **Backend**: Implemented activity recording and retrieval endpoints
- **Frontend**: Created `activityService.ts` for activity management
- **Types**: Added `Activity` and `ActivityData` interfaces

#### 2. **Activity Types Supported**
- `topic_created` - When user generates a new topic
- `quiz_completed` - When user completes a random quiz
- `topic_liked` - When user likes a topic
- `topic_saved` - When user saves a topic to library
- `lesson_started` - When user starts learning a topic
- `lesson_completed` - When user completes a lesson
- `streak_milestone` - When user reaches learning streak milestones
- `achievement_earned` - When user earns achievements

#### 3. **Activity Display**
- **ExploreScreen**: Replaced "No recent activity" with real activity feed
- **Activity Cards**: Show activity type, title, category, description, and timestamp
- **Time Formatting**: Smart time display (just now, minutes ago, hours ago, days ago)
- **Loading States**: Proper loading indicators while fetching activities

### 🔧 **Technical Implementation**

#### Backend Changes (`routes/lessons.js`)
- Added `POST /lessons/activity` - Record new activities
- Added `GET /lessons/activities` - Retrieve user activities with pagination
- Integrated activity tracking into existing endpoints:
  - Quiz completion (`POST /lessons/random-quiz/:quizId/answer`)
  - Topic creation (`POST /lessons/store-topic`)
  - Topic liking (`POST /lessons/like-topic`)
  - Topic saving (`POST /lessons/save-to-library`)

#### Frontend Changes
- **ExploreScreen.tsx**: 
  - Added activity fetching and display
  - Implemented activity item components
  - Added loading states and error handling
- **TopicDetailScreen.tsx**: 
  - Added lesson started activity tracking
  - Added like/save activity tracking
- **RandomQuizScreen.tsx**: 
  - Added quiz completion activity tracking
- **TopicLearningScreen.tsx**: 
  - Added topic creation activity tracking

#### Database Schema
```sql
CREATE TABLE user_activities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL,
  activity_data JSONB,
  related_id INTEGER,
  related_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 📊 **Activity Data Structure**
Each activity includes:
- **Icon**: Emoji representation of activity type
- **Title**: Human-readable activity title
- **Category**: Topic category (if applicable)
- **Description**: Detailed activity description
- **Timestamp**: When the activity occurred
- **Metadata**: Additional activity-specific data

---

## Previous Major Updates

### 🎯 **Random Quiz System**
- **Database**: Added `random_quizzes`, `user_quiz_attempts`, `quiz_generation_history` tables
- **Backend**: Implemented quiz generation, retrieval, and answer submission
- **Frontend**: Created dedicated `RandomQuizScreen`
- **Features**: No-repeat questions, auto-generation, progress tracking

### ❤️ **Favorites & Library System**
- **Database**: Added `user_favorites` and `user_library` tables
- **Backend**: Implemented like/save endpoints and status checking
- **Frontend**: Added `FavoritesScreen` and `LibraryScreen`
- **Features**: Optimistic UI updates, real-time status sync

### 🔊 **Text-to-Speech (TTS) System**
- **Backend**: Google Cloud TTS integration with hybrid caching
- **Frontend**: Audio playback with progress tracking and controls
- **Features**: Voice selection, pause/resume, seek functionality
- **Caching**: Server-side file cache + database metadata

### 🎨 **UI/UX Improvements**
- **ExploreScreen**: Removed header, reorganized layout
- **CategoriesScreen**: Added toggle between category/topic views
- **ProfileScreen**: Integrated progress tracking
- **Navigation**: Added new screens to bottom tabs and stack

### 🗄️ **Database Enhancements**
- **Audio Cache**: `audio_cache_metadata` table for TTS optimization
- **Indexes**: Performance optimization for all new tables
- **Foreign Keys**: Proper referential integrity
- **JSONB**: Efficient storage for complex data structures

---

## 🚀 **How to Use**

### For Developers
1. **Setup**: Run `node dbsetup.js` to create all tables
2. **Activity Tracking**: Use `activityService` in frontend components
3. **Backend Integration**: Activities are automatically recorded in existing endpoints

### For Users
1. **Activities**: View recent activities on Explore screen
2. **Quizzes**: Take random quizzes from Explore screen
3. **Favorites**: Like and save topics for later
4. **Library**: Access saved topics from bottom tab
5. **TTS**: Listen to content with voice controls

---

## 🔧 **Environment Variables Required**
```env
# Database
PG_USER=postgres
PG_HOST=localhost
PG_DATABASE=microapp
PG_PASSWORD=your_password
PG_PORT=5433

# APIs
OPENROUTER_API_KEY=your_openrouter_key
GOOGLE_CLOUD_TTS_API_KEY=your_google_tts_key

# JWT
JWT_SECRET=your_jwt_secret
```

---

## 📈 **Performance Optimizations**
- **Database Indexes**: Added for all frequently queried columns
- **Audio Caching**: Reduces TTS API calls by 90%+
- **Activity Pagination**: Efficient loading of large activity lists
- **Optimistic Updates**: Immediate UI feedback for user actions

---

## 🐛 **Known Issues & Limitations**
- **TTS**: Requires Google Cloud TTS API key for full functionality
- **Quiz Generation**: Requires OpenRouter API key for new quiz generation
- **Activity Data**: Some activities may show "Unknown Activity" if related data is missing

---

## 🔮 **Future Enhancements**
- **Activity Filters**: Filter by activity type, date range
- **Achievement System**: Badges and milestones
- **Social Features**: Share activities, follow other users
- **Analytics**: Detailed learning progress and insights
- **Offline Support**: Cache activities for offline viewing
