/**
 * NodeVersionParser
 *
 * Utilities for parsing Node.js version information from fnm output.
 */

/**
 * Parse installed Node versions from fnm list output
 * @param stdout - Output from fnm list command
 * @returns Array of version strings (e.g., ['18.20.8', '20.19.5'])
 */
export function parseInstalledVersions(stdout: string): string[] {
    return stdout
        .trim()
        .split('\n')
        .map(line => {
            // Match patterns like "v20.19.5" or "20.19.5"
            const match = /v?(\d+\.\d+\.\d+)/.exec(line.trim());
            return match ? match[1] : null;
        })
        .filter((v): v is string => v !== null);
}

/**
 * Parse major versions from fnm list output
 * @param stdout - Output from fnm list command
 * @returns Array of major version strings (e.g., ['18', '20', '24'])
 */
export function parseMajorVersions(stdout: string): string[] {
    const versions = stdout.trim().split('\n').filter(v => v.trim());
    const majors = new Set<string>();

    for (const version of versions) {
        // Match patterns like "v20.19.5" or "20.19.5"
        const match = /v?(\d+)/.exec(version);
        if (match) {
            majors.add(match[1]);
        }
    }

    return Array.from(majors).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

/**
 * Build a mapping of major version to full version from fnm list output
 * @param stdout - Output from fnm list command
 * @returns Map of major version to full version (e.g., {'20' => '20.19.5'})
 */
export function buildMajorToFullVersionMap(stdout: string): Map<string, string> {
    const versions = stdout.trim().split('\n').filter(v => v.trim());
    const majorToFullVersion = new Map<string, string>();

    for (const version of versions) {
        // Match patterns like "v20.19.5" or "20.19.5"
        const match = /v?(\d+)\.([\d.]+)/.exec(version);
        if (match) {
            const majorVersion = match[1];
            const fullVersion = `${match[1]}.${match[2]}`;

            // Store the full version for this major version
            // Note: NodeVersionManager.list() returns clean version strings,
            // so we just use the first one found for each major version
            if (!majorToFullVersion.has(majorVersion)) {
                majorToFullVersion.set(majorVersion, fullVersion);
            }
        }
    }

    return majorToFullVersion;
}

/**
 * Validate a version family string
 * Only allows digits (e.g., "18", "20", "22")
 * @param versionFamily - Version family to validate
 * @returns true if valid, false otherwise
 */
export function isValidVersionFamily(versionFamily: string): boolean {
    return /^\d+$/.test(versionFamily);
}
