#!/usr/bin/env npx ts-node
/**
 * Test script for Helix publish functionality
 *
 * Usage:
 *   npx ts-node scripts/test-helix-publish.ts
 *
 * Prerequisites:
 *   - Adobe CLI logged in: `aio auth login`
 *   - GitHub CLI logged in: `gh auth login`
 *
 * Or provide tokens manually:
 *   GITHUB_TOKEN=xxx IMS_TOKEN=xxx npx ts-node scripts/test-helix-publish.ts
 */

import { execSync } from 'child_process';

// Configuration
const CONFIG = {
    githubRepo: 'skukla/citisignal-eds-paas',
    daLiveOrg: 'skukla',
    daLiveSite: 'citisignal-eds-paas',
    branch: 'main',
};

/**
 * Get IMS token from Adobe CLI
 */
function getImsToken(): string | null {
    // Check environment first
    if (process.env.IMS_TOKEN) {
        return process.env.IMS_TOKEN;
    }

    try {
        console.log('🔑 Getting IMS token from Adobe CLI...');
        const output = execSync('aio config get ims.contexts.cli.access_token --json', {
            encoding: 'utf8',
            timeout: 10000,
        });

        // Clean output (remove Node version warnings)
        const cleanOutput = output
            .split('\n')
            .filter(line => !line.startsWith('Using Node') && !line.includes('fnm') && line.trim())
            .join('\n')
            .trim();

        const parsed = JSON.parse(cleanOutput);
        if (parsed && parsed.token) {
            console.log('✅ IMS token retrieved from Adobe CLI');
            return parsed.token;
        }
        return null;
    } catch (error) {
        console.error('❌ Failed to get IMS token from Adobe CLI');
        console.error('   Run: aio auth login');
        return null;
    }
}

/**
 * Get GitHub token from GitHub CLI
 */
function getGitHubToken(): string | null {
    // Check environment first
    if (process.env.GITHUB_TOKEN) {
        return process.env.GITHUB_TOKEN;
    }

    try {
        console.log('🔑 Getting GitHub token from GitHub CLI...');
        const token = execSync('gh auth token', {
            encoding: 'utf8',
            timeout: 5000,
        }).trim();

        if (token) {
            console.log('✅ GitHub token retrieved from GitHub CLI');
            return token;
        }
        return null;
    } catch (error) {
        console.error('❌ Failed to get GitHub token from GitHub CLI');
        console.error('   Run: gh auth login');
        return null;
    }
}

// Get tokens
const IMS_TOKEN = getImsToken();
const GITHUB_TOKEN = getGitHubToken();

if (!GITHUB_TOKEN) {
    console.error('\n❌ GitHub token is required');
    console.error('   Option 1: Run `gh auth login`');
    console.error('   Option 2: Set GITHUB_TOKEN environment variable');
    process.exit(1);
}

if (!IMS_TOKEN) {
    console.error('\n❌ IMS token is required');
    console.error('   Option 1: Run `aio auth login`');
    console.error('   Option 2: Set IMS_TOKEN environment variable');
    process.exit(1);
}

console.log('');

// Simple logger
const logger = {
    debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    error: (msg: string, err?: Error) => console.error(`[ERROR] ${msg}`, err?.message || ''),
    trace: (msg: string) => console.log(`[TRACE] ${msg}`),
};

// Constants
const HELIX_ADMIN_URL = 'https://admin.hlx.page';
const DA_LIVE_API_URL = 'https://admin.da.live';
const TIMEOUTS = {
    QUICK: 5000,
    NORMAL: 30000,
    LONG: 180000,
};

interface DaLiveEntry {
    name: string;
    path: string;
    ext?: string;
    lastModified?: string;
}

/**
 * List directory contents from DA.live
 */
