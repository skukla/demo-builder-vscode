/**
 * Evaluation Mode's dry run: a mutation must become IMPOSSIBLE, not discouraged.
 *
 * WHY THIS EXISTS. The point of the mode is to measure the path an agent takes
 * through the extension — which tools it reaches for, in what order, at what
 * token cost — against a real project, without a measurement run creating a
 * repo, deploying a mesh or publishing a storefront. That is only safe if the
 * handler genuinely never runs.
 *
 * TESTED BY EXECUTION, NEVER BY READING THE FLAG. The git-sync hook read an env
 * var Claude Code never sets, did nothing on every EDS project ever generated,
 * and shipped green because its tests asserted the command STRING. So every case
 * here drives the real server over a real socket and asserts on the HANDLER's
 * call count.
 *
 * Note the two-sided pair: with the mode off the same mutating tool must reach
 * its handler. Without that case the gate could be permanently on and every
 * other assertion here would still pass.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { InExtensionMcpServer } from '@/features/ai/server/inExtensionMcpServer';
import { callToolOverSocket, connectAndInit, makeLogger } from './inExtensionMcpServer.testUtils';
import {
    DRY_RUN_SETTING_KEY,
    TOGGLE_DRY_RUN_COMMAND,
} from '@/features/ai/server/dryRunMode';
import * as pkg from '../../../../package.json';
import { readFileSync } from 'fs';
import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { READ_DESCRIPTORS } from '@/features/ai/server/readDescriptors';
import { STATUS_DESCRIPTORS } from '@/features/ai/server/statusDescriptors';
import { DATA_INSTALLER_DESCRIPTORS } from '@/features/ai/server/dataInstallerDescriptors';
import { isReadOnlyToolName } from '@/features/ai/server/inExtensionMcpServer';

/** Handler spies, one per probe tool. */
const ran: Record<string, jest.Mock> = {};

function registerProbes(srv: {
    registerTool: (n: string, s: unknown, h: (a: unknown) => Promise<unknown>) => void;
}): void {
    const probe = (name: string) => {
        ran[name] = jest.fn();
        return async (args: unknown) => {
            ran[name](args);
            return { content: [{ type: 'text' as const, text: 'ran for real' }] };
        };
    };

    // A mutating tool. `deploy_` is not in the read-only name shapes.
    srv.registerTool(
        'deploy_probe_thing',
        { description: 'probe write', inputSchema: { target: z.string().optional() } },
        probe('deploy_probe_thing')
    );

    // A mutating tool that DOES raise a consent dialog — `reset_datapack` is in
    // AGENT_ALERT_COPY, which is what `callRequestsConsent` gates on.
    srv.registerTool(
        'reset_datapack',
        {
            description: 'probe destructive',
            inputSchema: { confirm: z.boolean().optional(), apiKey: z.string().optional() },
        },
        probe('reset_datapack')
    );

    // A read tool. Reads must still work: a dry run that also blinds the agent
    // measures a path nobody would ever take.
    srv.registerTool(
        'get_probe_thing',
        { description: 'probe read', inputSchema: { scope: z.string().optional() }, annotations: { readOnlyHint: true } },
        probe('get_probe_thing')
    );
}

