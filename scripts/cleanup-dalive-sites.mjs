#!/usr/bin/env node
/**
 * Cleanup Script: Delete incorrectly created DA.live sites
 * 
 * Usage: node scripts/cleanup-dalive-sites.mjs <org-name> <site-prefix>
 * Example: node scripts/cleanup-dalive-sites.mjs skukla citisignal-eds-paas
 * 
 * This will delete all sites that start with "citisignal-eds-paas" but are NOT
 * exactly "citisignal-eds-paas" (to preserve the correct site if it exists).
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DA_LIVE_BASE_URL = 'https://admin.da.live';

/**
 * Get Adobe IMS access token
 */
async function getAccessToken() {
    // Try environment variable first
    if (process.env.ADOBE_IMS_TOKEN) {
        return process.env.ADOBE_IMS_TOKEN;
    }

    // Fallback to aio CLI
    try {
        const { stdout } = await execAsync('aio auth:ctx -g');
        const token = stdout.trim();
        if (!token) {
            throw new Error('No access token found. Please run: aio login or set ADOBE_IMS_TOKEN env var');
        }
        return token;
    } catch (error) {
        throw new Error(`Failed to get access token: ${error.message}\nTip: You can also set ADOBE_IMS_TOKEN environment variable`);
    }
}

/**
 * List all sites in an organization
 */
async function listSites(token, orgName) {
    const url = `${DA_LIVE_BASE_URL}/list/${orgName}/`;
    
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to list sites: ${response.status} ${response.statusText}`);
    }

    const entries = await response.json();
    return entries.filter(entry => entry.type === 'folder').map(entry => entry.name);
}

/**
 * Delete a site
 */
async function deleteSite(token, org, site) {
    const url = `${DA_LIVE_BASE_URL}/source/${org}/${site}/`;
    
    const response = await fetch(url, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });

    // 404 means already deleted (acceptable)
    if (response.status === 404) {
        return { success: true, alreadyDeleted: true };
    }

    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }

    return { success: true };
}

/**
 * Main cleanup function
 */
async function main() {
    const [,, orgName, sitePrefix] = process.argv;

    if (!orgName || !sitePrefix) {
        console.error('Usage: node scripts/cleanup-dalive-sites.mjs <org-name> <site-prefix>');
        console.error('Example: node scripts/cleanup-dalive-sites.mjs skukla citisignal-eds-paas');
        process.exit(1);
    }

    console.log(`🔍 Scanning DA.live org: ${orgName}`);
    console.log(`🎯 Looking for sites starting with: ${sitePrefix}`);
    console.log('');

    try {
        // Get token
        const token = await getAccessToken();
        console.log('✅ Authenticated with Adobe IMS\n');

        // List sites
        const sites = await listSites(token, orgName);
        console.log(`📋 Found ${sites.length} total sites in org\n`);

        // Filter sites to delete (start with prefix but are NOT exactly the prefix)
        const sitesToDelete = sites.filter(site => 
            site.startsWith(sitePrefix) && site !== sitePrefix
        );

        if (sitesToDelete.length === 0) {
            console.log('✨ No incorrect sites found. Nothing to clean up!');
            return;
        }

        console.log(`🗑️  Will delete ${sitesToDelete.length} incorrect sites:`);
        sitesToDelete.forEach(site => console.log(`   - ${site}`));
        console.log('');

        // Confirm
        console.log('⚠️  This action cannot be undone!');
        console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Delete sites
        let deleted = 0;
        let failed = 0;

        for (const site of sitesToDelete) {
            process.stdout.write(`Deleting ${site}... `);
            try {
                const result = await deleteSite(token, orgName, site);
                if (result.alreadyDeleted) {
                    console.log('✓ (already deleted)');
                } else {
                    console.log('✓');
                }
                deleted++;
            } catch (error) {
                console.log(`✗ (${error.message})`);
                failed++;
            }
        }

        console.log('');
        console.log('━'.repeat(50));
        console.log(`✅ Deleted: ${deleted}`);
        if (failed > 0) {
            console.log(`❌ Failed: ${failed}`);
        }
        console.log('━'.repeat(50));

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