async function listDaLiveDirectory(org: string, site: string, path: string = '/'): Promise<DaLiveEntry[]> {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const url = `${DA_LIVE_API_URL}/list/${org}/${site}${normalizedPath ? '/' + normalizedPath : ''}`;

    logger.debug(`Listing DA.live: ${url}`);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${IMS_TOKEN}`,
        },
        signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
    });

    if (!response.ok) {
        throw new Error(`DA.live list failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

/**
 * Recursively list all publishable pages from DA.live
 */
async function listAllPages(org: string, site: string, path: string = '/'): Promise<string[]> {
    const pages: string[] = [];
    const pathPrefix = `/${org}/${site}`;

    const EXCLUDED_NAMES = ['metadata', 'redirects', 'placeholders', 'query-index', 'test-index'];
    const EXCLUDED_FOLDERS = ['.helix', '.milo', 'placeholders', 'experiments', 'enrichment'];

    try {
        const entries = await listDaLiveDirectory(org, site, path);
        logger.debug(`Listed ${entries.length} entries at ${path}`);

        for (const entry of entries) {
            const isFolder = !entry.ext;

            if (isFolder) {
                if (EXCLUDED_FOLDERS.includes(entry.name)) {
                    logger.debug(`Skipping excluded folder: ${entry.name}`);
                    continue;
                }

                const relativePath = entry.path.replace(pathPrefix, '') || '/';
                const subPages = await listAllPages(org, site, relativePath);
                pages.push(...subPages);
            } else {
                if (entry.ext !== 'html') {
                    continue;
                }

                if (EXCLUDED_NAMES.includes(entry.name)) {
                    continue;
                }

                // Convert DA.live path to web path
                let webPath = entry.path.replace(pathPrefix, '');
                webPath = webPath.replace(/\.html$/i, '');
                if (webPath === '/index' || webPath.endsWith('/index')) {
                    webPath = webPath.slice(0, -6) || '/';
                }

                pages.push(webPath || '/');
            }
        }
    } catch (error) {
        logger.warn(`Failed to list ${path}: ${(error as Error).message}`);
    }

    return pages;
}

/**
 * Preview a single page via Helix Admin API
 */
async function previewPage(org: string, site: string, path: string, branch: string): Promise<void> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const cleanPath = normalizedPath.endsWith('/') && normalizedPath !== '/'
        ? normalizedPath.slice(0, -1)
        : normalizedPath;
    const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}${cleanPath}`;

    logger.debug(`Previewing: ${url}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'x-auth-token': GITHUB_TOKEN!,
            'x-content-source-authorization': `Bearer ${IMS_TOKEN}`, // For DA.live content source
        },
        signal: AbortSignal.timeout(TIMEOUTS.LONG),
    });

    const responseBody = await response.text();

    if (response.status === 401) {
        throw new Error(`Preview auth failed (401): ${responseBody}`);
    }

    if (response.status === 403) {
        throw new Error(`Preview access denied (403): ${responseBody}`);
    }

    if (!response.ok) {
        throw new Error(`Preview failed (${response.status}): ${responseBody}`);
    }
}

/**
 * Publish a single page via Helix Admin API
 */
async function publishPage(org: string, site: string, path: string, branch: string): Promise<void> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const cleanPath = normalizedPath.endsWith('/') && normalizedPath !== '/'
        ? normalizedPath.slice(0, -1)
        : normalizedPath;
    const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}${cleanPath}`;

    logger.debug(`Publishing: ${url}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'x-auth-token': GITHUB_TOKEN!,
            'x-content-source-authorization': `Bearer ${IMS_TOKEN}`, // For DA.live content source
        },
        signal: AbortSignal.timeout(TIMEOUTS.LONG),
    });

    const responseBody = await response.text();

    if (response.status === 401) {
        throw new Error(`Publish auth failed (401): ${responseBody}`);
    }

    if (response.status === 403) {
        throw new Error(`Publish access denied (403): ${responseBody}`);
    }

    if (!response.ok) {
        throw new Error(`Publish failed (${response.status}): ${responseBody}`);
    }
}

/**
 * Wait for Helix to be ready (readiness check)
 */
