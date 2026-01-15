#!/usr/bin/env npx ts-node
/**
 * Test script to diagnose Helix Admin API bulk endpoint access
 *
 * Usage:
 *   npx ts-node scripts/test-bulk-helix-api.ts <github-token> <org> <repo> [ims-token]
 *
 * Example:
 *   npx ts-node scripts/test-bulk-helix-api.ts ghp_xxx my-org my-repo
 *   npx ts-node scripts/test-bulk-helix-api.ts ghp_xxx my-org my-repo eyJ...
 *
 * Note: IMS token is required for bulk preview/publish (DA.live content source auth)
 */

const HELIX_ADMIN_URL = 'https://admin.hlx.page';

interface TestResult {
    endpoint: string;
    method: string;
    status: number;
    statusText: string;
    body?: unknown;
    error?: string;
}

async function testEndpoint(
    name: string,
    url: string,
    method: string,
    headers: Record<string, string>,
    body?: unknown,
): Promise<TestResult> {
    console.log(`\n🔍 Testing: ${name}`);
    console.log(`   URL: ${url}`);
    console.log(`   Method: ${method}`);

    try {
        const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(30000),
        });

        let responseBody: unknown;
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            responseBody = await response.json();
        } else {
            responseBody = await response.text();
        }

        console.log(`   Status: ${response.status} ${response.statusText}`);
        console.log(`   Response: ${JSON.stringify(responseBody, null, 2).substring(0, 500)}`);

        return {
            endpoint: name,
            method,
            status: response.status,
            statusText: response.statusText,
            body: responseBody,
        };
    } catch (error) {
        const errorMsg = (error as Error).message;
        console.log(`   ❌ Error: ${errorMsg}`);
        return {
            endpoint: name,
            method,
            status: 0,
            statusText: 'Error',
            error: errorMsg,
        };
    }
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log('Usage: npx ts-node scripts/test-bulk-helix-api.ts <github-token> <org> <repo> [ims-token]');
        console.log('');
        console.log('Example:');
        console.log('  npx ts-node scripts/test-bulk-helix-api.ts ghp_xxx adobe-rnd my-eds-site');
        console.log('  npx ts-node scripts/test-bulk-helix-api.ts ghp_xxx adobe-rnd my-eds-site eyJ...');
        console.log('');
        console.log('Note: IMS token is required for bulk preview/publish (DA.live content source)');
        process.exit(1);
    }

    const [githubToken, org, repo, imsToken] = args;
    const branch = 'main';

    console.log('========================================');
    console.log('Helix Admin API Bulk Endpoint Test');
    console.log('========================================');
    console.log(`Org: ${org}`);
    console.log(`Repo: ${repo}`);
    console.log(`Branch: ${branch}`);
    console.log(`GitHub Token: ${githubToken.substring(0, 10)}...`);
    console.log(`IMS Token: ${imsToken ? imsToken.substring(0, 20) + '...' : '(not provided)'}`);

    const results: TestResult[] = [];

    // Header variants to test
    // Our code uses x-auth-token, but docs say Authorization: token $API_KEY
    const xAuthHeaders = {
        'x-auth-token': githubToken,
    };

    const authorizationHeaders = {
        'Authorization': `token ${githubToken}`,
    };

    // Bulk headers WITH IMS token for DA.live content source
    const xAuthBulkHeaders: Record<string, string> = {
        ...xAuthHeaders,
        'Content-Type': 'application/json',
    };

    const authorizationBulkHeaders: Record<string, string> = {
        ...authorizationHeaders,
        'Content-Type': 'application/json',
    };

    // Add IMS token if provided (required for DA.live content source)
    if (imsToken) {
        xAuthBulkHeaders['x-content-source-authorization'] = `Bearer ${imsToken}`;
        authorizationBulkHeaders['x-content-source-authorization'] = `Bearer ${imsToken}`;
    }

    // ======== x-auth-token header (our current implementation) ========

    // Test 1: Single page preview with x-auth-token
    results.push(await testEndpoint(
        '[x-auth-token] Single Preview GET',
        `${HELIX_ADMIN_URL}/preview/${org}/${repo}/${branch}/`,
        'GET',
        xAuthHeaders,
    ));

    // Test 2: Bulk preview with x-auth-token
    results.push(await testEndpoint(
        '[x-auth-token] Bulk Preview',
        `${HELIX_ADMIN_URL}/preview/${org}/${repo}/${branch}`,
        'POST',
        xAuthBulkHeaders,
        { paths: ['/'], forceUpdate: true },
    ));

    // Test 3: Bulk preview wildcard with x-auth-token
    results.push(await testEndpoint(
        '[x-auth-token] Bulk Preview /*',
        `${HELIX_ADMIN_URL}/preview/${org}/${repo}/${branch}`,
        'POST',
        xAuthBulkHeaders,
        { paths: ['/*'], forceUpdate: true },
    ));

    // ======== Authorization: token header (per official docs) ========

    // Test 4: Single page preview with Authorization header
    results.push(await testEndpoint(
        '[Authorization] Single Preview GET',
        `${HELIX_ADMIN_URL}/preview/${org}/${repo}/${branch}/`,
        'GET',
        authorizationHeaders,
    ));

    // Test 5: Bulk preview with Authorization header
    results.push(await testEndpoint(
        '[Authorization] Bulk Preview',
        `${HELIX_ADMIN_URL}/preview/${org}/${repo}/${branch}`,
        'POST',
        authorizationBulkHeaders,
        { paths: ['/'], forceUpdate: true },
    ));

    // Test 6: Bulk preview wildcard with Authorization header
    results.push(await testEndpoint(
        '[Authorization] Bulk Preview /*',
        `${HELIX_ADMIN_URL}/preview/${org}/${repo}/${branch}`,
        'POST',
        authorizationBulkHeaders,
        { paths: ['/*'], forceUpdate: true },
    ));

    // ======== Bulk Status (useful for job tracking) ========

    // Test 7: Bulk status check
    results.push(await testEndpoint(
        '[Authorization] Bulk Status',
        `${HELIX_ADMIN_URL}/status/${org}/${repo}/${branch}`,
        'POST',
        authorizationBulkHeaders,
        { paths: ['/'], select: ['preview', 'live'] },
    ));

    // Summary
    console.log('\n========================================');
    console.log('Summary');
    console.log('========================================');

    for (const result of results) {
        const icon = result.status >= 200 && result.status < 300 ? '✅' :
                     result.status === 202 ? '✅' :
                     result.status === 401 ? '🔒' :
                     result.status === 403 ? '🚫' : '❌';
        console.log(`${icon} ${result.endpoint}: ${result.status} ${result.statusText}`);
    }

    // Analysis
    console.log('\n========================================');
    console.log('Analysis');
    console.log('========================================');

    const isSuccess = (r: TestResult) => r.status >= 200 && r.status < 300 || r.status === 202;

    const xAuthSingleWorks = results.some(r => r.endpoint.includes('x-auth-token') && r.endpoint.includes('Single') && isSuccess(r));
    const xAuthBulkWorks = results.some(r => r.endpoint.includes('x-auth-token') && r.endpoint.includes('Bulk') && isSuccess(r));
    const authSingleWorks = results.some(r => r.endpoint.includes('Authorization') && r.endpoint.includes('Single') && isSuccess(r));
    const authBulkWorks = results.some(r => r.endpoint.includes('Authorization') && r.endpoint.includes('Bulk') && isSuccess(r));

    console.log('x-auth-token header (current code):');
    console.log(`  Single operations: ${xAuthSingleWorks ? '✅' : '❌'}`);
    console.log(`  Bulk operations: ${xAuthBulkWorks ? '✅' : '❌'}`);
    console.log('');
    console.log('Authorization: token header (per docs):');
    console.log(`  Single operations: ${authSingleWorks ? '✅' : '❌'}`);
    console.log(`  Bulk operations: ${authBulkWorks ? '✅' : '❌'}`);
    console.log('');

    if (!xAuthBulkWorks && authBulkWorks) {
        console.log('🔑 FINDING: Bulk operations require "Authorization: token" header!');
        console.log('   Update helixService.ts to use Authorization header for bulk operations.');
    } else if (xAuthBulkWorks && authBulkWorks) {
        console.log('✅ Both header formats work for bulk operations.');
    } else if (!xAuthBulkWorks && !authBulkWorks) {
        console.log('⚠️  Neither header format works for bulk operations.');
        console.log('   This may require an API_KEY from Adobe (not a GitHub PAT).');
        console.log('   See: https://www.aem.live/docs/admin.html');
    }
}


main().catch(console.error);
