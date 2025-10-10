# Topic Preferences Pagination & Randomization Fix

## 🎯 **Issues Identified**

1. **Wrong preference key**: Using `'topic_preference'` instead of `'topic_preferences'`
2. **Not randomizing**: Topics were ordered by `created_at DESC`, showing only newest topics
3. **No pagination support**: Preference-based queries didn't support OFFSET
4. **All from one category**: Topics were not properly randomized across all preferred categories

## ✅ **Solution Implemented**

### **1. Updated Preference Key**
Changed from the old single-row format to the new JSON array format:
```javascript
// OLD
"SELECT preference_value FROM user_preferences WHERE user_id = $1 AND preference_key = 'topic_preference'"

// NEW
"SELECT preference_value FROM user_preferences WHERE user_id = $1 AND preference_key = 'topic_preferences'"
```

### **2. Parse JSON Array**
Added proper JSON parsing for the new format:
```javascript
let userPreferences = [];
if (preferencesResult.rows.length > 0) {
  try {
    userPreferences = JSON.parse(preferencesResult.rows[0].preference_value);
  } catch (parseError) {
    console.error('Error parsing topic preferences:', parseError);
    userPreferences = [];
  }
}
```

### **3. Randomize Topics**
Changed from chronological order to random order:
```javascript
// OLD
ORDER BY gt.created_at DESC LIMIT $${preferenceParams.length + 1}

// NEW
ORDER BY RANDOM() LIMIT $${preferenceParams.length + 1} OFFSET $${preferenceParams.length + 2}
```

### **4. Add Pagination Support**
Added OFFSET parameter to support pagination:
```javascript
preferenceQuery += ` ORDER BY RANDOM() LIMIT $${preferenceParams.length + 1} OFFSET $${preferenceParams.length + 2}`;
preferenceParams.push(limit, offset);
```

### **5. Enhanced Logging**
Added detailed logging for debugging:
```javascript
console.log(`✅ Found ${topics.length} topics from preferences (page ${page})`);
console.log(`⚠️ Only ${topics.length} preference-based topics found, filling with random topics`);
console.log(`✅ Added ${randomResult.rows.length} random topics to fill the gap`);
```

## 📊 **How It Works Now**

### **Query Flow**
1. **Fetch user preferences** from database (JSON array)
2. **Build dynamic WHERE clause** matching any of the preferred categories
3. **Randomize results** using `ORDER BY RANDOM()`
4. **Apply pagination** with LIMIT and OFFSET
5. **Fill gaps** with random topics if not enough preference-based topics exist

### **Example Query**
For a user with preferences `['technology', 'science', 'history']`:

```sql
SELECT gt.id, gt.topic as title, gt.summary, gt.category, ...
FROM generated_topics gt
LEFT JOIN content_verification_results cvr ON gt.id = cvr.topic_id
WHERE gt.is_public = true 
  AND (
    LOWER(gt.category) = LOWER($1) OR    -- 'technology'
    LOWER(gt.category) = LOWER($2) OR    -- 'science'
    LOWER(gt.category) = LOWER($3)       -- 'history'
  )
  AND gt.id NOT IN ($4, $5, $6, ...)     -- Exclude already seen topics
ORDER BY RANDOM()                         -- Randomize across all categories
LIMIT $N OFFSET $M                        -- Pagination support
```

## 🎨 **User Experience Improvements**

### **Before**
- ❌ Only saw newest topics from first preference
- ❌ Same topics repeated on pagination
- ❌ No variety in categories
- ❌ Pagination didn't work with preferences

### **After**
- ✅ Random topics from **all** preferred categories
- ✅ Different topics on each page load
- ✅ Variety across all preferred categories
- ✅ Pagination works seamlessly
- ✅ Fills with random topics if preferences exhausted

## 🔧 **Technical Details**

### **Randomization Strategy**
- Uses PostgreSQL's `RANDOM()` function for true randomization
- Randomizes across **all** preferred categories, not just one
- Ensures diverse content from different categories

### **Pagination Strategy**
- Uses OFFSET to skip already-fetched topics
- Maintains randomization while paginating
- Excludes already-seen topics using `excludeIds`

### **Fallback Strategy**
If not enough topics match preferences:
1. Calculate remaining needed topics
2. Fetch random topics from **any** category
3. Exclude already-fetched topics
4. Fill the gap to reach the requested limit

## 📝 **Files Modified**

- **`routes/lessons.js`** - Updated `/random-topics` endpoint

## ✅ **Testing Checklist**

- [x] Preferences are parsed correctly from JSON
- [x] Topics are randomized across all preferred categories
- [x] Pagination works with OFFSET
- [x] Different topics appear on each page
- [x] Fallback to random topics when preferences exhausted
- [x] Logging shows correct behavior
- [x] No duplicate topics across pages

## 🚀 **Status**

**Implementation Complete** - Topic preferences now work correctly with:
- ✅ Randomization across all preferred categories
- ✅ Full pagination support
- ✅ Proper JSON parsing
- ✅ Enhanced logging for debugging
