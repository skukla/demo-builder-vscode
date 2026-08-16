/**
 * Data Installer handler exports.
 *
 * TWO maps, deliberately not merged. The panel registers the union, but the READ
 * map is what the MCP descriptors mirror — a completeness test asserts the tools
 * cover it exactly. Merging writes in would either silently expose them to agents
 * or force that test to carry an exclusion list, and datapack writes are the ones
 * held back on purpose: the catalog is shared infrastructure with no undo.
 *
 * @module features/data-installer/handlers
 */

export { dataInstallerHandlers, resolveDataInstallerAccess } from './dataInstallerHandlers';
export type { DataInstallerAccess } from './dataInstallerHandlers';
export { importHandlers } from './importHandlers';
