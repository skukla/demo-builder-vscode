#!/usr/bin/env npx ts-node
/**
 * Diagnostic script: Test CDN unpublish auth strategies
 *
 * From Slack thread findings:
 *   - DELETE /live with x-auth-token (GitHub token) → blocked by "source exists"
 *   - DELETE /live with Authorization: token <apiKey> → may bypass restriction
 *   - Bulk POST with delete:true + API key → may work (tools.aem.live uses this)
 *
 * Tests:
 *   A. DELETE /live with GitHub token (baseline — expected to fail)
 *   B. Provision Admin API key via IMS token
 *   C. DELETE /live with API key auth
 *   D. Bulk POST /live/* with delete:true + API key
 *
 * Token resolution:
 *   GITHUB_TOKEN env var → gh auth token
 *   IMS_TOKEN env var (required for API key provisioning)
 *
 * Usage:
 *   IMS_TOKEN=ey... GITHUB_TOKEN=ghp_... npx ts-node scripts/test-fstab-codesync-timing.ts <org> <repo> [test-path]
 *
 * Example:
 *   IMS_TOKEN=ey... npx ts-node scripts/test-fstab-codesync-timing.ts skukla isle5-accs-eds /accessories
 */

import { execSync } from 'child_process';

const HELIX_ADMIN_URL = 'https://admin.hlx.page';

interface DeleteResult {
    status: number;
    sourceBlocked: boolean;
    detail: string;
}

function resolveGitHubToken(): string | null {
    if (process.env.GITHUB_TOKEN) {
        return process.env.GITHUB_TOKEN;
    }
    try {
        const token = execSync('gh auth token', { encoding: 'utf-8', timeout: 5000 }).trim();
        if (token) { return token; }
    } catch { /* gh not installed */ }
    return null;
}

/**
 * Resolve DA.live IMS token.
 * This is the token obtained from the DA.live bookmarklet/browser flow.
 * It's an Adobe IMS token with the DA.live client_id.
 *
 * To get this token:
 *   1. Go to da.live in your browser (sign in if needed)
 *   2. Open DevTools → Application → Local Storage → https://da.live
 *   3. Copy the value of the "token" key
 */
function resolveImsToken(): string | null {
    return process.env.DA_TOKEN || process.env.IMS_TOKEN || null;
}

function parseXError(response: Response): string {
    return response.headers.get('x-error') || '';
}

/** Test DELETE /live with x-auth-token header (GitHub token auth) */
async function testDeleteWithGitHubToken(
    githubToken: string, org: string, site: string, path: string,
): Promise<DeleteResult> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/main${cleanPath}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'x-auth-token': githubToken },
        signal: AbortSignal.timeout(15000),
    });
    const detail = parseXError(response);
    return {
        status: response.status,
        sourceBlocked: detail.includes('source exists'),
        detail: detail || `(status ${response.status}, no x-error)`,
    };
}

/** Test DELETE /live with Authorization: token header (API key auth) */
async function testDeleteWithApiKey(
    apiKey: string, org: string, site: string, path: string,
): Promise<DeleteResult> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/main${cleanPath}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `token ${apiKey}` },
        signal: AbortSignal.timeout(15000),
    });
    const detail = parseXError(response);
    return {
        status: response.status,
        sourceBlocked: detail.includes('source exists'),
        detail: detail || `(status ${response.status}, no x-error)`,
    };
}

/** Test DELETE /preview with API key auth */
async function testDeletePreviewWithApiKey(
    apiKey: string, org: string, site: string, path: string,
): Promise<DeleteResult> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/main${cleanPath}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `token ${apiKey}` },
        signal: AbortSignal.timeout(15000),
    });
    const detail = parseXError(response);
    return {
        status: response.status,
        sourceBlocked: detail.includes('source exists'),
        detail: detail || `(status ${response.status}, no x-error)`,
    };
}

