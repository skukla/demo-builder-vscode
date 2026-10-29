/**
 * The shapes the DA.live Config API speaks — the multi-sheet config and its
 * permissions sheet — and the results the config and access services answer with.
 *
 * Split from `daLiveConfigService.ts` (EDS-8, 2026-10-04), which re-exports
 * every name here, so importers keep working.
 *
 * @module features/eds/services/daLive/daLiveConfigTypes
 */

/**
 * Permission row in the permissions sheet
 *
 * From storefront-tools permissions.js:
 * - path: 'CONFIG' for admin, '/**' for recursive access to all content
 * - groups: User email or org ID (comma-separated for multiple)
 * - actions: 'write' or 'read'
 * - comments: Optional description
 */
export interface PermissionRow {
    /** Content path pattern */
    path: string;
    /** User email(s) or group ID(s), comma-separated */
    groups: string;
    /** Permission level */
    actions: 'write' | 'read';
    /** Optional description */
    comments?: string;
}

/**
 * Sheet data structure within multi-sheet config
 */
export interface SheetData<T> {
    total: number;
    limit: number;
    offset: number;
    data: T[];
    ':colWidths'?: number[];
}

/**
 * Multi-sheet config format used by DA.live Config API
 */
export interface MultiSheetConfig {
    ':names': string[];
    ':version': number;
    ':type': 'multi-sheet';
    /** Data sheet (general key-value settings) */
    data?: SheetData<Record<string, string>>;
    /** Permissions sheet */
    permissions?: SheetData<PermissionRow>;
    /** Library sheet (block library configuration) */
    library?: SheetData<{ title: string; path: string }>;
    /** Allow other sheets */
    [key: string]: unknown;
}

/**
 * Result of granting user access
 */
export interface GrantAccessResult {
    success: boolean;
    error?: string;
}

/**
 * Result of checking user access
 */
export interface HasAccessResult {
    hasAccess: boolean;
    permissionLevel?: 'write' | 'read';
}

/** One address with a row on a site's content, and what the row lets it do. */
export interface ContentReader {
    email: string;
    actions: 'read' | 'write';
}

/**
 * Where the access services read and write the config sheets. `DaLiveConfigService`
 * is the one implementation; the access services are handed it, so every read and
 * write still goes through its methods.
 */
export interface ConfigSheetStore {
    getOrgConfig(org: string): Promise<MultiSheetConfig | null>;
    updateOrgConfig(org: string, config: MultiSheetConfig): Promise<void>;
    getConfig(org: string, site: string): Promise<MultiSheetConfig | null>;
    updateConfig(org: string, site: string, config: MultiSheetConfig): Promise<void>;
}
