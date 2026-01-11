/**
 * Mesh Configuration Utilities
 *
 * Provides shared configuration readers for mesh operations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { COMPONENT_IDS } from '@/core/constants';

/**
 * Component configuration structure for type safety
 */
interface ComponentsData {
    components?: {
        'commerce-mesh'?: {
            configuration?: {
                nodeVersion?: string | number;
            };
        };
    };
}

/**
 * Extract mesh component Node version from components data
 *
 * Extracts the deep optional chain: componentsData?.components?.['commerce-mesh']?.configuration?.nodeVersion
 * Returns undefined if any level is missing.
 *
 * @param data - Parsed components.json data
 * @returns Node version or undefined
 */
function getMeshComponentNodeVersion(data: ComponentsData | null): string | number | undefined {
    return data?.components?.[COMPONENT_IDS.COMMERCE_MESH]?.configuration?.nodeVersion;
}

/**
 * Get the Node version required for mesh operations
 *
 * Reads from commerce-mesh component configuration in components.json.
 * This ensures all mesh-related commands use the same Node version
 * as defined in the component's requirements.
 *
 * @returns Node version string (e.g., "20") or fallback default "20"
 *
 * @example
 * ```typescript
 * const result = await commandManager.execute('aio api-mesh:describe', {
 *     useNodeVersion: getMeshNodeVersion(),
 *     // ...
 * });
 * ```
 */
export function getMeshNodeVersion(): string {
    try {
        const extension = vscode.extensions.getExtension('adobe-demo-team.adobe-demo-builder');
        if (!extension) {
            return '20'; // Fallback to known default
        }

        const componentsPath = path.join(extension.extensionPath, 'src', 'features', 'components', 'config', 'components.json');
        if (!fs.existsSync(componentsPath)) {
            return '20'; // Fallback to known default
        }

        const componentsData: ComponentsData = JSON.parse(fs.readFileSync(componentsPath, 'utf8'));
        const meshNodeVersion = getMeshComponentNodeVersion(componentsData);

        return meshNodeVersion ? String(meshNodeVersion) : '20'; // Fallback to known default
    } catch {
        return '20'; // Fallback to known default
    }
}
