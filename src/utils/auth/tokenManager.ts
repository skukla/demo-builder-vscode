import type { CommandExecutor } from '../commands';
import { getLogger } from '../../shared/logging';
import { validateAccessToken } from '../securityValidation';
import { TIMEOUTS } from '../timeoutConfig';
import type { AuthToken } from './types';

/**
 * Manages Adobe access tokens
 * Handles token storage, retrieval, and expiry checking
 */
export class TokenManager {
    private logger = getLogger();

    constructor(private commandManager: CommandExecutor) {}

    /**
     * Clean CLI output by removing fnm messages
     */
    private cleanCommandOutput(output: string): string {
        return output.trim().split('\n')
            .filter(line =>
                !line.startsWith('Using Node') &&
                !line.includes('fnm') &&
                line.trim().length > 0,
            )
            .join('\n').trim();
    }

    /**
     * Get current access token
     */
    async getAccessToken(): Promise<string | undefined> {
        try {
            const result = await this.commandManager.executeAdobeCLI(
                'aio config get ims.contexts.cli.access_token.token',
                { encoding: 'utf8', timeout: TIMEOUTS.TOKEN_READ },
            );

            if (result.code !== 0) {
                return undefined;
            }

            const cleanOutput = this.cleanCommandOutput(result.stdout || '');

            // SECURITY: Generic token validation without disclosing format
            // Adobe access tokens are typically 100+ characters
            if (typeof cleanOutput === 'string' && cleanOutput.length > 100) {
                return cleanOutput;
            }

            return undefined;
        } catch (error) {
            this.logger.error('[Token] Failed to get access token', error as Error);
            return undefined;
        }
    }

    /**
     * Get token expiry timestamp
     */
    async getTokenExpiry(): Promise<number | undefined> {
        try {
            const result = await this.commandManager.executeAdobeCLI(
                'aio config get ims.contexts.cli.access_token.expiry',
                { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_READ },
            );

            if (result.code !== 0 || !result.stdout) {
                return undefined;
            }

            const expiryOutput = this.cleanCommandOutput(result.stdout);
            const expiry = parseInt(expiryOutput);
            return isNaN(expiry) ? undefined : expiry;
        } catch (error) {
            this.logger.error('[Token] Failed to get token expiry', error as Error);
            return undefined;
        }
    }

    /**
     * Check if token is valid and not expired
     */
    async isTokenValid(): Promise<boolean> {
        const token = await this.getAccessToken();
        if (!token) {
            this.logger.debug('[Token] No access token found');
            return false;
        }

        const expiry = await this.getTokenExpiry();
        if (!expiry) {
            // No expiry info, but we have a token - assume valid
            this.logger.debug('[Token] Token found but no expiry info - assuming valid');
            return true;
        }

        const now = Date.now();
        const isValid = expiry > now;

        if (isValid) {
            const minutesRemaining = Math.floor((expiry - now) / 1000 / 60);
            this.logger.debug(`[Token] Token valid (expires in ${minutesRemaining} minutes)`);
        } else {
            const minutesAgo = Math.floor((now - expiry) / 1000 / 60);
            this.logger.debug(`[Token] Token expired ${minutesAgo} minutes ago`);
        }

        return isValid;
    }

    /**
     * Store access token
     */
    async storeAccessToken(token: string): Promise<boolean> {
        try {
            // SECURITY: Validate token to prevent command injection
            validateAccessToken(token);

            // Calculate expiry (2 hours from now, typical for Adobe tokens)
            const expiry = Date.now() + (2 * 60 * 60 * 1000);

            this.logger.debug('[Token] Storing token and expiry in config...');

            // Run both config operations in parallel
            const [tokenResult, expiryResult] = await Promise.all([
                this.commandManager.executeAdobeCLI(
                    `aio config set ims.contexts.cli.access_token.token "${token}"`,
                    { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_WRITE },
                ),
                this.commandManager.executeAdobeCLI(
                    `aio config set ims.contexts.cli.access_token.expiry ${expiry}`,
                    { encoding: 'utf8', timeout: TIMEOUTS.CONFIG_WRITE },
                ),
            ]);

            // Check if both operations succeeded
            if (tokenResult.code === 0 && expiryResult.code === 0) {
                this.logger.debug('[Token] Token stored successfully');
                return true;
            }

            this.logger.warn('[Token] Config storage returned non-zero exit code');
            return false;
        } catch (error) {
            this.logger.error('[Token] Failed to store token', error as Error);
            return false;
        }
    }

    /**
     * Clear stored token
     */
    async clearToken(): Promise<void> {
        try {
            await Promise.all([
                this.commandManager.executeAdobeCLI(
                    'aio config delete ims.contexts.cli.access_token.token',
                    { encoding: 'utf8' },
                ),
                this.commandManager.executeAdobeCLI(
                    'aio config delete ims.contexts.cli.access_token.expiry',
                    { encoding: 'utf8' },
                ),
            ]);

            this.logger.debug('[Token] Token cleared successfully');
        } catch (error) {
            this.logger.error('[Token] Failed to clear token', error as Error);
        }
    }
}
