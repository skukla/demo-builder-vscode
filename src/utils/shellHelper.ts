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
 * Find all possible npm global binary paths
 */
function findNpmGlobalPaths(): string[] {
    const paths: string[] = [];
    const homeDir = os.homedir();
    
    // Check fnm paths - where fnm installs global npm packages
    const fnmBase = path.join(homeDir, '.local/share/fnm/node-versions');
    if (fs.existsSync(fnmBase)) {
        try {
            const versions = fs.readdirSync(fnmBase);
            for (const version of versions) {
                const binPath = path.join(fnmBase, version, 'installation/bin');
                if (fs.existsSync(binPath)) {
                    paths.push(binPath);
                }
                // Also check lib directory for npm global installs
                const libBinPath = path.join(fnmBase, version, 'installation/lib/node_modules/.bin');
                if (fs.existsSync(libBinPath)) {
                    paths.push(libBinPath);
                }
            }
        } catch (e) {
            // Ignore errors reading directory
        }
    }
    
    // Check nvm paths
    const nvmBase = path.join(homeDir, '.nvm/versions/node');
    if (fs.existsSync(nvmBase)) {
        try {
            const versions = fs.readdirSync(nvmBase);
            for (const version of versions) {
                const binPath = path.join(nvmBase, version, 'bin');
                if (fs.existsSync(binPath)) {
                    paths.push(binPath);
                }
            }
        } catch (e) {
            // Ignore errors reading directory
        }
    }
    
    // Check common npm global locations
    const commonPaths = [
        path.join(homeDir, '.npm-global', 'bin'),
        path.join(homeDir, '.npm', 'bin'),
        '/usr/local/lib/node_modules/.bin',
        '/usr/local/bin',
        '/opt/homebrew/bin'
    ];
    
    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            paths.push(p);
        }
    }
    
    return paths;
}

/**
 * Execute a command with enhanced PATH for finding tools like Adobe CLI
 * Adds common npm global locations to PATH
 */
export async function execWithEnhancedPath(command: string): Promise<{ stdout: string; stderr: string }> {
    // Find all possible npm global paths
    const extraPaths = findNpmGlobalPaths();
    
    // Build enhanced environment
    const env = { ...process.env };
    if (extraPaths.length > 0) {
        // Add discovered paths to the beginning of PATH
        env.PATH = `${extraPaths.join(':')}:${env.PATH || ''}`;
    }

    // Try with fnm environment if available, but don't suppress errors for debugging
    let fullCommand = command;
    const fnmAvailable = await isFnmAvailable();
    
    if (fnmAvailable) {
        // Use fnm env but capture any errors for debugging
        fullCommand = `eval "$(fnm env)" && ${command}`;
    }
    
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

/**
 * Find Adobe CLI in the system and return its path
 */
export async function findAdobeCLI(): Promise<string | null> {
    try {
        // First try with enhanced PATH
        const { stdout } = await execWithEnhancedPath('which aio');
        const aioPath = stdout.trim();
        if (aioPath) {
            return aioPath;
        }
    } catch {
        // Continue searching
    }
    
    // Search in all npm global paths directly
    const paths = findNpmGlobalPaths();
    for (const dir of paths) {
        const aioPath = path.join(dir, 'aio');
        if (fs.existsSync(aioPath)) {
            try {
                // Verify it's executable
                fs.accessSync(aioPath, fs.constants.X_OK);
                return aioPath;
            } catch {
                // Not executable, continue searching
            }
        }
    }
    
    return null;
}

/**
 * Get diagnostic information about the PATH and tool locations
 */
export async function getPathDiagnostics(): Promise<{
    fnmAvailable: boolean;
    npmGlobalPaths: string[];
    currentPATH: string;
    adobeCLIPath: string | null;
}> {
    const fnmAvailable = await isFnmAvailable();
    const npmGlobalPaths = findNpmGlobalPaths();
    const currentPATH = process.env.PATH || '';
    const adobeCLIPath = await findAdobeCLI();
    
    return {
        fnmAvailable,
        npmGlobalPaths,
        currentPATH,
        adobeCLIPath
    };
}