describe('agent dry run', () => {
    let dir: string;
    let socketPath: string;
    let server: InExtensionMcpServer | undefined;
    let dryRun: boolean;
    let consentGate: jest.Mock;

    async function startServer(): Promise<void> {
        server = new InExtensionMcpServer(socketPath, '/projects', makeLogger(), {
            registerExtraTools: registerProbes,
            consentGate: consentGate as never,
            // Read LIVE, exactly as the extension injects it — a captured
            // boolean could not express "toggled between calls".
            dryRun: () => dryRun,
        });
        await server.start();
    }

    beforeEach(() => {
        for (const k of Object.keys(ran)) delete ran[k];
        dryRun = true;
        consentGate = jest.fn().mockResolvedValue({ allowed: true });
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-dryrun-'));
        socketPath = path.join(dir, 'srv.sock');
    });

    afterEach(() => {
        server?.dispose();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('never reaches a mutating handler, and says what would have happened', async () => {
        await startServer();

        const text = await callToolOverSocket(socketPath, 'deploy_probe_thing', {
            target: 'staging',
        });

        expect(ran.deploy_probe_thing).not.toHaveBeenCalled();
        const answer = JSON.parse(text);
        expect(answer.dryRun).toBe(true);
        expect(answer.wouldRun).toBe('deploy_probe_thing');
    });

    it('lets a read tool run normally', async () => {
        await startServer();

        await callToolOverSocket(socketPath, 'get_probe_thing', { scope: 'x' });

        expect(ran.get_probe_thing).toHaveBeenCalledTimes(1);
    });

    it('reaches the mutating handler when the mode is off', async () => {
        // The two-sided case. Without it, a gate stuck permanently on would pass
        // every other test in this file.
        dryRun = false;
        await startServer();

        const text = await callToolOverSocket(socketPath, 'deploy_probe_thing', {
            target: 'staging',
        });

        expect(ran.deploy_probe_thing).toHaveBeenCalledTimes(1);
        expect(text).toBe('ran for real');
    });

    it('blocks a confirmed destructive call WITHOUT raising a consent dialog', async () => {
        // Ordering, and it is deliberate: asking someone to approve something
        // that will not happen is worse than not asking.
        await startServer();

        const text = await callToolOverSocket(socketPath, 'reset_datapack', { confirm: true });

        expect(ran.reset_datapack).not.toHaveBeenCalled();
        expect(consentGate).not.toHaveBeenCalled();
        expect(JSON.parse(text).dryRun).toBe(true);
    });

    it('still raises the consent dialog for that call when the mode is off', async () => {
        // Proves the previous test measured the dry run and not a miswired gate.
        dryRun = false;
        await startServer();

        await callToolOverSocket(socketPath, 'reset_datapack', { confirm: true });

        expect(consentGate).toHaveBeenCalledTimes(1);
    });

    it('reports argument KEYS and never argument VALUES', async () => {
        // Args carry secrets — the same reason withToolLogging logs keys only.
        await startServer();

        const text = await callToolOverSocket(socketPath, 'reset_datapack', {
            confirm: true,
            apiKey: 'fake-test-pw-not-a-secret',
        });

        expect(text).toContain('apiKey');
        expect(text).not.toContain('fake-test-pw-not-a-secret');
    });

    it('answers as DATA, not as an error', async () => {
        // An error teaches an agent to retry; data teaches it what would happen.
        await startServer();

        const { socket, rpc } = await connectAndInit(socketPath);
        const res = await rpc.request(2, 'tools/call', {
            name: 'deploy_probe_thing',
            arguments: {},
        });
        socket.end();

        expect(res.result?.isError).toBeFalsy();
        expect(res.error).toBeUndefined();
    });
});

describe('the mode is declared where VS Code reads it', () => {
    // dryRunMode.ts passes the command id to registerCommand as a LITERAL,
    // because manifest-mirrors.test.ts can only see literals there. This is the
    // other half of that trade: it proves the literal and the exported constant
    // have not drifted apart, which would break the status bar item's click
    // silently (the item would point at a command that does not exist).
    it('declares the toggle command in package.json under the constant it exports', () => {
        const declared = (pkg as any).contributes.commands.map((c: any) => c.command);

        expect(declared).toContain(TOGGLE_DRY_RUN_COMMAND);
    });

    it('declares the setting the live reader reads', () => {
        // A gate whose setting is not in the manifest can never be turned on by
        // a user — it would exist only for whoever wrote it.
        const sections = (pkg as any).contributes.configuration;
        const keys = sections.flatMap((s: any) => Object.keys(s.properties ?? {}));

        expect(keys).toContain(DRY_RUN_SETTING_KEY);
    });
});

describe('the name shape the gate classifies by agrees with the declared split', () => {
    /*
     * The dry run decides by NAME (`isReadOnlyToolName`), because the server is
     * vscode-free and gates before it can know anything else. So a tool that
     * ACTS but is named like a read would run for real during a dry run —
     * silently, in the one mode whose whole promise is that it cannot.
     *
     * Both sides were clean when this was written (22 action rows, 12 read
     * rows, zero disagreements). Nothing kept them that way, and the cost of a
     * future disagreement went up the day the dry run started trusting the name.
     *
     * HONEST LIMIT: the descriptor rows are the only DECLARED read/write truth
     * on the surface. The tools registered directly (registerProjectTools and
     * the register*Tools modules) have no such declaration, so nothing here can
     * check them — for those, the name is not merely the classifier, it is the
     * only claim that exists. `mcp-tool-authoring`'s "no writes hiding in
     * reads" rule is what covers them, and it is a rule, not a check.
     */
    it('no ACTION descriptor is named like a read', () => {
        const looksLikeRead = ACTION_DESCRIPTORS.filter((d) => isReadOnlyToolName(d.tool)).map(
            (d) => d.tool
        );

        expect(looksLikeRead).toEqual([]);
    });

    it('no READ descriptor is named like an action', () => {
        // The inverse costs less — a read blocked by the dry run is merely
        // useless — but it makes the pairing a real mirror rather than a
        // one-way assertion.
        const looksLikeAction = READ_DESCRIPTORS.filter((d) => !isReadOnlyToolName(d.tool)).map(
            (d) => d.tool
        );

        expect(looksLikeAction).toEqual([]);
    });

    it('checks a non-empty surface', () => {
        // Vacuous-pass guard: two empty arrays would satisfy both tests above.
        expect(ACTION_DESCRIPTORS.length).toBeGreaterThan(10);
        expect(READ_DESCRIPTORS.length).toBeGreaterThan(5);
    });

    it('no read-shaped tool anywhere requires confirm', () => {
        /*
         * The other two descriptor files (`statusDescriptors`,
         * `dataInstallerDescriptors`) are deliberately MIXED — each holds reads
         * and writes together — so the file-level split above cannot cover them.
         * This invariant can: `confirm: true` is the surface's own declaration
         * that a tool is destructive, so a read-shaped tool carrying it is a
         * contradiction, and one the dry run would wave straight through.
         *
         * An audit of all 46 descriptor rows on 2026-08-25 found zero. The
         * check exists so the next one added is caught by a test rather than by
         * an audit.
         */
        const all = [
            ...ACTION_DESCRIPTORS,
            ...READ_DESCRIPTORS,
            ...STATUS_DESCRIPTORS,
            ...DATA_INSTALLER_DESCRIPTORS,
        ];
        const contradictions = all
            .filter((d) => isReadOnlyToolName(d.tool) && d.confirm === true)
            .map((d) => d.tool);

        expect(all.length).toBeGreaterThan(40); // vacuous-pass guard
        expect(contradictions).toEqual([]);
    });

    it('keeps the forced flag that stops check_github_app writing', () => {
        /*
         * THE example of a read-shaped tool that writes, and the reason this
         * whole family of checks exists. `checkGitHubApp` triggers a Helix code
         * sync (`POST /code/{owner}/{repo}/main/*`) whenever Helix 404s, unless
         * `skipTrigger` is set — right for the wizard mid-setup, wrong for a
         * tool named `check_`, and an agent enumerating checks would fire a sync
         * at every repo it asked about.
         *
         * The descriptor forces the flag (`{...args, ...argDefaults}` — forced
         * last, so a caller cannot send the flag that turns the read back into a
         * write). Nothing else pins it, and deleting one line would restore a
         * write that the dry run classifies as a read and lets through.
         */
        const row = STATUS_DESCRIPTORS.find((d) => d.tool === 'check_github_app');

        expect(row).toBeDefined();
        expect(row?.argDefaults).toEqual({ skipTrigger: true });
    });
});

describe('the status bar item is a TOGGLE, not just an indicator', () => {
    /*
     * It used to hide when the mode was off, which put the control out of reach
     * exactly when someone wanted to turn it ON — the affordance vanished at the
     * moment it became useful. Owner feedback while testing, 2026-08-25.
     *
     * Asserted at the SOURCE because the alternative is booting vscode. What
     * matters is that no code path hides it, and that the two states are told
     * apart by more than wording.
     */
    const source = readFileSync('src/features/ai/server/dryRunMode.ts', 'utf8');

    it('never hides the item', () => {
        expect(source).not.toMatch(/item\.hide\(\)/);
    });

    it('shows it on every sync, whichever state it is in', () => {
        // One unconditional show() inside sync, not one per branch.
        expect(source).toMatch(/item\.show\(\);/);
    });

    it('distinguishes the states by COLOUR, not only by words', () => {
        // A grey item reads as information. This changes what the extension
        // does, so the on state has to look like a mode.
        expect(source).toMatch(/statusBarItem\.warningBackground/);
        expect(source).toMatch(/: undefined/);
    });

    it('confirms a toggle transiently rather than with a sticky notification', () => {
        // The status bar item already IS the indicator; the message only
        // confirms the change landed. A long persistent one is not read.
        expect(source).toMatch(/setStatusBarMessage/);
        expect(source).not.toMatch(/showInformationMessage/);
    });
});
