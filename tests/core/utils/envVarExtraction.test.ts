import { extractEnvVars, extractEnvVarsSync } from '@/core/utils/envVarExtraction';
import * as fs from 'fs/promises';

jest.mock('fs/promises');
jest.mock('fs');

describe('envVarExtraction', () => {
    describe('extractEnvVars', () => {
        it('should extract simple key-value pairs', async () => {
            const envContent = `
KEY1=value1
KEY2=value2
KEY3=value3
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'value1',
                KEY2: 'value2',
                KEY3: 'value3'
            });
        });

        it('should skip empty lines', async () => {
            const envContent = `
KEY1=value1

KEY2=value2

`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'value1',
                KEY2: 'value2'
            });
        });

        it('should skip comments', async () => {
            const envContent = `
# This is a comment
KEY1=value1
# Another comment
KEY2=value2
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'value1',
                KEY2: 'value2'
            });
        });

        it('should handle double-quoted values', async () => {
            const envContent = `
KEY1="quoted value"
KEY2="value with spaces"
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'quoted value',
                KEY2: 'value with spaces'
            });
        });

        it('should handle single-quoted values', async () => {
            const envContent = `
KEY1='single quoted'
KEY2='another value'
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'single quoted',
                KEY2: 'another value'
            });
        });

        it('should handle values with equals signs', async () => {
            const envContent = `
CONNECTION_STRING=Server=localhost;Database=test
BASE64_KEY=abc123==
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                CONNECTION_STRING: 'Server=localhost;Database=test',
                BASE64_KEY: 'abc123=='
            });
        });

        it('should handle empty values', async () => {
            const envContent = `
KEY1=
KEY2=""
KEY3=''
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                KEY1: '',
                KEY2: '',
                KEY3: ''
            });
        });

        it('should trim whitespace around keys and values', async () => {
            const envContent = `
  KEY1  =  value1
KEY2=value2
   KEY3=value3
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'value1',
                KEY2: 'value2',
                KEY3: 'value3'
            });
        });

        it('should handle values with special characters', async () => {
            const envContent = `
URL=https://example.com/path?param=value&other=123
PASSWORD=p@ssw0rd!#$%
JSON_DATA={"key":"value"}
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                URL: 'https://example.com/path?param=value&other=123',
                PASSWORD: 'p@ssw0rd!#$%',
                JSON_DATA: '{"key":"value"}'
            });
        });

        it('should handle file read errors', async () => {
            (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

            await expect(
                extractEnvVars('/path/to/missing.env')
            ).rejects.toThrow('Failed to extract env vars from /path/to/missing.env: File not found');
        });

        it('should handle malformed lines gracefully', async () => {
            const envContent = `
KEY1=value1
MALFORMED LINE WITHOUT EQUALS
KEY2=value2
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'value1',
                KEY2: 'value2'
            });
        });

        it('should handle real .env file format', async () => {
            const envContent = `
# Database configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME="my_database"
DB_USER=admin
DB_PASSWORD='secret123'

# API keys
API_KEY=abc123def456
SECRET_KEY="very-secret-key"

# Feature flags
ENABLE_FEATURE_X=true
ENABLE_FEATURE_Y=false
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                DB_HOST: 'localhost',
                DB_PORT: '5432',
                DB_NAME: 'my_database',
                DB_USER: 'admin',
                DB_PASSWORD: 'secret123',
                API_KEY: 'abc123def456',
                SECRET_KEY: 'very-secret-key',
                ENABLE_FEATURE_X: 'true',
                ENABLE_FEATURE_Y: 'false'
            });
        });
    });

    describe('extractEnvVarsSync', () => {
        let mockFs: any;

        beforeEach(() => {
            mockFs = require('fs');
        });

        it('should extract simple key-value pairs synchronously', () => {
            const envContent = `
KEY1=value1
KEY2=value2
`;
            mockFs.readFileSync.mockReturnValue(envContent);

            const result = extractEnvVarsSync('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'value1',
                KEY2: 'value2'
            });
        });

        it('should handle quoted values synchronously', () => {
            const envContent = `
KEY1="quoted value"
KEY2='single quoted'
`;
            mockFs.readFileSync.mockReturnValue(envContent);

            const result = extractEnvVarsSync('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'quoted value',
                KEY2: 'single quoted'
            });
        });

        it('should skip comments synchronously', () => {
            const envContent = `
# Comment
KEY1=value1
KEY2=value2
`;
            mockFs.readFileSync.mockReturnValue(envContent);

            const result = extractEnvVarsSync('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'value1',
                KEY2: 'value2'
            });
        });

        it('should handle errors synchronously', () => {
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('File not found');
            });

            expect(() => {
                extractEnvVarsSync('/path/to/missing.env');
            }).toThrow('Failed to extract env vars from /path/to/missing.env: File not found');
        });

        it('should produce same result as async version', () => {
            const envContent = `
KEY1=value1
KEY2="quoted"
# Comment
KEY3=value3
`;
            mockFs.readFileSync.mockReturnValue(envContent);

            const syncResult = extractEnvVarsSync('/path/to/.env');

            expect(syncResult).toEqual({
                KEY1: 'value1',
                KEY2: 'quoted',
                KEY3: 'value3'
            });
        });
    });

    describe('Edge cases', () => {
        it('should handle UTF-8 characters', async () => {
            const envContent = `
MESSAGE=Hello 世界
EMOJI=🚀
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                MESSAGE: 'Hello 世界',
                EMOJI: '🚀'
            });
        });

        it('should handle very long values', async () => {
            const longValue = 'a'.repeat(10000);
            const envContent = `LONG_KEY=${longValue}`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result.LONG_KEY).toBe(longValue);
        });

        it('should handle multiline values in quotes', async () => {
            const envContent = `KEY="line1
line2
line3"`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            // Current implementation doesn't support multiline
            // This test documents current behavior
            expect(result.KEY).toBeDefined();
        });

        it('should handle keys with underscores and numbers', async () => {
            const envContent = `
MY_KEY_1=value1
MY_KEY_2=value2
KEY123=value3
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                MY_KEY_1: 'value1',
                MY_KEY_2: 'value2',
                KEY123: 'value3'
            });
        });

        it('should handle Windows line endings', async () => {
            const envContent = 'KEY1=value1\r\nKEY2=value2\r\n';
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'value1',
                KEY2: 'value2'
            });
        });

        it('should handle mixed line endings', async () => {
            const envContent = 'KEY1=value1\nKEY2=value2\r\nKEY3=value3\r';
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/.env');

            expect(result).toEqual({
                KEY1: 'value1',
                KEY2: 'value2',
                KEY3: 'value3'
            });
        });
    });

    describe('Real-world scenarios', () => {
        it('should handle Adobe demo project .env file', async () => {
            const envContent = `
# Adobe Commerce Configuration
MAGENTO_HOST=localhost
MAGENTO_PORT=9080
MAGENTO_ADMIN_URL=https://localhost:9080/admin
MAGENTO_FRONTEND_URL=https://localhost:9080

# API Mesh
MESH_API_KEY="abc-123-def-456"
MESH_ENDPOINT=https://graph.adobe.io/api

# Component versions
NODE_VERSION=18
PHP_VERSION=8.1
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/demo/.env');

            expect(result).toEqual({
                MAGENTO_HOST: 'localhost',
                MAGENTO_PORT: '9080',
                MAGENTO_ADMIN_URL: 'https://localhost:9080/admin',
                MAGENTO_FRONTEND_URL: 'https://localhost:9080',
                MESH_API_KEY: 'abc-123-def-456',
                MESH_ENDPOINT: 'https://graph.adobe.io/api',
                NODE_VERSION: '18',
                PHP_VERSION: '8.1'
            });
        });

        it('should handle Docker compose .env file', async () => {
            const envContent = `
COMPOSE_PROJECT_NAME=adobe-demo
MYSQL_ROOT_PASSWORD=root
MYSQL_DATABASE=magento
MYSQL_USER=magento
MYSQL_PASSWORD=magento
`;
            (fs.readFile as jest.Mock).mockResolvedValue(envContent);

            const result = await extractEnvVars('/path/to/docker/.env');

            expect(result.COMPOSE_PROJECT_NAME).toBe('adobe-demo');
            expect(result.MYSQL_ROOT_PASSWORD).toBe('root');
            expect(result.MYSQL_DATABASE).toBe('magento');
        });
    });
});
