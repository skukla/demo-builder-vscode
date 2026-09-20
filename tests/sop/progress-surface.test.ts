/**
 * WHICH surface a long operation uses is decided once, in one place (PL-59
 * phase 2; the handbook convention "a long operation reports where the SC is
 * looking").
 *
 * `progress-wording.test.ts` checks what those surfaces SAY. This checks which
 * one opens, because the two fail differently: bad wording is visible, a wrong
 * surface is invisible until someone watches an SC press a button and get a
 * notification behind a modal, or two notifications for one press.
 *
 * Two arms, two populations:
 *
 * **Direct progress.** `withOperationProgress` routes by how an operation was
 * started — a screen's modal (R1), one notification (R2), an agent's notifier
 * (R3) — so a handler cannot pick the wrong one. A call to
 * `vscode.window.withProgress` bypasses that. Five modules are allowed it,
 * because they IMPLEMENT the surfaces; everything else is a known direct caller
 * with a reason, and the list may only shrink.
 *
 * **Blocking dialogs.** A `modal: true` dialog stops the SC until they answer.
 * That is right for a DECISION that must be made before work starts — "delete
 * this project?" — and wrong for anything else: progress belongs in a
 * notification or a modal that can be left running, and an outcome belongs
 * where the work was being watched (R6). Each site says which decision it
 * gates, so a new one cannot arrive without someone naming it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

interface Ledger {
    _what: string;
    directProgress: Record<string, string>;
    blockingDialogs: Record<string, string>;
}

const ROOT = join(__dirname, '..', '..');
const LEDGER: Ledger = JSON.parse(
    readFileSync(join(__dirname, 'progress-surface.ledger.json'), 'utf8'),
);

/**
 * The modules that BUILD the surfaces. They call VS Code's own progress because
 * that is their job; everything else asks them for it.
 */
const SURFACE_OWNERS = new Set([
    'src/core/base/baseCommand.ts',
    'src/core/vscode/progressRegister.ts',
    'src/core/vscode/operationBackgroundNotice.ts',
    'src/core/auth/browserSignInNotice.ts',
    'src/features/ai/server/agentOperationNotifier.ts',
]);

const SOURCES = execSync('git ls-files src', { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));

/** Every `file:line` where `pattern` matches, across the tracked source. */
function sites(pattern: RegExp, skip: (file: string) => boolean = () => false): string[] {
    const found: string[] = [];
    for (const file of SOURCES) {
        if (skip(file)) continue;
        const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
        lines.forEach((line, index) => {
            if (pattern.test(line)) found.push(`${file}:${index + 1}`);
        });
    }
    return found;
}

/** A listed site that is gone, or whose reason is too thin to be one. */
function ledgerProblems(listed: Record<string, string>, current: string[]): {
    unlisted: string[];
    stale: string[];
    unexplained: string[];
} {
    const live = new Set(current);
    return {
        unlisted: current.filter((site) => !(site in listed)),
        stale: Object.keys(listed).filter((site) => !live.has(site)),
        unexplained: Object.entries(listed)
            .filter(([, reason]) => reason.trim().length < 25)
            .map(([site]) => site),
    };
}

describe('a long operation reports where the SC is looking', () => {
    it('CONTROL: the scans read a real tree and can tell the two patterns apart', () => {
        expect(SOURCES.length).toBeGreaterThan(500);
        // The router itself is found by neither scan: it opens no surface of its
        // own, it decides which one opens.
        expect(sites(/vscode\.window\.withProgress\(/)).not.toContain(
            'src/core/vscode/withOperationProgress.ts:1',
        );
        expect(/\{\s*modal:\s*true/.test('{ modal: true }')).toBe(true);
        expect(/\{\s*modal:\s*true/.test('{ modal: false }')).toBe(false);
    });

    describe('direct progress notifications', () => {
        const current = sites(
            /vscode\.window\.withProgress\(/,
            (file) => SURFACE_OWNERS.has(file),
        );

        it('CONTROL: the owners are excluded, and the rest are still found', () => {
            expect(current.length).toBeGreaterThan(0);
            expect(current.some((site) => site.startsWith('src/core/base/baseCommand.ts'))).toBe(
                false,
            );
        });

        it('every one is a listed direct caller, with a reason', () => {
            const { unlisted, stale, unexplained } = ledgerProblems(
                LEDGER.directProgress,
                current,
            );

            expect({ unlisted, stale, unexplained }).toEqual({
                unlisted: [],
                stale: [],
                unexplained: [],
            });
        });
    });

    describe('blocking dialogs', () => {
        const current = sites(/\{\s*modal:\s*true/);

        it('CONTROL: the scan finds the dialogs this extension actually shows', () => {
            expect(current.length).toBeGreaterThan(5);
        });

        it('every one names the decision it gates', () => {
            const { unlisted, stale, unexplained } = ledgerProblems(
                LEDGER.blockingDialogs,
                current,
            );

            expect({ unlisted, stale, unexplained }).toEqual({
                unlisted: [],
                stale: [],
                unexplained: [],
            });
        });
    });
});
