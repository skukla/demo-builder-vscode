/**
 * Fix with AI — the prompt the SC's AI gets for a kept clash, and the request that opens it
 * (EDS-57 step 4). Run on a real kept clash (JustRite's header, in miniature), so the diffs
 * in the prompt are what git reads from the local copy.
 */

// FIRST: this module owns the jest.mock calls the imports below must see.
import {
    REAL_GIT_TIMEOUT_MS,
    fx,
    keepClash,
    request,
    storefrontProject,
    updateContext,
} from './keptClash.testUtils';
import { boundDiff, buildClashPrompt } from '@/features/updates/services/clashPrompt';
import { openFixWithAi, type FixWithAiRequest } from '@/features/updates/services/fixWithAi';

async function keptOpen(): Promise<FixWithAiRequest> {
    const project = storefrontProject();
    const ctx = updateContext();
    await keepClash(project, request(), ctx);
    const open = jest.fn(async (_request: FixWithAiRequest) => undefined);
    await expect(openFixWithAi([project], ctx, open)).resolves.toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    return open.mock.calls[0][0];
}

describe('openFixWithAi', () => {
    it('opens a new chat with the clashing file attached by its full path', async () => {
        const opened = await keptOpen();

        expect(opened.fresh).toBe(true);
        expect(opened.attachFiles).toEqual([`${fx.local}/blocks/header/header.js`]);
    }, REAL_GIT_TIMEOUT_MS);

    it("puts both sides' changes in the prompt, read from the local copy", async () => {
        const { prompt } = await keptOpen();

        // The update's change and the storefront's, each from where both started.
        expect(prompt).toContain("+const dropDown = 'drop-down line with aria attributes';");
        expect(prompt).toContain("+const dropDown = 'drop-down line plus the quote icon';");
        expect(prompt).toContain("Adobe's tested boilerplate (adobe-commerce/boilerplate-b2b-template");
        expect(prompt).toContain(`Full path: ${fx.local}/blocks/header/header.js`);
    }, REAL_GIT_TIMEOUT_MS);

    it('tells the AI to finish through the tool for that project, and never to push itself', async () => {
        const { prompt } = await keptOpen();

        expect(prompt).toContain('finish_storefront_update with project "justrite"');
        expect(prompt).toContain('Do not commit, push, or run any git command that changes the repository');
        expect(prompt).toContain('Change only the files named below');
    }, REAL_GIT_TIMEOUT_MS);

    it('opens nothing when no project has a kept clash', async () => {
        const open = jest.fn();

        await expect(openFixWithAi([storefrontProject()], updateContext(), open)).resolves.toBe(false);

        expect(open).not.toHaveBeenCalled();
    });
});

describe('buildClashPrompt', () => {
    const item = (projectName: string) => ({
        title: projectName,
        projectName,
        clash: {
            track: 'template' as const,
            source: { owner: 'kmanns', repo: 'justrite' },
            base: 'a'.repeat(40),
            target: 'b'.repeat(40),
            files: ['blocks/header/header.js'],
            fixes: false,
            keptAt: '2026-10-21T00:00:00.000Z',
        },
        storefrontPath: `/p/${projectName}/components/eds-storefront`,
        files: [{ path: 'blocks/header/header.js', updateDiff: '+a', storefrontDiff: '+b' }],
    });

    it('names no AI engine: the SC chose one and the prompt works in either', () => {
        const prompt = buildClashPrompt([item('justrite')]);

        expect(prompt).not.toMatch(/copilot|claude/i);
        // Control: the same matcher finds a word that is there.
        expect(prompt).toMatch(/demo builder/i);
    });

    it("words a colleague's update by its repository", () => {
        expect(buildClashPrompt([item('justrite')])).toContain('the changes from kmanns/justrite (aaaaaaa to bbbbbbb)');
    });

    it('covers several projects in one chat, each finished by its own name', () => {
        const prompt = buildClashPrompt([item('justrite'), item('bodea')]);

        expect(prompt).toContain('fix the clashes below');
        expect(prompt).toContain('finish_storefront_update with project "justrite"');
        expect(prompt).toContain('finish_storefront_update with project "bodea"');
    });

    it('cuts a long diff and says so, and leaves a short one whole', () => {
        const long = Array.from({ length: 400 }, (_, i) => `+line ${i}`).join('\n');

        const bounded = boundDiff(long).split('\n');

        expect(bounded).toHaveLength(151);
        expect(bounded[150]).toBe('… 250 more lines; read the file itself');
        expect(boundDiff('+one\n+two\n')).toBe('+one\n+two');
    });
});
