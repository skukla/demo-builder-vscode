#!/usr/bin/env node
/**
 * Test script to check if DA.live token can fetch organizations from IMS
 *
 * Usage: node scripts/test-ims-orgs.mjs <your-dalive-token>
 */

const token = process.argv[2];

if (!token) {
    console.error('Usage: node scripts/test-ims-orgs.mjs <your-dalive-token>');
    console.error('\nGet your token from DA.live using the bookmarklet.');
    process.exit(1);
}

// Decode JWT to show token info
try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    console.log('\n=== Token Info ===');
    console.log('Client ID:', decoded.client_id);
    console.log('Email:', decoded.email || decoded.preferred_username || 'N/A');
    console.log('Expires:', new Date(decoded.created_at + decoded.expires_in).toISOString());
    console.log('All claims:', Object.keys(decoded).join(', '));
} catch (e) {
    console.log('Could not decode token:', e.message);
}

// Test IMS organizations endpoint
console.log('\n=== Testing IMS Organizations Endpoint ===');
console.log('URL: https://ims-na1.adobelogin.com/ims/organizations/v6');

try {
    const response = await fetch('https://ims-na1.adobelogin.com/ims/organizations/v6', {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    console.log('Status:', response.status, response.statusText);

    if (response.ok) {
        const data = await response.json();
        console.log('\n=== SUCCESS! Organizations Found ===');
        console.log(JSON.stringify(data, null, 2));
    } else {
        const text = await response.text();
        console.log('\n=== FAILED ===');
        console.log('Response:', text);
    }
} catch (error) {
    console.error('\n=== ERROR ===');
    console.error(error.message);
}

// Also test a few other potential endpoints
console.log('\n=== Testing Alternative Endpoints ===');

const endpoints = [
    'https://ims-na1.adobelogin.com/ims/profile/v1',
    'https://ims-na1.adobelogin.com/ims/userinfo/v2',
];

for (const url of endpoints) {
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        console.log(`\n${url}`);
        console.log('Status:', response.status);
        if (response.ok) {
            const data = await response.json();
            console.log('Response:', JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.log(`${url}: ${e.message}`);
    }
}

// Test DA.live endpoints to discover accessible orgs
console.log('\n=== Testing DA.live Org Discovery ===');

const daliveEndpoints = [
    // Root level - might list all accessible orgs
    'https://admin.da.live/list/',
    // Alternative root
    'https://admin.da.live/',
    // Source endpoint (different API structure)
    'https://admin.da.live/source/',
    // Try without trailing slash
    'https://admin.da.live/list',
];

for (const url of daliveEndpoints) {
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
            }
        });
        console.log(`\n${url}`);
        console.log('Status:', response.status, response.statusText);
        if (response.ok) {
            const text = await response.text();
            try {
                const data = JSON.parse(text);
                console.log('Response:', JSON.stringify(data, null, 2));
            } catch {
                console.log('Response (first 500 chars):', text.substring(0, 500));
            }
        } else if (response.status === 401 || response.status === 403) {
            console.log('Auth denied - endpoint exists but no access');
        }
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

// Test the known org "skukla" to confirm our token works
console.log('\n=== Testing Known Org Access (skukla) ===');
try {
    const response = await fetch('https://admin.da.live/list/skukla/', {
        headers: {
            'Authorization': `Bearer ${token}`,
        }
    });
    console.log('Status:', response.status, response.statusText);
    if (response.ok) {
        const data = await response.json();
        console.log('Success! Found', data.length, 'sites in skukla org');
        console.log('First few sites:', data.slice(0, 5).map(s => s.name).join(', '));
    }
} catch (e) {
    console.log(`Error: ${e.message}`);
}

// Try to find org from IMS org mapping
console.log('\n=== Attempting IMS Org to DA.live Mapping ===');
console.log('IMS returns org names like "Adobe Commerce Solution Led"');
console.log('DA.live uses slugs like "skukla" or "adobe"');
console.log('\nPotential mapping strategies:');
console.log('1. Check if DA.live has a user profile endpoint with org list');
console.log('2. Try common slug patterns from IMS org name');
console.log('3. Store org slug from first successful access');
