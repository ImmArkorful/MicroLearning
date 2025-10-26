const db = require('./db');

async function testVersionCheck() {
  try {
    console.log('Testing version check system...');

    // Insert a new version that requires force update
    const insertQuery = `
      INSERT INTO app_versions (version, min_supported_version, is_force_update, release_notes, update_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (version) DO UPDATE 
      SET min_supported_version = EXCLUDED.min_supported_version,
          is_force_update = EXCLUDED.is_force_update,
          release_notes = EXCLUDED.release_notes,
          update_url = EXCLUDED.update_url
      RETURNING *;
    `;
    
    const values = [
      '1.0.0',              // version
      '0.0.1',              // min_supported_version (force update for versions below this)
      true,                 // is_force_update
      'Major update with security improvements and new features including enhanced quiz system and improved UI.', // release_notes
      'https://apps.apple.com/app/learnflow', // update_url
    ];

    const result = await db.query(insertQuery, values);
    console.log('✅ Version inserted successfully:', result.rows[0]);

    // Fetch all versions
    const allVersions = await db.query('SELECT * FROM app_versions ORDER BY created_at DESC');
    console.log('\n📋 All versions in database:');
    allVersions.rows.forEach((v, i) => {
      console.log(`${i + 1}. Version: ${v.version}`);
      console.log(`   Min Supported: ${v.min_supported_version}`);
      console.log(`   Force Update: ${v.is_force_update}`);
      console.log(`   Release Notes: ${v.release_notes}`);
      console.log(`   Update URL: ${v.update_url}`);
      console.log('');
    });

    // Test version comparison
    console.log('🧪 Testing version comparison:');
    
    const clientVersions = ['0.0.1', '0.0.2', '1.0.0'];
    const compareVersions = (v1, v2) => {
      const parts1 = v1.split('.').map(Number);
      const parts2 = v2.split('.').map(Number);
      for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const part1 = parts1[i] || 0;
        const part2 = parts2[i] || 0;
        if (part1 < part2) return -1;
        if (part1 > part2) return 1;
      }
      return 0;
    };

    const latestVersion = allVersions.rows[0];
    const minSupported = latestVersion.min_supported_version;
    const currentVersion = latestVersion.version;

    clientVersions.forEach(clientVersion => {
      const needsUpdate = compareVersions(clientVersion, currentVersion) < 0;
      const isOutdated = compareVersions(clientVersion, minSupported) < 0;
      const forceUpdate = isOutdated && latestVersion.is_force_update;
      
      console.log(`Client: ${clientVersion}`);
      console.log(`  - Needs Update: ${needsUpdate}`);
      console.log(`  - Is Outdated: ${isOutdated}`);
      console.log(`  - Force Update: ${forceUpdate}`);
      console.log('');
    });

    console.log('✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit();
  }
}

testVersionCheck();
