/**
 * Data Installer handler exports.
 *
 * The map is what a webview command registers wholesale via `getRegisteredTypes`,
 * so later stages add message types with no per-message wiring.
 *
 * @module features/data-installer/handlers
 */

export { dataInstallerHandlers, resolveDataInstallerAccess } from './dataInstallerHandlers';
export type { DataInstallerAccess } from './dataInstallerHandlers';
