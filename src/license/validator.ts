import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { LicenseKey } from '../types';

export class LicenseValidator {
    private static readonly LICENSE_KEY_STORAGE = 'demoBuilder.licenseKey';
    private static readonly ENCRYPTION_KEY = process.env.LICENSE_ENCRYPTION_KEY || 'demo-builder-2024-secret-key';
    
    private context: vscode.ExtensionContext;
    private validKeys: Map<string, LicenseKey>;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.validKeys = new Map();
        this.loadKeys();
    }

    private loadKeys(): void {
        // In production, these would be loaded from an encrypted file
        // For MVP, using hardcoded development keys
        const developmentKeys: LicenseKey[] = [
            {
                key: 'DEMO-2024-ALPHA1',
                email: 'alpha-tester@adobe.com',
                issued: '2024-01-01',
                expires: '2024-12-31',
                revoked: false,
                notes: 'Alpha testing key'
            },
            {
                key: 'DEMO-2024-BETA01',
                email: 'beta-tester@adobe.com',
                issued: '2024-01-15',
                expires: '2024-12-31',
                revoked: false,
                notes: 'Beta testing key'
            },
            {
                key: 'DEMO-2024-DEV001',
                email: 'developer@adobe.com',
                issued: '2024-01-01',
                revoked: false,
                notes: 'Development key - no expiration'
            }
        ];

        developmentKeys.forEach(key => {
            this.validKeys.set(key.key, key);
        });

        // In production, load from encrypted file
        // this.loadEncryptedKeys();
    }

    private async loadEncryptedKeys(): Promise<void> {
        try {
            // This would load from an encrypted file bundled with the extension
            const encryptedData = await this.readEncryptedFile();
            if (encryptedData) {
                const decrypted = this.decrypt(encryptedData);
                const keys = JSON.parse(decrypted) as { keys: Record<string, LicenseKey> };
                
                Object.entries(keys.keys).forEach(([key, data]) => {
                    this.validKeys.set(key, data);
                });
            }
        } catch (error) {
            console.error('Failed to load encrypted keys:', error);
        }
    }

    private async readEncryptedFile(): Promise<string | undefined> {
        // In production, read from bundled encrypted file
        // For now, return undefined to use development keys
        return undefined;
    }

    private encrypt(text: string): string {
        const cipher = crypto.createCipher('aes-256-cbc', LicenseValidator.ENCRYPTION_KEY);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    private decrypt(text: string): string {
        const decipher = crypto.createDecipher('aes-256-cbc', LicenseValidator.ENCRYPTION_KEY);
        let decrypted = decipher.update(text, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    public async checkLicense(): Promise<boolean> {
        try {
            const storedKey = await this.context.secrets.get(LicenseValidator.LICENSE_KEY_STORAGE);
            if (!storedKey) {
                return false;
            }

            return await this.validateLicense(storedKey);
        } catch (error) {
            console.error('Error checking license:', error);
            return false;
        }
    }

    public async validateLicense(key: string): Promise<boolean> {
        if (!key || typeof key !== 'string') {
            return false;
        }

        // Check format
        if (!key.match(/^DEMO-\d{4}-[A-Z0-9]{6}$/)) {
            return false;
        }

        // Check if key exists
        const licenseData = this.validKeys.get(key);
        if (!licenseData) {
            return false;
        }

        // Check if revoked
        if (licenseData.revoked) {
            vscode.window.showErrorMessage('This license key has been revoked.');
            return false;
        }

        // Check expiration
        if (licenseData.expires) {
            const expirationDate = new Date(licenseData.expires);
            const now = new Date();
            if (now > expirationDate) {
                vscode.window.showErrorMessage('This license key has expired.');
                return false;
            }
        }

        // Store validated key
        await this.context.secrets.store(LicenseValidator.LICENSE_KEY_STORAGE, key);

        // Log usage (in production, this would be sent to analytics)
        this.logUsage(key, licenseData);

        return true;
    }

    private logUsage(key: string, licenseData: LicenseKey): void {
        const usage = {
            key: key.substring(0, 10) + '...',
            email: licenseData.email,
            timestamp: new Date().toISOString(),
            version: this.context.extension.packageJSON.version
        };

        console.log('License usage:', usage);
        
        // In production, send to analytics service
        // this.sendAnalytics(usage);
    }

    public async revokeLicense(key: string): Promise<void> {
        const storedKey = await this.context.secrets.get(LicenseValidator.LICENSE_KEY_STORAGE);
        if (storedKey === key) {
            await this.context.secrets.delete(LicenseValidator.LICENSE_KEY_STORAGE);
            vscode.window.showWarningMessage('Your license has been revoked. Please contact support.');
        }
    }

    public async clearLicense(): Promise<void> {
        await this.context.secrets.delete(LicenseValidator.LICENSE_KEY_STORAGE);
    }

    public getLicenseInfo(key: string): LicenseKey | undefined {
        return this.validKeys.get(key);
    }

    public async getCurrentLicenseInfo(): Promise<LicenseKey | undefined> {
        const storedKey = await this.context.secrets.get(LicenseValidator.LICENSE_KEY_STORAGE);
        if (!storedKey) {
            return undefined;
        }
        return this.validKeys.get(storedKey);
    }
}