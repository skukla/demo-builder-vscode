/**
 * Mesh Configuration Utilities
 *
 * Provides shared configuration readers for mesh operations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { MESH_COMPONENT_IDS } from '@/core/constants';

/**
 * Mesh component configuration structure
 */
interface MeshComponentConfig {
    configuration?: {
        nodeVersion?: string | number;
    };
}

/**
 * Component configuration structure for type safety
 */
interface ComponentsData {
    mesh?: Record<string, MeshComponentConfig>;
}

/**
 * Extract mesh component Node version from components data
 *
 * Checks any mesh component in the 'mesh' section since all mesh types
 * share the same Node version requirement.
 *
 * @param data - Parsed components.json data
 * @returns Node version or undefined
 */
function getMeshComponentNodeVersion(data: ComponentsData | null): string | number | undefined {
    if (!data?.mesh) return undefined;
    // Check known mesh component IDs for nodeVersion
    for (const meshId of MESH_COMPONENT_IDS) {
        const nodeVersion = data.mesh[meshId]?.configuration?.nodeVersion;
        if (nodeVersion !== undefined) return nodeVersion;
    }
    return undefined;
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
