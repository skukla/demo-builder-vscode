/**
 * Configuration Loader
 *
 * Simple utility for loading and parsing JSON configuration files.
 * Created to support prerequisite refactoring work.
 */

import * as fs from 'fs';
import { sanitizeErrorForLogging } from '@/core/validation/securityValidation';

export interface LoadOptions {
    validationErrorMessage?: string;
}

/**
 * Generic configuration file loader
 */
export class ConfigurationLoader<T> {
    constructor(private configPath: string) {}

    async load(options: LoadOptions = {}): Promise<T> {
        try {
            const content = fs.readFileSync(this.configPath, 'utf-8');
            return JSON.parse(content) as T;
        } catch (error) {
            const message = options.validationErrorMessage || 'Failed to load configuration';
            const sanitizedError = sanitizeErrorForLogging((error as Error).message);
            throw new Error(`${message}: ${sanitizedError}`);
        }
    }
}
