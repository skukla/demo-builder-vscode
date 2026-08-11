/**
 * Shared types for the app-builder feature
 *
 * Mirrors the mesh module's result shape (DataResult<T>) for consistency.
 */

import { DataResult } from '@/types/results';

/**
 * Result of an App Builder app deployment operation.
 *
 * - On success: data contains { appId?, url, deployedUrls? }
 * - On failure: error field contains the error message
 *
 * @example Success
 * { success: true, data: { url: 'https://...', deployedUrls: { 'web/app': 'https://...' } } }
 *
 * @example Failure
 * { success: false, error: 'App deployment failed' }
 */
export type AppDeploymentResult = DataResult<{
    appId?: string;
    url: string;
    deployedUrls?: Record<string, string>;
}>;
