/**
 * Whether the screen offers writing a datapack into the Data Installer: Copy to the Data Installer
 * in the flyout, and the Data Installer as Load from File's destination. Off until the Data
 * Installer lets our accounts write to it (owner, 2026-11-06), since until then either would fail
 * every time (`INSTALLER_WRITE_REFUSED`, `handlers/datapackZipHandlers.ts`). Turning both on is
 * this one line. Agents have neither (D7, datapack-simplification Phase 8): no copy tool, and
 * `load_datapack_zip` forces My Datapacks (`ai/server/dataInstallerDescriptors.ts`).
 *
 * @module features/data-installer/installerWrites
 */
export const INSTALLER_WRITES_SHOWN = false;
