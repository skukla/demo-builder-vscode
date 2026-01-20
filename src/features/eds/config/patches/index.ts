/**
 * Patch Content Index
 *
 * Exports all patch content modules for use by the template patch registry.
 * Each patch module exports searchPattern and replacement strings.
 */

import * as headerNavToolsDefensive from './header-nav-tools-defensive';

/**
 * Map of patch ID to patch content module
 */
export const patchContent: Record<string, { searchPattern: string; replacement: string }> = {
    'header-nav-tools-defensive': headerNavToolsDefensive,
};