async function waitForPublishReadiness(
    org: string,
    site: string,
    branch: string,
    maxAttempts: number = 5,
    delayMs: number = 3000,
): Promise<void> {
    logger.info('Verifying publish readiness...');

    const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}/`;
    logger.debug(`Readiness check URL: ${url}`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'x-auth-token': GITHUB_TOKEN!,
                    'x-content-source-authorization': `Bearer ${IMS_TOKEN}`, // For DA.live content source
                },
                signal: AbortSignal.timeout(TIMEOUTS.QUICK),
            });

            // Log response details for debugging
            const responseBody = await response.text();
            logger.debug(`Response: ${response.status} ${response.statusText}`);
            if (responseBody) {
                logger.debug(`Response body: ${responseBody.slice(0, 500)}`);
            }

            if (response.status === 401) {
                throw new Error(`GitHub authentication failed (401). Response: ${responseBody}`);
            }

            if (response.status === 403) {
                throw new Error(`Access denied (403). Response: ${responseBody}`);
            }

            if (response.ok) {
                logger.info('✅ Publish readiness verified - Helix is ready');
                return;
            }

            throw new Error(`Preview returned ${response.status} ${response.statusText}. Response: ${responseBody}`);
        } catch (error) {
            const errorMessage = (error as Error).message;

            if (errorMessage.includes('401') || errorMessage.includes('403')) {
                throw error;
            }

            if (attempt < maxAttempts) {
                logger.warn(`Readiness check attempt ${attempt}/${maxAttempts} failed: ${errorMessage}. Retrying in ${delayMs / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
                logger.warn(`Readiness check failed after ${maxAttempts} attempts. Proceeding anyway...`);
            }
        }
    }
}

/**
 * Main test function
 */
async function main() {
    console.log('\n========================================');
    console.log('Helix Publish Test');
    console.log('========================================\n');

    console.log('Configuration:');
    console.log(`  GitHub Repo: ${CONFIG.githubRepo}`);
    console.log(`  DA.live Org: ${CONFIG.daLiveOrg}`);
    console.log(`  DA.live Site: ${CONFIG.daLiveSite}`);
    console.log(`  Branch: ${CONFIG.branch}`);
    console.log(`  GitHub Token: ${GITHUB_TOKEN?.slice(0, 8)}...`);
    console.log(`  IMS Token: ${IMS_TOKEN?.slice(0, 8)}...`);
    console.log('');

    const [githubOrg, githubSite] = CONFIG.githubRepo.split('/');

    try {
        // Step 1: List pages from DA.live
        logger.info(`Listing pages from DA.live: ${CONFIG.daLiveOrg}/${CONFIG.daLiveSite}`);
        const pages = await listAllPages(CONFIG.daLiveOrg, CONFIG.daLiveSite);

        if (pages.length === 0) {
            logger.error('No publishable pages found!');
            process.exit(1);
        }

        logger.info(`Found ${pages.length} pages to publish`);
        console.log('\nPages found:');
        pages.slice(0, 10).forEach(p => console.log(`  - ${p}`));
        if (pages.length > 10) {
            console.log(`  ... and ${pages.length - 10} more`);
        }
        console.log('');

        // Step 2: Verify Helix readiness
        await waitForPublishReadiness(githubOrg, githubSite, CONFIG.branch);

        // Step 3: Publish each page
        logger.info(`Publishing ${pages.length} pages to ${CONFIG.githubRepo}...`);

        const results: { path: string; success: boolean; error?: string }[] = [];
        let successCount = 0;
        let failCount = 0;

        for (const path of pages) {
            try {
                process.stdout.write(`  Publishing ${path}... `);
                await previewPage(githubOrg, githubSite, path, CONFIG.branch);
                await publishPage(githubOrg, githubSite, path, CONFIG.branch);
                results.push({ path, success: true });
                successCount++;
                console.log('✅');
            } catch (error) {
                const errorMessage = (error as Error).message;
                results.push({ path, success: false, error: errorMessage });
                failCount++;
                console.log(`❌ ${errorMessage}`);
            }
        }

        // Step 4: Report results
        console.log('\n========================================');
        console.log('Results');
        console.log('========================================\n');
        console.log(`✅ Success: ${successCount}/${pages.length}`);
        console.log(`❌ Failed: ${failCount}/${pages.length}`);

        if (failCount > 0) {
            console.log('\nFailed pages:');
            results.filter(r => !r.success).slice(0, 10).forEach(r => {
                console.log(`  - ${r.path}: ${r.error}`);
            });
            if (failCount > 10) {
                console.log(`  ... and ${failCount - 10} more`);
            }
        }

        console.log('\n');

        if (successCount === 0) {
            process.exit(1);
        }

    } catch (error) {
        logger.error('Test failed', error as Error);
        process.exit(1);
    }
}

// Run
main();
