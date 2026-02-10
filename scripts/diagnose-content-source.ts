/**
 * Diagnostic Script: Content Source Resolution
 *
 * Tests WHY content pages return 404 on the CDN by checking:
 * 1. What the Admin API thinks the content source is (editUrl=auto)
 * 2. Whether the Configuration Service is set up
 * 3. Whether a single-page preview actually works
 * 4. Whether the preview CDN has the page after preview
 *
 * Usage: npx ts-node scripts/diagnose-content-source.ts <github-token>
 *
 * Get your GitHub token from: VS Code > Settings > search "github" > look for token
 * Or use: gh auth token
 */

const GITHUB_ORG = 'skukla';
const GITHUB_REPO = 'citisignal-paas-eds';
const DALIVE_ORG = 'skukla';
const DALIVE_SITE = 'eds-paas-storefront';
const BRANCH = 'main';

const ADMIN_URL = 'https://admin.hlx.page';

async function diagnose(githubToken: string, daLiveToken?: string) {
    console.log('=== Content Source Diagnostic ===\n');

    // -------------------------------------------------------
    // Test 1: Admin API status — what content source does it see?
    // -------------------------------------------------------
    console.log('--- Test 1: Admin API content source resolution ---');
    const statusUrl = `${ADMIN_URL}/status/${GITHUB_ORG}/${GITHUB_REPO}/${BRANCH}/?editUrl=auto`;
    const statusRes = await fetch(statusUrl, {
        headers: { 'x-auth-token': githubToken },
    });
    const status = await statusRes.json();

    console.log(`  preview.status: ${status.preview?.status}`);
    console.log(`  live.status: ${status.live?.status}`);
    console.log(`  code.status: ${status.code?.status}`);
    console.log(`  edit.sourceLocation: ${status.edit?.sourceLocation || '(empty)'}`);
    console.log(`  edit.status: ${status.edit?.status}`);

    const sourceLocation = status.edit?.sourceLocation || '';
    if (sourceLocation.includes(DALIVE_SITE)) {
        console.log(`  ✅ sourceLocation correctly references DA.live site: ${DALIVE_SITE}`);
    } else if (sourceLocation.includes(GITHUB_REPO)) {
        console.log(`  ❌ sourceLocation uses GitHub repo name (${GITHUB_REPO}) instead of DA.live site (${DALIVE_SITE})`);
        console.log(`     This means Helix is looking for content at the WRONG DA.live site.`);
    } else {
        console.log(`  ⚠️ sourceLocation is unexpected: ${sourceLocation}`);
    }

    // -------------------------------------------------------
    // Test 2: Configuration Service — is it set up?
    // -------------------------------------------------------
    console.log('\n--- Test 2: Configuration Service status ---');
    const configUrl = `${ADMIN_URL}/config/${GITHUB_ORG}/sites/${GITHUB_REPO}/content.json`;
    const configRes = await fetch(configUrl, {
        headers: { 'x-auth-token': githubToken },
    });
    console.log(`  Config Service response: ${configRes.status} ${configRes.statusText}`);
    if (configRes.ok) {
        const config = await configRes.json();
        console.log(`  Config Service content source: ${JSON.stringify(config)}`);
    } else {
        const body = await configRes.text().catch(() => '');
        console.log(`  Response body: ${body.slice(0, 200)}`);
        if (configRes.status === 404) {
            console.log(`  ❌ Configuration Service NOT set up for this site.`);
            console.log(`     Helix may be using a default content source based on repo name.`);
        }
    }

    // -------------------------------------------------------
    // Test 3: fstab.yaml in code bus
    // -------------------------------------------------------
    console.log('\n--- Test 3: fstab.yaml in code bus ---');
    const fstabUrl = `${ADMIN_URL}/code/${GITHUB_ORG}/${GITHUB_REPO}/${BRANCH}/fstab.yaml`;
    const fstabRes = await fetch(fstabUrl, {
        headers: { 'x-auth-token': githubToken },
    });
    console.log(`  Code bus response: ${fstabRes.status}`);
    if (fstabRes.ok) {
        const fstab = await fstabRes.json();
        console.log(`  Source location: ${fstab.edit?.sourceLocation || '(none in response)'}`);
        console.log(`  ✅ fstab.yaml exists in code bus`);
    }

    // -------------------------------------------------------
    // Test 4: Single-page preview (synchronous)
    // -------------------------------------------------------
    if (!daLiveToken) {
        console.log('\n--- Test 4: SKIPPED (no DA.live token provided) ---');
        console.log('  To run this test, provide the DA.live IMS token as the second argument.');
        console.log('  Get it from DA.live > Network tab > look for Authorization: Bearer header');
    } else {
        console.log('\n--- Test 4: Single-page preview (homepage) ---');
        const previewUrl = `${ADMIN_URL}/preview/${GITHUB_ORG}/${GITHUB_REPO}/${BRANCH}/`;
        console.log(`  POST ${previewUrl}`);

        const previewRes = await fetch(previewUrl, {
            method: 'POST',
            headers: {
                'x-auth-token': githubToken,
                'x-content-source-authorization': `Bearer ${daLiveToken}`,
            },
        });

        console.log(`  Preview response: ${previewRes.status} ${previewRes.statusText}`);
        const previewBody = await previewRes.text().catch(() => '');
        if (previewBody) {
            console.log(`  Response body: ${previewBody.slice(0, 500)}`);
        }

        if (previewRes.ok) {
            console.log(`  ✅ Single-page preview succeeded!`);

            // Check if page is now on preview CDN
            console.log('\n  Waiting 3 seconds for CDN propagation...');
            await new Promise(r => setTimeout(r, 3000));

            const cdnUrl = `https://main--${GITHUB_REPO}--${GITHUB_ORG}.aem.page/`;
            const cdnRes = await fetch(cdnUrl, { method: 'HEAD' });
            console.log(`  Preview CDN check: ${cdnRes.status}`);
            if (cdnRes.ok) {
                console.log(`  ✅ Homepage is now accessible on preview CDN!`);
            } else {
                console.log(`  ❌ Homepage still 404 on preview CDN after successful preview`);
            }
        } else {
            console.log(`  ❌ Single-page preview FAILED`);
            if (previewRes.status === 404) {
                console.log(`     404 = Helix cannot find content at the configured source.`);
                console.log(`     This confirms the content source is misconfigured.`);
            }
        }
    }

    // -------------------------------------------------------
    // Test 5: Try setting up Configuration Service content source
    // -------------------------------------------------------
    console.log('\n--- Test 5: Configuration Service content source setup ---');
    console.log(`  Would configure: ${ADMIN_URL}/config/${GITHUB_ORG}/sites/${GITHUB_REPO}/content.json`);
    console.log(`  With body: { "source": { "url": "https://content.da.live/${DALIVE_ORG}/${DALIVE_SITE}/", "type": "markup" } }`);
    console.log(`  Run with --fix flag to actually apply this.`);

    if (process.argv.includes('--fix')) {
        console.log('\n  Applying Configuration Service fix...');
        const fixRes = await fetch(
            `${ADMIN_URL}/config/${GITHUB_ORG}/sites/${GITHUB_REPO}/content.json`,
            {
                method: 'POST',
                headers: {
                    'x-auth-token': githubToken,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    source: {
                        url: `https://content.da.live/${DALIVE_ORG}/${DALIVE_SITE}/`,
                        type: 'markup',
                    },
                }),
            },
        );
        console.log(`  Fix response: ${fixRes.status} ${fixRes.statusText}`);
        const fixBody = await fixRes.text().catch(() => '');
        if (fixBody) {
            console.log(`  Response body: ${fixBody.slice(0, 500)}`);
        }
        if (fixRes.ok) {
            console.log(`  ✅ Configuration Service content source set!`);
            console.log(`  Now try previewing a page to verify.`);
        } else {
            console.log(`  ❌ Failed to set Configuration Service`);
        }
    }

    // -------------------------------------------------------
    // Summary
    // -------------------------------------------------------
    console.log('\n=== Summary ===');
    console.log(`  GitHub repo: ${GITHUB_ORG}/${GITHUB_REPO}`);
    console.log(`  DA.live site: ${DALIVE_ORG}/${DALIVE_SITE}`);
    console.log(`  fstab.yaml says: content.da.live/${DALIVE_ORG}/${DALIVE_SITE}/`);
    console.log(`  Admin API sees: ${sourceLocation || '(unknown)'}`);
    console.log(`  Config Service: ${configRes.status === 200 ? 'SET UP' : 'NOT SET UP'}`);
    console.log(`  Content pages: ${status.preview?.status === 200 ? 'OK' : '404 on CDN'}`);
}

// Parse args
const githubToken = process.argv[2];
const daLiveToken = process.argv[3];

if (!githubToken) {
    console.log('Usage: npx ts-node scripts/diagnose-content-source.ts <github-token> [da-live-token] [--fix]');
    console.log('');
    console.log('  github-token: Run `gh auth token` to get your GitHub token');
    console.log('  da-live-token: (optional) DA.live IMS token for single-page preview test');
    console.log('  --fix: (optional) Actually apply the Configuration Service fix');
    process.exit(1);
}

diagnose(githubToken, daLiveToken).catch(console.error);