/** Test bulk POST with delete:true (what tools.aem.live uses) */
async function testBulkDelete(
    apiKey: string, org: string, site: string, paths: string[],
    partition: 'live' | 'preview',
): Promise<{ status: number; detail: string; body: unknown }> {
    const url = `${HELIX_ADMIN_URL}/${partition}/${org}/${site}/main/*`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `token ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paths, delete: true }),
        signal: AbortSignal.timeout(30000),
    });
    const detail = parseXError(response);
    let body: unknown = null;
    try { body = await response.json(); } catch { /* empty body */ }
    return { status: response.status, detail, body };
}

/** Provision an Admin API key using IMS token */
async function provisionApiKey(
    imsToken: string, org: string, site: string,
): Promise<string | null> {
    const url = `${HELIX_ADMIN_URL}/config/${org}/sites/${site}/apiKeys.json`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${imsToken}` },
        signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
        const detail = parseXError(response);
        console.log(`   ❌ API key provisioning failed: ${response.status} ${detail}`);
        return null;
    }
    const data = await response.json() as { apiKey?: string; key?: string; value?: string };
    return data.apiKey || data.key || data.value || null;
}

function printResult(label: string, result: DeleteResult | { status: number; detail: string }): void {
    const blocked = 'sourceBlocked' in result ? result.sourceBlocked : false;
    const icon = result.status === 204 || result.status === 404 ? '✅' :
        result.status === 202 ? '🔄' : blocked ? '🚫' : '❌';
    console.log(`   ${icon} ${label}: ${result.status} — ${result.detail}`);
}

