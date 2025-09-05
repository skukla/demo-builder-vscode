import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

/**
 * Execute a command with fnm environment initialized (Mac only)
 * This ensures Node.js installed via fnm is accessible
 */
export async function execWithFnm(command: string): Promise<{ stdout: string; stderr: string }> {
    // For Mac, use zsh and initialize fnm environment
    const fullCommand = `eval "$(fnm env)" && ${command}`;
    return execAsync(fullCommand, { 
        shell: '/bin/zsh',
        encoding: 'utf8'
    }) as Promise<{ stdout: string; stderr: string }>;
}

/**
 * Execute a command with enhanced PATH for finding tools like Adobe CLI
 * Adds common npm global locations to PATH
 */
export async function execWithEnhancedPath(command: string): Promise<{ stdout: string; stderr: string }> {
    const homeDir = os.homedir();
    const extraPaths = [
        path.join(homeDir, '.npm-global', 'bin'),
        path.join(homeDir, '.npm', 'bin'),
        '/usr/local/bin',
        '/opt/homebrew/bin'
    ].filter(p => fs.existsSync(p));

    const env = { ...process.env };
    if (extraPaths.length > 0) {
        env.PATH = `${extraPaths.join(':')}:${env.PATH || ''}`;
    }

    // Also try with fnm environment for npm-installed tools
    const fullCommand = `eval "$(fnm env)" 2>/dev/null; ${command}`;
    
    return execAsync(fullCommand, { 
        env,
        shell: '/bin/zsh',
        encoding: 'utf8'
    }) as Promise<{ stdout: string; stderr: string }>;
}

/**
 * Check if fnm is available on the system
 */
export async function isFnmAvailable(): Promise<boolean> {
    try {
        await execAsync('fnm --version', { 
            shell: '/bin/zsh',
            encoding: 'utf8'
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if a command exists in the system
 */
export async function commandExists(command: string): Promise<boolean> {
    try {
        // Try with fnm environment first for Node.js related commands
        if (command === 'node' || command === 'npm' || command === 'npx') {
            const { stdout } = await execWithFnm(`which ${command}`);
            return stdout.trim().length > 0;
        }
        
        // For other commands, use enhanced path
        const { stdout } = await execWithEnhancedPath(`which ${command}`);
        return stdout.trim().length > 0;
    } catch {
        return false;
    }
}