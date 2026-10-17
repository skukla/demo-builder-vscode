/**
 * The canary update as a command, for CI: `node dist/canary-update.js`.
 *
 * Built by `npm run build:canary-update`. Reads its inputs from the environment,
 * runs the extension's own template update on the canary storefront
 * (`canaryUpdate.ts`), prints the result as JSON, and exits 0 only when the update
 * succeeded (including "nothing to update"). On success the version to record is
 * printed and, under GitHub Actions, written to the step output `synced`.
 *
 * Environment:
 *   CANARY_GITHUB_TOKEN   token that may push to the canary repository (never printed)
 *   CANARY_REPO           owner/name of the canary repository
 *   CANARY_PACKAGE        demo package id (e.g. starter)
 *   CANARY_STACK          stack id (e.g. eds-accs)
 *   CANARY_DALIVE_ORG     DA.live org of the canary site
 *   CANARY_DALIVE_SITE    DA.live site of the canary
 *   CANARY_LAST_SYNCED    the template commit the canary last matched
 *
 * @module features/updates/canary/canaryUpdateCli
 */

import { exec } from 'child_process';
import { appendFileSync } from 'fs';
import type * as vscode from 'vscode';
import { runCanaryUpdate, type CanaryInputs } from './canaryUpdate';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import { GitHubTokenService } from '@/features/eds/services/github/githubTokenService';
import type { GitHubToken } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
}

/** One line to the job log. */
function say(line: string): void {
    process.stdout.write(`${line}\n`);
}

/** Log lines to the job log; debug and trace only when CANARY_DEBUG is set. */
const logger: Logger = {
    trace: (m) => {
        if (process.env.CANARY_DEBUG) say(`trace ${m}`);
    },
    debug: (m) => {
        if (process.env.CANARY_DEBUG) say(`debug ${m}`);
    },
    info: (m) => say(m),
    warn: (m) => console.warn(`warning: ${m}`),
    error: (m, e) => console.error(`error: ${m}${e instanceof Error ? ` (${e.message})` : ''}`),
};

/** git through bash, as the extension's executor runs it. A non-zero exit is a result, not a throw. */
const executor: Pick<CommandExecutor, 'execute'> = {
    execute: (command, options = {}) =>
        new Promise((resolve) => {
            const started = Date.now();
            exec(
                command,
                { cwd: options.cwd, timeout: options.timeout, shell: '/bin/bash', maxBuffer: 64 * 1024 * 1024 },
                (error, stdout, stderr) => {
                    const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
                    resolve({ stdout, stderr, code, duration: Date.now() - started });
                },
            );
        }),
};

/** The token, held where the extension's token service reads it. */
function secretsHolding(token: string): vscode.SecretStorage {
    const stored: GitHubToken = { token, tokenType: 'bearer', scopes: [] };
    const values = new Map<string, string>([['github-token', JSON.stringify(stored)]]);
    return {
        get: async (key) => values.get(key),
        store: async (key, value) => {
            values.set(key, value);
        },
        delete: async (key) => {
            values.delete(key);
        },
        onDidChange: () => ({ dispose: () => undefined }),
    };
}

async function main(): Promise<number> {
    const inputs: CanaryInputs = {
        repo: required('CANARY_REPO'),
        packageId: required('CANARY_PACKAGE'),
        stackId: required('CANARY_STACK'),
        daLiveOrg: required('CANARY_DALIVE_ORG'),
        daLiveSite: required('CANARY_DALIVE_SITE'),
        lastSynced: required('CANARY_LAST_SYNCED'),
    };
    const tokenService = new GitHubTokenService(secretsHolding(required('CANARY_GITHUB_TOKEN')), logger);
    const github = { tokenService, fileOperations: new GitHubFileOperations(tokenService, logger) };

    const result = await runCanaryUpdate(inputs, { github, logger, executor });
    say(JSON.stringify(result, null, 2));
    if (result.success && process.env.GITHUB_OUTPUT) {
        appendFileSync(process.env.GITHUB_OUTPUT, `synced=${result.syncedCommit}\n`);
    }
    return result.success ? 0 : 1;
}

main().then(
    (code) => process.exit(code),
    (error: unknown) => {
        console.error(`canary update could not run: ${error instanceof Error ? error.stack : String(error)}`);
        process.exit(2);
    },
);
