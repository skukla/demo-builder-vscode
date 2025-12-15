/**
 * Predicate functions for ApiMeshStep (SOP §10 compliance)
 *
 * Extracts long validation chains to named functions for improved readability.
 */

import type { MeshData } from '../hooks/useMeshOperations';

/**
 * Check if mesh data is ready to display (SOP §10 compliance)
 *
 * Mesh data is ready when:
 * - Not currently checking
 * - No error occurred
 * - Mesh data exists
 */
export function isMeshDataReady(
    isChecking: boolean,
    error: string | null | undefined,
    meshData: MeshData | null
): boolean {
    if (isChecking) return false;
    if (error) return false;
    if (!meshData) return false;
    return true;
}

/**
 * Check if ready for mesh creation (SOP §10 compliance)
 *
 * Ready for creation when:
 * - Not currently checking
 * - No error occurred
 * - No existing mesh data (so we can create new)
 */
export function isReadyForMeshCreation(
    isChecking: boolean,
    error: string | null | undefined,
    meshData: MeshData | null
): boolean {
    if (isChecking) return false;
    if (error) return false;
    if (meshData) return false;
    return true;
}