async function main() {
    const args = process.argv.slice(2).filter(a => !a.startsWith('--'));

    if (args.length < 2) {
        console.log('Usage: IMS_TOKEN=ey... npx ts-node scripts/test-fstab-codesync-timing.ts <org> <repo> [test-path]');
        console.log('');
        console.log('  org           GitHub org/owner (e.g., skukla)');
        console.log('  repo          GitHub repo name (e.g., isle5-accs-eds)');
        console.log('  test-path     Published page path to probe (default: /accessories)');
        console.log('');
        console.log('Environment variables:');
        console.log('  GITHUB_TOKEN  GitHub PAT (or auto-detected from gh CLI)');
        console.log('  DA_TOKEN      DA.live token (from browser Local Storage)');
        process.exit(1);
    }

    const [org, repo, testPath = '/accessories'] = args;
    const cleanPath = testPath.startsWith('/') ? testPath : `/${testPath}`;

    const githubToken = resolveGitHubToken();
    const imsToken = resolveImsToken();

    console.log('=== CDN Unpublish Auth Strategy Diagnostic ===');
    console.log(`Site: ${org}/${repo}`);
    console.log(`Test path: ${cleanPath}`);
    console.log(`GitHub token: ${githubToken ? `✓ (${githubToken.substring(0, 7)}...)` : '✗ missing'}`);
    console.log(`DA.live token: ${imsToken ? `✓ (${imsToken.substring(0, 10)}...)` : '✗ missing'}`);
    console.log('');

    // === Test A: Baseline — DELETE /live with GitHub token ===
    if (githubToken) {
        console.log('--- Test A: DELETE /live with GitHub token (x-auth-token) ---');
        const result = await testDeleteWithGitHubToken(githubToken, org, repo, cleanPath);
        printResult('DELETE /live', result);
        if (result.sourceBlocked) {
            console.log('   → Expected: GitHub token cannot DELETE while source exists');
        }
        console.log('');
    }

    // === Test B: Provision Admin API key ===
    if (!imsToken) {
        console.log('--- Test B: Provision Admin API key ---');
        console.log('   ⚠️  No DA.live token found — cannot provision API key');
        console.log('   To get it: da.live → DevTools → Application → Local Storage → token');
        console.log('   Then set: DA_TOKEN=ey...');
        console.log('');
        console.log('=== Cannot proceed without IMS token ===');
        process.exit(1);
    }

    console.log('--- Test B: Provision Admin API key ---');
    const apiKey = await provisionApiKey(imsToken, org, repo);
    if (!apiKey) {
        console.log('   Cannot proceed without API key');
        process.exit(1);
    }
    console.log(`   ✓ API key provisioned: ${apiKey.substring(0, 10)}...`);
    console.log('');

    // === Test C: DELETE /live with API key ===
    console.log('--- Test C: DELETE /live with API key (Authorization: token) ---');
    const apiKeyDelete = await testDeleteWithApiKey(apiKey, org, repo, cleanPath);
    printResult('DELETE /live', apiKeyDelete);
    if (apiKeyDelete.status === 204 || apiKeyDelete.status === 404) {
        console.log('   → API key bypasses "source exists" restriction!');
    } else if (apiKeyDelete.sourceBlocked) {
        console.log('   → API key does NOT bypass "source exists" — same as GitHub token');
    }
    console.log('');

    // === Test D: DELETE /preview with API key ===
    console.log('--- Test D: DELETE /preview with API key ---');
    const previewDelete = await testDeletePreviewWithApiKey(apiKey, org, repo, cleanPath);
    printResult('DELETE /preview', previewDelete);
    console.log('');

    // === Test E: Bulk POST /live/* with delete:true + API key ===
    console.log('--- Test E: Bulk POST /live/* with delete:true + API key ---');
    const bulkLive = await testBulkDelete(apiKey, org, repo, [cleanPath], 'live');
    printResult('Bulk DELETE /live', bulkLive);
    if (bulkLive.body) {
        console.log(`   Response body: ${JSON.stringify(bulkLive.body, null, 2).split('\n').join('\n   ')}`);
    }
    console.log('');

    // === Test F: Bulk POST /preview/* with delete:true + API key ===
    console.log('--- Test F: Bulk POST /preview/* with delete:true + API key ---');
    const bulkPreview = await testBulkDelete(apiKey, org, repo, [cleanPath], 'preview');
    printResult('Bulk DELETE /preview', bulkPreview);
    if (bulkPreview.body) {
        console.log(`   Response body: ${JSON.stringify(bulkPreview.body, null, 2).split('\n').join('\n   ')}`);
    }
    console.log('');

    // === Test G: Bulk POST /live/* with DA.live Bearer token directly ===
    console.log('--- Test G: Bulk POST /live/* with delete:true + DA.live Bearer token ---');
    {
        const url = `${HELIX_ADMIN_URL}/live/${org}/${repo}/main/*`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${imsToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paths: [cleanPath], delete: true }),
            signal: AbortSignal.timeout(30000),
        });
        const detail = parseXError(response);
        let body: unknown = null;
        try { body = await response.json(); } catch { /* empty */ }
        printResult('Bulk DELETE /live (Bearer)', { status: response.status, detail: detail || `(status ${response.status})` });
        if (body) {
            console.log(`   Response body: ${JSON.stringify(body, null, 2).split('\n').join('\n   ')}`);
        }
    }
    console.log('');

    // === Test H: DELETE /live with DA.live Bearer token directly ===
    console.log('--- Test H: DELETE /live with DA.live Bearer token ---');
    {
        const url = `${HELIX_ADMIN_URL}/live/${org}/${repo}/main${cleanPath}`;
        const response = await fetch(url, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${imsToken}` },
            signal: AbortSignal.timeout(15000),
        });
        const detail = parseXError(response);
        printResult('DELETE /live (Bearer)', {
            status: response.status,
            sourceBlocked: detail.includes('source exists'),
            detail: detail || `(status ${response.status})`,
        });
    }
    console.log('');

    // === Test I: Bulk POST /live/* with both API key + DA.live token ===
    console.log('--- Test I: Bulk POST /live/* with API key + x-content-source-authorization ---');
    {
        const url = `${HELIX_ADMIN_URL}/live/${org}/${repo}/main/*`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `token ${apiKey}`,
                'x-content-source-authorization': `Bearer ${imsToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paths: [cleanPath], delete: true }),
            signal: AbortSignal.timeout(30000),
        });
        const detail = parseXError(response);
        let body: unknown = null;
        try { body = await response.json(); } catch { /* empty */ }
        printResult('Bulk DELETE /live (API key + IMS)', { status: response.status, detail: detail || `(status ${response.status})` });
        if (body) {
            console.log(`   Response body: ${JSON.stringify(body, null, 2).split('\n').join('\n   ')}`);
        }
    }
    console.log('');

    // === Summary ===
    console.log('=== Summary ===');
    console.log('Key: 204/404 = success, 202 = job created, 403 = blocked, 401 = auth failed');
    console.log('');
}

main().catch(error => {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
});
