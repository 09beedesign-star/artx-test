import pg from 'pg';
const { Client } = pg;

// Test configuration - use an existing test user
const TEST_USER_ID = '7f143112-0b9e-45a3-a808-f83a44295101'; // from previous test
const MANUAL_GRANT_AMOUNT = 500;
const ADMIN_USERNAME = 'admin'; // Need admin credentials

console.log('🧪 Manual Credit Grant Verification Test');
console.log('='.repeat(60));
console.log(`Test user ID: ${TEST_USER_ID}`);
console.log(`Manual grant amount: ${MANUAL_GRANT_AMOUNT}`);
console.log('');

// Database connection
const dbUrl = process.env.DATABASE_URL || 'postgresql://artx_app:27hV6L3h1_NTZYuKwh9lz4OmFPdxjd6J9gdGxvknPiMPhU6d@127.0.0.1:5432/artx_admin';
const client = new Client({ connectionString: dbUrl });

async function verifyManualGrant() {
  try {
    await client.connect();
    console.log('✅ Connected to database');
    
    // Step 1: Get initial balance
    console.log('\n📝 Step 1: Checking initial balance...');
    let authUsersResult = await client.query(
      "SELECT data FROM artx_json_documents WHERE key = 'auth-users'"
    );
    
    if (authUsersResult.rows.length === 0) {
      throw new Error('auth-users document not found');
    }
    
    let authData = authUsersResult.rows[0].data;
    let user = authData.users.find(u => u.id === TEST_USER_ID);
    
    if (!user) {
      throw new Error(`User ${TEST_USER_ID} not found in auth-users document`);
    }
    
    const initialBalance = user.credits;
    console.log(`✅ Initial balance: ${initialBalance}`);
    
    // Step 2: Login as admin to get session token
    console.log('\n📝 Step 2: Logging in as admin...');
    const loginResponse = await fetch('https://www.artxsd.com/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: process.env.ADMIN_USERNAME || ADMIN_USERNAME,
        password: process.env.ADMIN_PASSWORD || 'admin-password-here'
      })
    });
    
    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      throw new Error(`Admin login failed: ${loginResponse.status} ${errorText}`);
    }
    
    // Extract session cookie
    const setCookie = loginResponse.headers.get('set-cookie');
    if (!setCookie) {
      throw new Error('No session cookie received from login');
    }
    
    const sessionCookie = setCookie.split(';')[0]; // Get just the first part
    console.log('✅ Admin logged in successfully');
    
    // Step 3: Grant credits via admin API
    console.log('\n📝 Step 3: Granting credits via admin API...');
    const grantResponse = await fetch('https://www.artxsd.com/admin/credits/gift', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        credits: MANUAL_GRANT_AMOUNT,
        reason: 'Automated test verification'
      })
    });
    
    if (!grantResponse.ok) {
      const errorText = await grantResponse.text();
      throw new Error(`Credit grant failed: ${grantResponse.status} ${errorText}`);
    }
    
    const grantData = await grantResponse.json();
    console.log('✅ Credits granted via API');
    console.log(`   Response: ${JSON.stringify(grantData)}`);
    
    // Wait for database operations to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 4: Check updated balance
    console.log('\n📝 Step 4: Checking updated balance...');
    authUsersResult = await client.query(
      "SELECT data FROM artx_json_documents WHERE key = 'auth-users'"
    );
    
    authData = authUsersResult.rows[0].data;
    user = authData.users.find(u => u.id === TEST_USER_ID);
    
    if (!user) {
      throw new Error(`User ${TEST_USER_ID} not found after grant`);
    }
    
    const finalBalance = user.credits;
    const expectedBalance = initialBalance + MANUAL_GRANT_AMOUNT;
    
    console.log(`✅ Final balance: ${finalBalance}`);
    console.log(`   Expected: ${expectedBalance}`);
    console.log(`   Difference: ${finalBalance - initialBalance}`);
    
    // Step 5: Verify in admin-data
    console.log('\n📝 Step 5: Checking admin-data document...');
    const adminDataResult = await client.query(
      "SELECT data FROM artx_json_documents WHERE key = 'admin-data'"
    );
    
    if (adminDataResult.rows.length === 0) {
      throw new Error('admin-data document not found');
    }
    
    const adminData = adminDataResult.rows[0].data;
    
    // Check credits ledger
    const userCredits = adminData.credits?.filter(c => c.userId === TEST_USER_ID) || [];
    const manualGrants = userCredits.filter(c => c.source?.includes('manual-grant'));
    
    console.log(`✅ Found ${userCredits.length} total credit entries for user`);
    console.log(`✅ Found ${manualGrants.length} manual grant entries`);
    if (manualGrants.length > 0) {
      const latestGrant = manualGrants[manualGrants.length - 1];
      console.log(`   Latest: ${latestGrant.delta} credits (source: ${latestGrant.source})`);
    }
    
    // Check credit batches
    const userBatches = adminData.creditBatches?.filter(b => b.userId === TEST_USER_ID) || [];
    const totalBatchCredits = userBatches.reduce((sum, b) => sum + b.remainingCredits, 0);
    
    console.log(`✅ Found ${userBatches.length} credit batches`);
    console.log(`   Total remaining credits in batches: ${totalBatchCredits}`);
    
    // Step 6: Verify results
    console.log('\n📊 Verification Results:');
    console.log('='.repeat(60));
    
    const checks = [
      {
        name: 'Credits granted successfully',
        pass: grantData.success === true,
        actual: grantData.success ? 'Success' : 'Failed'
      },
      {
        name: 'User balance increased correctly',
        pass: finalBalance === expectedBalance,
        expected: expectedBalance,
        actual: finalBalance
      },
      {
        name: 'Balance change matches grant amount',
        pass: (finalBalance - initialBalance) === MANUAL_GRANT_AMOUNT,
        expected: MANUAL_GRANT_AMOUNT,
        actual: finalBalance - initialBalance
      },
      {
        name: 'Manual grant entry in ledger',
        pass: manualGrants.length > 0 && manualGrants.some(g => g.delta === MANUAL_GRANT_AMOUNT),
        actual: manualGrants.length > 0 ? `Found ${manualGrants.length} entries` : 'Not found'
      },
      {
        name: 'Batch credits match auth-users balance',
        pass: totalBatchCredits === finalBalance,
        expected: finalBalance,
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
      console.log('🎉 ALL TESTS PASSED! Manual credit grants are working correctly.');
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
verifyManualGrant().then(success => {
  process.exit(success ? 0 : 1);
});
