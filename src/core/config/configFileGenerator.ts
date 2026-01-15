/**
 * Shared Config File Generation Utilities
 * 
 * Provides reusable patterns for generating and updating JSON configuration files
 * with template support and placeholder replacement.
 * 
 * Used by:
 * - EDS site.json generation
 * - Future component-specific config files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Logger } from '@/types/logger';

/**
 * Options for generating a configuration file
 */
export interface ConfigFileOptions {
    /** Full path where config file should be written */
    filePath: string;
    /** Optional path to template file to use as base */
    templatePath?: string;
    /** Default configuration if template not found */
    defaultConfig: Record<string, unknown>;
    /** Placeholder replacements (e.g., {ENDPOINT} -> actual value) */
    placeholders: Record<string, string>;
    /** Logger for operation tracking */
    logger: Logger;
    /** Optional description for logging */
    description?: string;
}

/**
 * Generate a JSON configuration file with template and placeholder support
 * 
 * Workflow:
 * 1. Try to load template file (if templatePath provided)
 * 2. Fall back to defaultConfig if template not found
 * 3. Replace all placeholders in the JSON structure
 * 4. Write final config to filePath
 * 
 * @example
 * ```typescript
 * await generateConfigFile({
 *   filePath: '/path/to/site.json',
 *   templatePath: '/path/to/default-site.json',
 *   defaultConfig: { 'commerce-core-endpoint': '' },
 *   placeholders: { '{ENDPOINT}': 'https://...', '{ORG}': 'my-org' },
 *   logger,
 *   description: 'EDS runtime configuration'
 * });
 * ```
 */
export async function generateConfigFile(options: ConfigFileOptions): Promise<void> {
    const { filePath, templatePath, defaultConfig, placeholders, logger, description } = options;
    
    const fileDesc = description || 'configuration file';
    logger.debug(`[Config Generator] Generating ${fileDesc} at: ${filePath}`);
    
    // Step 1: Load base configuration
    let baseConfig: Record<string, unknown>;
    
    if (templatePath) {
        try {
            const templateContent = await fs.readFile(templatePath, 'utf-8');
            baseConfig = JSON.parse(templateContent);
            logger.debug(`[Config Generator] Loaded template from: ${templatePath}`);
        } catch (error) {
            logger.debug(`[Config Generator] Template not found, using default config`);
            baseConfig = { ...defaultConfig };
        }
    } else {
        baseConfig = { ...defaultConfig };
    }
    
    // Step 2: Replace placeholders
    const configStr = JSON.stringify(baseConfig, null, 2);
    let processedConfig = configStr;
    
    for (const [placeholder, value] of Object.entries(placeholders)) {
        const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        processedConfig = processedConfig.replace(regex, value);
    }
    
    // Step 3: Parse and validate
    const finalConfig = JSON.parse(processedConfig);
    
    // Step 4: Set default values for any remaining empty/placeholder fields
    for (const [key, value] of Object.entries(finalConfig)) {
        if (typeof value === 'string' && (value === '' || value.includes('{'))) {
            if (defaultConfig[key] !== undefined) {
                finalConfig[key] = defaultConfig[key];
            }
        }
    }
    
    // Step 5: Ensure directory exists and write file
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(finalConfig, null, 2), 'utf-8');
        logger.debug(`[Config Generator] Generated ${fileDesc}`);
        
        // Log key fields for debugging
        const keysToLog = Object.keys(placeholders).length > 0 ? Object.keys(placeholders) : Object.keys(finalConfig).slice(0, 3);
        for (const placeholder of keysToLog) {
            const key = placeholder.replace(/[{}]/g, '').toLowerCase().replace(/_/g, '-');
            if (finalConfig[key] !== undefined) {
                logger.debug(`[Config Generator]   ${key}: ${finalConfig[key]}`);
            }
        }
    } catch (error) {
        throw new Error(`Failed to write ${fileDesc}: ${(error as Error).message}`);
    }
}

/**
 * Update an existing JSON configuration file with new values
 * 
 * Workflow:
 * 1. Check if file exists
 * 2. If not, create with updates as the full config
 * 3. If exists, read, merge updates, and write back
 * 
 * @param filePath - Path to the config file
 * @param updates - Key-value pairs to update
 * @param logger - Logger for operation tracking
 * @param description - Optional description for logging
 * 
 * @example
 * ```typescript
 * await updateConfigFile(
 *   '/path/to/site.json',
 *   { 'commerce-core-endpoint': 'https://new-endpoint.com' },
 *   logger,
 *   'EDS runtime config'
 * );
 * ```
 */
export async function updateConfigFile(
    filePath: string,
    updates: Record<string, unknown>,
    logger: Logger,
    description?: string,
): Promise<void> {
    const fileDesc = description || 'configuration file';
    logger.debug(`[Config Generator] Updating ${fileDesc} at: ${filePath}`);
    
    try {
        // Check if file exists
        let existingConfig: Record<string, unknown>;
        
        try {
            await fs.access(filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            existingConfig = JSON.parse(content);
            logger.debug(`[Config Generator] Loaded existing ${fileDesc}`);
        } catch {
            // File doesn't exist - create it with updates
            logger.debug(`[Config Generator] File not found, creating with updates`);
            existingConfig = {};
        }
        
        // Merge updates
        const updatedConfig = { ...existingConfig, ...updates };

        // Ensure directory exists and write back
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(updatedConfig, null, 2), 'utf-8');
        logger.debug(`[Config Generator] Updated ${fileDesc}`);
        
        // Log updated fields
        for (const [key, value] of Object.entries(updates)) {
            logger.debug(`[Config Generator]   ${key}: ${value}`);
        }
    } catch (error) {
        logger.warn(`[Config Generator] Failed to update ${fileDesc}: ${(error as Error).message}`);
        // Don't throw - updates should be non-blocking
    }
}

/**
 * Read a JSON configuration file
 * 
 * @param filePath - Path to the config file
 * @param logger - Logger for operation tracking
 * @returns Parsed configuration object, or null if file doesn't exist
 */
export async function readConfigFile(
    filePath: string,
    logger: Logger,
): Promise<Record<string, unknown> | null> {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        logger.debug(`[Config Generator] Failed to read ${filePath}: ${(error as Error).message}`);
        return null;
    }
}
