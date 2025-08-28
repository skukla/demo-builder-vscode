import * as net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProcessInfo } from '../types';
import { Logger } from './logger';

const execAsync = promisify(exec);

export class ProcessManager {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    public async isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.once('error', () => {
                resolve(false);
            });
            
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            
            server.listen(port);
        });
    }

    public async findProcessByPort(port: number): Promise<number | undefined> {
        try {
            // On macOS/Linux
            const { stdout } = await execAsync(`lsof -i :${port} -t`);
            const pid = parseInt(stdout.trim());
            return isNaN(pid) ? undefined : pid;
        } catch {
            // No process found on port
            return undefined;
        }
    }

    public async killProcess(pid: number): Promise<boolean> {
        try {
            process.kill(pid, 'SIGTERM');
            this.logger.info(`Killed process ${pid}`);
            return true;
        } catch (error) {
            this.logger.warn(`Failed to kill process ${pid}: ${error}`);
            return false;
        }
    }

    public async isProcessRunning(pid: number): Promise<boolean> {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    public createProcessInfo(pid: number, port: number, command: string): ProcessInfo {
        return {
            pid,
            port,
            startTime: new Date(),
            command,
            status: 'running'
        };
    }
}