# Forced Update Implementation Guide

## Overview
This feature implements a system to force users to update the app when their version is outdated. The system checks the app version on startup and blocks access until the user updates.

## Architecture

### Backend Components

1. **Database Table (`app_versions`)**
   - Stores the latest app version information
   - Fields:
     - `version`: Latest version (e.g., "1.0.0")
     - `min_supported_version`: Minimum version allowed (e.g., "0.0.1")
     - `is_force_update`: Boolean flag for forced updates
     - `update_url`: URL to App Store/Play Store
     - `release_notes`: Text describing the update

2. **API Endpoint** (`GET /api/auth/app-version`)
   - Accepts `version` query parameter
   - Returns version comparison data
   - Determines if update is required

### Frontend Components

1. **Version Service** (`src/services/versionService.ts`)
   - Handles version checking logic
   - Gets current app version from package.json
   - Calls API to check version status

2. **Update Required Screen** (`src/screens/UpdateRequiredScreen.tsx`)
   - Full-screen blocking UI shown when update is required
   - Displays version info and release notes
   - "Update Now" button opens App Store/Play Store

3. **App Integration** (`App.tsx`)
   - Checks version on app startup
   - Blocks app access if force update is required
   - Shows UpdateRequiredScreen when needed

## How It Works

### Version Comparison Logic

The system uses semantic versioning (e.g., "1.2.3") and compares:
- **Current version**: App's current version from database
- **Client version**: User's installed app version
- **Min supported version**: Oldest version still allowed

```
Example:
- Database has version "1.0.0"
- Min supported is "0.0.1"
- User has "0.0.1"

Comparison:
- Client (0.0.1) < Min (0.0.1) = False (same version)
- Client (0.0.1) < Current (1.0.0) = True (needs update)
- Force update = True (flagged in database)

Result: User is blocked until they update
```

## Setup Instructions

### 1. Database Setup

Run the database setup to create the version table:
```bash
cd MicroApp
node dbsetup.js
```

### 2. Set Current Version

Insert the latest version into the database:

```sql
INSERT INTO app_versions (
  version, 
  min_supported_version, 
  is_force_update, 
  release_notes,
  update_url
) VALUES (
  '1.0.0',                    -- Latest version
  '0.0.1',                    -- Min supported (force update below this)
  true,                       -- Force update enabled
  'Major update with security fixes',  -- Release notes
  'https://apps.apple.com/app/learnflow'  -- Update URL
);
```

### 3. Test the Feature

Run the test script:
```bash
cd MicroApp
node test-version-check.js
```

This will:
- Insert a test version
- Display all versions
- Test version comparison logic

## Using the Feature

### To Force Users to Update

1. **Set a new version in database:**
```bash
cd MicroApp
node test-version-check.js
```

2. **Update the version in frontend:**
   - Modify `LearnFlowApp/package.json` to match database version

3. **Users with old versions will see:**
   - Update Required screen blocking the app
   - Current and latest version displayed
   - Release notes
   - "Update Now" button

### To Allow Users Without Force Update

1. **Keep `is_force_update` as false** in database
2. Users will see normal update notification but can continue using the app

## API Endpoint

### Check App Version

**Endpoint:** `GET /api/auth/app-version`

**Query Parameters:**
- `version` (required): Client app version (e.g., "0.0.1")

**Response:**
```json
{
  "current_version": "1.0.0",
  "min_supported_version": "0.0.1",
  "client_version": "0.0.1",
  "needs_update": true,
  "force_update": true,
  "update_url": "https://apps.apple.com/app/learnflow",
  "release_notes": "Major update with security fixes"
}
```

## Example Scenarios

### Scenario 1: Security Update (Force Update)
1. Critical security vulnerability found
2. Set new version: `2.0.0`
3. Set min supported: `1.9.9` (forces all older versions to update)
4. Set `is_force_update: true`
5. Users with version < 2.0.0 are blocked

### Scenario 2: Optional Update
1. New features released
2. Set new version: `1.1.0`
3. Keep existing min supported version
4. Set `is_force_update: false`
5. Users can continue using older versions

### Scenario 3: Gradual Rollout
1. Release new version: `1.0.0`
2. Start with `is_force_update: false`
3. Monitor for issues
4. After 1 week, set `is_force_update: true`
5. Forces remaining users to update

## Configuration

### Frontend Configuration

Edit `LearnFlowApp/src/services/versionService.ts`:
```typescript
getCurrentVersion(): string {
  const { version } = require('../../package.json');
  return version || '0.0.1';
}
```

### Backend Configuration

Version information is stored in the `app_versions` table. Update it through:
1. Direct database queries
2. Test script: `node test-version-check.js`
3. Admin panel (future implementation)

## Testing

### Test Case 1: Force Update Required
1. Set database version to "1.0.0" with `is_force_update: true`
2. Set min supported to "0.9.9"
3. Set app version in package.json to "0.0.1"
4. Launch app → Should show UpdateRequiredScreen
5. Should not allow app access

### Test Case 2: Update Available (Not Forced)
1. Set database version to "1.0.0" with `is_force_update: false`
2. Set app version to "0.9.9"
3. Launch app → Should show normal app
4. Consider showing update notification (future feature)

### Test Case 3: Up to Date
1. Set database version to "1.0.0"
2. Set app version to "1.0.0"
3. Launch app → Should show normal app

## Troubleshooting

### Issue: Users not being blocked
- Check database version is newer than app version
- Verify `is_force_update` is `true`
- Check version comparison logic in API

### Issue: App stuck on loading
- Check version check API endpoint is accessible
- Verify database connection
- Check for errors in console

### Issue: Update button not working
- Verify `update_url` in database
- Check URL format (must be valid App Store/Play Store link)
- Test with real device (links may not work in simulator)

## Future Enhancements

1. **Soft Updates**: Show notification banner instead of blocking
2. **Scheduled Rollouts**: Automatically enable force update after X days
3. **Version History**: Track which users have which versions
4. **Admin Dashboard**: UI to manage app versions
5. **Update Prompts**: Show update modal with release notes without forcing

## Security Considerations

1. **API Authentication**: Consider requiring authentication for version check (currently public)
2. **Version Spoofing**: Users could modify version number - consider server-side verification
3. **Update URL Validation**: Ensure update URLs point to legitimate app stores
4. **Backwards Compatibility**: Keep API responses backwards compatible

## Rollback Strategy

If a version deployment causes issues:

1. **Disable Force Update:**
```sql
UPDATE app_versions 
SET is_force_update = false 
WHERE version = 'X.X.X';
```

2. **Revert Min Supported:**
```sql
UPDATE app_versions 
SET min_supported_version = 'X.X.X' 
WHERE version = 'Y.Y.Y';
```

3. **Quick Fix**: Remove the blocking check temporarily in App.tsx

## Support

For issues or questions:
- Check console logs for version check errors
- Verify database connection and version data
- Test API endpoint directly: `GET /api/auth/app-version?version=0.0.1`
