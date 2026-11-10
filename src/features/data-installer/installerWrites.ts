/**
 * Whether the screen offers writing a datapack into the Data Installer: Copy to the Data Installer
 * in the flyout, and the Data Installer as Load from File's destination. Off until the Data
 * Installer lets our accounts write to it (owner, 2026-11-06), since until then either would fail
 * every time (`INSTALLER_WRITE_REFUSED`, `handlers/datapackZipHandlers.ts`). Turning both on is
 * this one line. The agent tools that write there are not gated by it.
 *
 * @module features/data-installer/installerWrites
 */
export const INSTALLER_WRITES_SHOWN = false;
