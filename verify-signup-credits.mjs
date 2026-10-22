import pg from 'pg';
const { Client } = pg;

// Test configuration
const TEST_USERNAME = `test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
const EXPECTED_SIGNUP_CREDITS = 350;

console.log('🧪 Credit System Verification Test');
console.log('=' .repeat(60));
console.log(`Test username: ${TEST_USERNAME}`);
console.log('');

// Database connection - read from environment
const dbUrl = process.env.DATABASE_URL || 'postgresql://artx_app:27hV6L3h1_NTZYuKwh9lz4OmFPdxjd6J9gdGxvknPiMPhU6d@127.0.0.1:5432/artx_admin';
const client = new Client({ connectionString: dbUrl });

async function verifySignupCredits() {
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Step 1: Simulate user registration via API
    console.log('\n📝 Step 1: Registering new user via API...');
    const registerResponse = await fetch('https://www.artxsd.com/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: TEST_USERNAME,
        password: 'Test123456!'
      })
    });
    
    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      throw new Error(`Registration failed: ${registerResponse.status} ${errorText}`);
    }
    
    const registerData = await registerResponse.json();
    console.log('✅ User registered successfully');
    console.log(`   User ID: ${registerData.user?.id || 'unknown'}`);
    
    // Wait a moment for database operations to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 2: Check auth-users document for user credits
    console.log('\n📝 Step 2: Checking auth-users document...');
    const authUsersResult = await client.query(
      "SELECT data FROM artx_json_documents WHERE key = 'auth-users'"
    );
    
    if (authUsersResult.rows.length === 0) {
      throw new Error('auth-users document not found');
    }
    
    const authData = authUsersResult.rows[0].data;
    const user = authData.users.find(u => u.username === TEST_USERNAME);
    
    if (!user) {
      throw new Error('User not found in auth-users document');
    }
    
    console.log(`✅ User found in auth-users`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   User credits: ${user.credits}`);
    
    // Step 3: Check admin-data document for credit entries
    console.log('\n📝 Step 3: Checking admin-data document...');
    const adminDataResult = await client.query(
      "SELECT data FROM artx_json_documents WHERE key = 'admin-data'"
    );
    
    if (adminDataResult.rows.length === 0) {
      throw new Error('admin-data document not found');
    }
    
    const adminData = adminDataResult.rows[0].data;
    
    // Check credits ledger
    const userCredits = adminData.credits?.filter(c => c.userId === user.id) || [];
    console.log(`✅ Found ${userCredits.length} credit entries in ledger`);
    userCredits.forEach(c => {
      console.log(`   - ${c.source}: ${c.delta} credits (expires: ${c.expiresAt || 'never'})`);
    });
    
    // Check credit batches
    const userBatches = adminData.creditBatches?.filter(b => b.userId === user.id) || [];
    console.log(`✅ Found ${userBatches.length} credit batches`);
    
    const totalBatchCredits = userBatches.reduce((sum, b) => sum + b.remainingCredits, 0);
    console.log(`   Total remaining credits in batches: ${totalBatchCredits}`);
    
    // Step 4: Verify results
    console.log('\n📊 Verification Results:');
    console.log('=' .repeat(60));
    
    const checks = [
      {
        name: 'User exists in auth-users',
        pass: !!user,
        actual: user ? 'Found' : 'Not found'
      },
      {
        name: 'User credits in auth-users',
        pass: user.credits === EXPECTED_SIGNUP_CREDITS,
        expected: EXPECTED_SIGNUP_CREDITS,
        actual: user.credits
      },
      {
        name: 'Signup credit entry in ledger',
        pass: userCredits.some(c => c.source?.startsWith('signup-bonus') && c.delta === EXPECTED_SIGNUP_CREDITS),
        actual: userCredits.find(c => c.source?.startsWith('signup-bonus')) ? `Found: ${userCredits.find(c => c.source?.startsWith('signup-bonus')).source}` : 'Not found'
      },
      {
        name: 'Credit batch exists',
        pass: userBatches.length > 0,
        actual: `${userBatches.length} batches`
      },
      {
        name: 'Batch credits match user credits',
        pass: totalBatchCredits === user.credits,
        expected: user.credits,
        actual: totalBatchCredits
      }
    ];
    
    let allPassed = true;
    checks.forEach(check => {
      const symbol = check.pass ? '✅' : '❌';
      console.log(`${symbol} ${check.name}`);
      if ('expected' in check) {
        console.log(`   Expected: ${check.expected}, Actual: ${check.actual}`);
      } else if ('actual' in check) {
        console.log(`   ${check.actual}`);
      }
      if (!check.pass) allPassed = false;
    });
    
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
      console.log('🎉 ALL TESTS PASSED! Signup credits are working correctly.');
    } else {
      console.log('❌ SOME TESTS FAILED! Please review the results above.');
    }
    
    return allPassed;
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    return false;
  } finally {
    await client.end();
  }
}

// Run the test
verifySignupCredits().then(success => {
  process.exit(success ? 0 : 1);
});
