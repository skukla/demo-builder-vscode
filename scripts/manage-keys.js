#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYS_FILE = path.join(__dirname, 'keys.json');
const ENCRYPTED_FILE = path.join(__dirname, '..', 'src', 'license', 'keys.enc');
const ENCRYPTION_KEY = process.env.LICENSE_ENCRYPTION_KEY || 'demo-builder-2024-secret-key';

class KeyManager {
    constructor() {
        this.loadKeys();
    }

    loadKeys() {
        if (fs.existsSync(KEYS_FILE)) {
            const data = fs.readFileSync(KEYS_FILE, 'utf8');
            this.data = JSON.parse(data);
        } else {
            this.data = {
                keys: {},
                metadata: {
                    version: 1,
                    updated: new Date().toISOString()
                }
            };
        }
    }

    saveKeys() {
        this.data.metadata.updated = new Date().toISOString();
        fs.writeFileSync(KEYS_FILE, JSON.stringify(this.data, null, 2));
        console.log(`Keys saved to ${KEYS_FILE}`);
    }

    generateKey() {
        const year = new Date().getFullYear();
        const random = crypto.randomBytes(3).toString('hex').toUpperCase();
        return `DEMO-${year}-${random}`;
    }

    addKey(email, options = {}) {
        const key = this.generateKey();
        
        this.data.keys[key] = {
            key,
            email,
            issued: new Date().toISOString(),
            expires: options.expires || null,
            revoked: false,
            notes: options.notes || ''
        };

        this.saveKeys();
        console.log(`\nKey generated: ${key}`);
        console.log(`Email: ${email}`);
        if (options.expires) {
            console.log(`Expires: ${options.expires}`);
        }
        
        return key;
    }

    revokeKey(key) {
        if (!this.data.keys[key]) {
            console.error(`Key not found: ${key}`);
            return false;
        }

        this.data.keys[key].revoked = true;
        this.data.keys[key].revokedDate = new Date().toISOString();
        
        this.saveKeys();
        console.log(`Key revoked: ${key}`);
        return true;
    }

    listKeys(showRevoked = false) {
        const keys = Object.values(this.data.keys);
        const filtered = showRevoked ? keys : keys.filter(k => !k.revoked);
        
        if (filtered.length === 0) {
            console.log('No keys found');
            return;
        }

        console.log('\nLicense Keys:');
        console.log('='.repeat(80));
        
        filtered.forEach(key => {
            console.log(`\nKey: ${key.key}`);
            console.log(`Email: ${key.email || 'N/A'}`);
            console.log(`Issued: ${key.issued}`);
            console.log(`Expires: ${key.expires || 'Never'}`);
            console.log(`Status: ${key.revoked ? 'REVOKED' : 'ACTIVE'}`);
            if (key.notes) {
                console.log(`Notes: ${key.notes}`);
            }
        });
        
        console.log('\n' + '='.repeat(80));
        console.log(`Total: ${filtered.length} keys`);
    }

    encrypt(text) {
        const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    buildEncryptedFile() {
        const encrypted = this.encrypt(JSON.stringify(this.data));
        fs.writeFileSync(ENCRYPTED_FILE, encrypted);
        console.log(`\nEncrypted keys written to: ${ENCRYPTED_FILE}`);
        console.log('This file will be bundled with the extension');
    }

    checkExpired() {
        const now = new Date();
        const expired = [];
        
        Object.values(this.data.keys).forEach(key => {
            if (key.expires && !key.revoked) {
                const expiryDate = new Date(key.expires);
                if (now > expiryDate) {
                    expired.push(key);
                }
            }
        });

        if (expired.length > 0) {
            console.log('\nExpired keys:');
            expired.forEach(key => {
                console.log(`  - ${key.key} (expired: ${key.expires})`);
            });
        } else {
            console.log('No expired keys found');
        }
        
        return expired;
    }

    importKeys(filePath) {
        if (!fs.existsSync(filePath)) {
            console.error(`File not found: ${filePath}`);
            return;
        }

        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let imported = 0;
        
        if (data.keys) {
            Object.entries(data.keys).forEach(([key, value]) => {
                if (!this.data.keys[key]) {
                    this.data.keys[key] = value;
                    imported++;
                }
            });
        }

        this.saveKeys();
        console.log(`Imported ${imported} keys`);
    }

    exportKeys(filePath) {
        fs.writeFileSync(filePath, JSON.stringify(this.data, null, 2));
        console.log(`Exported keys to: ${filePath}`);
    }

    validateKey(key) {
        const keyData = this.data.keys[key];
        if (!keyData) {
            console.log(`Key not found: ${key}`);
            return false;
        }

        console.log(`\nValidating key: ${key}`);
        console.log(`Status: ${keyData.revoked ? 'REVOKED' : 'ACTIVE'}`);
        
        if (keyData.expires) {
            const now = new Date();
            const expiryDate = new Date(keyData.expires);
            if (now > expiryDate) {
                console.log(`Expired: YES (${keyData.expires})`);
                return false;
            } else {
                console.log(`Expires: ${keyData.expires}`);
            }
        } else {
            console.log('Expires: Never');
        }

        console.log('Valid: YES');
        return true;
    }
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0];
const manager = new KeyManager();

switch (command) {
    case 'add':
        if (!args[1]) {
            console.error('Usage: npm run manage-keys add <email> [--expires YYYY-MM-DD] [--notes "text"]');
            process.exit(1);
        }
        const email = args[1];
        const options = {};
        
        const expiresIndex = args.indexOf('--expires');
        if (expiresIndex !== -1 && args[expiresIndex + 1]) {
            options.expires = args[expiresIndex + 1];
        }
        
        const notesIndex = args.indexOf('--notes');
        if (notesIndex !== -1 && args[notesIndex + 1]) {
            options.notes = args[notesIndex + 1];
        }
        
        manager.addKey(email, options);
        break;

    case 'revoke':
        if (!args[1]) {
            console.error('Usage: npm run manage-keys revoke <key>');
            process.exit(1);
        }
        manager.revokeKey(args[1]);
        break;

    case 'list':
        const showRevoked = args.includes('--all');
        manager.listKeys(showRevoked);
        break;

    case 'build':
    case 'encrypt':
        manager.buildEncryptedFile();
        break;

    case 'validate':
        if (!args[1]) {
            console.error('Usage: npm run manage-keys validate <key>');
            process.exit(1);
        }
        manager.validateKey(args[1]);
        break;

    case 'expired':
        manager.checkExpired();
        break;

    case 'import':
        if (!args[1]) {
            console.error('Usage: npm run manage-keys import <file>');
            process.exit(1);
        }
        manager.importKeys(args[1]);
        break;

    case 'export':
        if (!args[1]) {
            console.error('Usage: npm run manage-keys export <file>');
            process.exit(1);
        }
        manager.exportKeys(args[1]);
        break;

    default:
        console.log(`
Demo Builder License Key Manager

Commands:
  add <email> [options]     Add a new license key
    --expires YYYY-MM-DD    Set expiration date
    --notes "text"          Add notes

  revoke <key>              Revoke a license key
  list [--all]              List keys (--all includes revoked)
  validate <key>            Validate a specific key
  expired                   Check for expired keys
  build                     Build encrypted keys file
  import <file>             Import keys from JSON file
  export <file>             Export keys to JSON file

Examples:
  npm run manage-keys add user@adobe.com --expires 2024-12-31
  npm run manage-keys revoke DEMO-2024-ABC123
  npm run manage-keys list
  npm run manage-keys build
        `);
        break;
}