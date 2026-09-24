/**
 * One spelling of "an agent did this" in the window, and no other in the
 * agent's server code (owner, 2026-09-12: four spellings had drifted apart).
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { AGENT_PREFIX, agentNotice } from '@/features/ai/server/agentNotice';

const SERVER_DIR = join(__dirname, '..', '..', '..', '..', 'src', 'features', 'ai', 'server');
// "Demo Builder: <Command>" is how VS Code names this extension's commands and
// output channels, so a bare "Demo Builder: " is not scanned; the notification
// spellings were the interpolated title, the dash, and "Agent:".
const OLD_SPELLINGS = [/['"`]Agent: /, /Demo Builder — /, /Demo Builder: \$\{/];

describe('agentNotice', () => {
    it('opens with the word and the separator VS Code does not also use', () => {
        expect(agentNotice('Resetting the storefront')).toBe('Agent · Resetting the storefront');
        expect(AGENT_PREFIX).toBe('Agent ·');
    });

    it('is the only spelling the agent server code uses for its notifications', () => {
        const offenders: string[] = [];
        for (const file of readdirSync(SERVER_DIR).filter((f) => f.endsWith('.ts'))) {
            const source = readFileSync(join(SERVER_DIR, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
            if (OLD_SPELLINGS.some((re) => re.test(source))) offenders.push(file);
        }
        expect(offenders).toStrictEqual([]);
    });

    it('CONTROL: the scan sees an old spelling', () => {
        expect(OLD_SPELLINGS.some((re) => re.test("title: `Demo Builder: ${copy.action}?`"))).toBe(true);
        expect(OLD_SPELLINGS.some((re) => re.test("`Agent: ${label(toolName)}…`"))).toBe(true);
        expect(OLD_SPELLINGS.some((re) => re.test("`Demo Builder — ${label(toolName)} failed`"))).toBe(true);
        expect(OLD_SPELLINGS.some((re) => re.test('"Demo Builder: Debug Logs"'))).toBe(false);
    });
});
