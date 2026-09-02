/**
 * SOP: a HandlerContext is BUILT by a factory, never assembled by hand.
 *
 * `HandlerContext` carries every manager a handler can reach, and all of them
 * are OPTIONAL on the type — making them required would rewrite 99 test files
 * (see `componentRegistryAccess.ts`, which explains why). So a surface that
 * assembles the object literal itself typechecks perfectly while missing a
 * manager, and the miss surfaces only when some handler on that surface asks
 * for the one it left out.
 *
 * THE INCIDENT (2026-09-02). The project-creation wizard hand-listed its
 * managers. Every other panel used `createPanelHandlerContext`, so when
 * `componentRegistry` was added to the factory the wizard alone did not get it.
 * The Connection view asks for `get-components-data`; the handler threw
 * "HandlerContext carries no componentRegistry"; the failure envelope came back
 * with no `data`; and the webview crashed reading `.envVars` off the undefined.
 * A hand-built context does not fail when it is written — it fails the next time
 * the factory gains a field, on whichever surface forgot to copy it.
 *
 * WHY SOURCE-READING AND NOT A UNIT TEST. Each surface's context builder is
 * private, and a unit test for one says nothing about the next one someone
 * writes. The rule that actually holds is structural: producers go through a
 * factory, and the compiler cannot express that.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..', '..', 'src');

/** A function whose declared return type is a HandlerContext. */
const PRODUCES_CONTEXT = /\)\s*:\s*(?:Promise<)?HandlerContext[>\s]*\{/;

/** The two factories. Everyone else calls one of them. */
const FACTORY_CALL = /create(?:Panel|Headless)HandlerContext\s*\(/;

/**
 * The files allowed to produce a context without calling a factory, each with
 * the reason. Named rather than merely skipped so the exemption stays checkable
 * — the assertions below verify each one still is what it claims to be.
 */
const BUILDERS: Record<string, string> = {
    // The factories themselves: this IS the one place assembly happens.
    'handlerContextFactory.ts': 'factory',
    'headlessHandlerContext.ts': 'factory',
    // Derives a new context from one handed in — it adds no managers of its own,
    // so it cannot fall behind the factory.
    'progressCapture.ts': 'deriver',
};

/** Every .ts/.tsx file under src/. */
function sourceFiles(dir: string, found: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            sourceFiles(full, found);
        } else if (/\.tsx?$/.test(entry.name)) {
            found.push(full);
        }
    }
    return found;
}

const PRODUCERS = sourceFiles(SRC).filter((file) =>
    PRODUCES_CONTEXT.test(fs.readFileSync(file, 'utf-8')),
);

describe('SOP: HandlerContext comes from a factory', () => {
    it('CONTROL: finds the context producers at all — a silent zero would pass everything', () => {
        expect(PRODUCERS.length).toBeGreaterThanOrEqual(8);
    });

    it.each(PRODUCERS.map((f) => [path.basename(f), f]))(
        '%s builds its context through a factory',
        (base, file) => {
            if (BUILDERS[base as string]) return;
            const source = fs.readFileSync(file as string, 'utf-8');
            expect(FACTORY_CALL.test(source)).toBe(true);
        },
    );

    it('each named builder still is what the list says it is', () => {
        for (const [base, role] of Object.entries(BUILDERS)) {
            const file = PRODUCERS.find((f) => path.basename(f) === base);
            expect(file).toBeDefined();
            const source = fs.readFileSync(file as string, 'utf-8');
            if (role === 'deriver') {
                // A deriver takes a context in; that is what makes it safe.
                expect(source).toMatch(/:\s*HandlerContext[,)]/);
            } else {
                // A factory names the managers, which is the thing nobody else may do.
                expect(source).toMatch(/componentRegistry:/);
            }
        }
    });
});
