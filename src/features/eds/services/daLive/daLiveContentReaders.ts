/**
 * Who may READ a DA.live site's authored content (EDS-22): one `read` row per
 * address on the site's path in the ORG permissions sheet. Every read and write
 * goes through the `ConfigSheetStore` it is handed.
 *
 * Split from `daLiveConfigService.ts` (EDS-8, 2026-10-04), whose public methods
 * still answer for these, so callers keep working.
 *
 * @module features/eds/services/daLive/daLiveContentReaders
 */

import type {
    ConfigSheetStore,
    ContentReader,
    GrantAccessResult,
    MultiSheetConfig,
    PermissionRow,
} from './daLiveConfigTypes';
import type { Logger } from '@/types/logger';

export class DaLiveContentReaders {
    constructor(
        private store: ConfigSheetStore,
        private logger: Logger,
    ) {}

    /**
     * Everyone with a row on this site's content in the ORG permissions sheet,
     * one entry per address (a row's `groups` may be a comma-separated list).
     *
     * @throws Error when the org config cannot be read (401/403 for a non-owner)
     */
    async listContentReaders(org: string, site: string): Promise<ContentReader[]> {
        const existing = await this.store.getOrgConfig(org);
        const rows = existing?.permissions?.data ?? [];
        const sitePath = contentPathOf(site);
        const readers: ContentReader[] = [];
        for (const row of rows) {
            if (row.path !== sitePath) continue;
            for (const email of groupsOf(row)) {
                readers.push({ email, actions: row.actions });
            }
        }
        return readers;
    }

    /**
     * Let `userEmail` READ this site's authored content: one `read` row on the
     * site's path in the ORG sheet. Nothing else is granted — not CONFIG, not the
     * org root — so a reader can copy the site and never change it.
     *
     * A sheet that holds any row restricts everyone it does not name, the owner
     * included. So when the sheet is EMPTY and `ownerEmail` is given, the owner's
     * own write rows go in first (the same three `grantUserAccess` writes for a
     * site's creator). An address already able to read or write the path is left
     * as it is — no duplicate row, no downgrade.
     *
     * @param org - DA.live organization name
     * @param site - DA.live site name
     * @param userEmail - the reader
     * @param ownerEmail - the signed-in owner, kept able to write when the sheet starts empty
     */
    async grantContentRead(
        org: string,
        site: string,
        userEmail: string,
        ownerEmail?: string,
    ): Promise<GrantAccessResult> {
        try {
            const existing = await this.store.getOrgConfig(org);
            const rows: PermissionRow[] = [...(existing?.permissions?.data ?? [])];
            const sitePath = contentPathOf(site);

            if (rows.length === 0 && ownerEmail) {
                rows.push(
                    { path: 'CONFIG', groups: ownerEmail, actions: 'write', comments: 'Demo Builder - config access' },
                    { path: '/+**', groups: ownerEmail, actions: 'write', comments: 'Demo Builder - org content access' },
                    { path: sitePath, groups: ownerEmail, actions: 'write', comments: `Demo Builder - ${site} content access` },
                );
            }

            const alreadyHas = rows.some(
                (row) => row.path === sitePath && groupsOf(row).some((g) => sameAddress(g, userEmail)),
            );
            if (alreadyHas) {
                this.logger.debug(`[DaLiveConfig] ${userEmail} can already read ${org}/${site}`);
                return { success: true };
            }
            rows.push({
                path: sitePath,
                groups: userEmail,
                actions: 'read',
                comments: `Demo Builder - ${site} content read`,
            });

            await this.store.updateOrgConfig(org, withPermissions(existing, rows));
            this.logger.info(`[DaLiveConfig] Read access granted for ${org}/${site}`);
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[DaLiveConfig] Failed to grant read access: ${message}`);
            return { success: false, error: message };
        }
    }

    /**
     * Stop `userEmail` reading this site's content: the address leaves every `read`
     * row on the site's path (a row that named several keeps the others; one left
     * empty goes). Write rows, CONFIG and the org root are never touched here.
     */
    async revokeContentRead(org: string, site: string, userEmail: string): Promise<GrantAccessResult> {
        try {
            const existing = await this.store.getOrgConfig(org);
            const rows = existing?.permissions?.data ?? [];
            const sitePath = contentPathOf(site);
            let changed = false;
            const kept: PermissionRow[] = [];
            for (const row of rows) {
                if (row.path !== sitePath || row.actions !== 'read') {
                    kept.push(row);
                    continue;
                }
                const remaining = groupsOf(row).filter((g) => !sameAddress(g, userEmail));
                if (remaining.length === groupsOf(row).length) {
                    kept.push(row);
                    continue;
                }
                changed = true;
                if (remaining.length > 0) kept.push({ ...row, groups: remaining.join(', ') });
            }
            if (!changed) {
                this.logger.debug(`[DaLiveConfig] ${userEmail} had no read row on ${org}/${site}`);
                return { success: true };
            }
            await this.store.updateOrgConfig(org, withPermissions(existing, kept));
            this.logger.info(`[DaLiveConfig] Read access revoked for ${org}/${site}`);
            return { success: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`[DaLiveConfig] Failed to revoke read access: ${message}`);
            return { success: false, error: message };
        }
    }
}

/** The path a site's content rows carry: the site and everything under it. */
function contentPathOf(site: string): string {
    return `/${site}/+**`;
}

/** A row's addresses: `groups` may be one address or a comma-separated list. */
function groupsOf(row: PermissionRow): string[] {
    return row.groups
        .split(',')
        .map((g) => g.trim())
        .filter((g) => g.length > 0);
}

const sameAddress = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The org config with its permissions sheet replaced by `rows`, every other sheet kept. */
function withPermissions(existing: MultiSheetConfig | null, rows: PermissionRow[]): MultiSheetConfig {
    const names = [...(existing?.[':names'] ?? [])];
    if (!names.includes('permissions')) names.push('permissions');
    return {
        ...existing,
        ':names': names,
        ':version': 3,
        ':type': 'multi-sheet',
        permissions: {
            ...(existing?.permissions ?? {}),
            total: rows.length,
            limit: rows.length,
            offset: 0,
            data: rows,
            ':colWidths': [200, 350, 75, 150],
        },
    };
}
