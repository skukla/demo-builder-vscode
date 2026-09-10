/**
 * sanitization.ts Tests
 *
 * Unit tests for the shared Markdown-injection prevention helpers.
 * This module is security-critical — it prevents heading injection, link injection,
 * and URL-scheme injection when interpolating project data into AI context files.
 */

import {
    sanitizeTemplateValue,
    sanitizeGithubSlug,
    sanitizeUrl,
    sanitizeBlockId,
    escapeMarkdown,
    interpolateTemplate,
} from '@/features/project-creation/services/sanitization';

// ─── sanitizeTemplateValue ────────────────────────────────────────────────────

/**
 * The cases are DATA, and the label on each row is the SECURITY RATIONALE — which
 * Markdown construct that character would have opened. Those reasons were the
 * only thing the one-test-per-character form carried that a table does not, so
 * they are kept verbatim as row labels.
 *
 * Every row asserts the EXACT output. Five of these previously asserted
 * `not.toContain('](')` or similar: true of any mangling, not just the right one,
 * so a mutant that stripped the wrong characters passed. `sanitizeTemplateValue`
 * removes [\n\r#*`|>[\]()] and `sanitizeGithubSlug` keeps only
 * [a-zA-Z0-9._/-], so the exact result is knowable in every case.
 */
const TEMPLATE_VALUE: ReadonlyArray<readonly [string, string, string]> = [
    ['a newline, which would open a heading', 'my-project\n## Injected heading', 'my-project Injected heading'],
    ['a carriage return', 'value\rextra', 'valueextra'],
    ['a hash, an inline heading marker', 'value#extra', 'valueextra'],
    ['asterisks, bold', '**bold**', 'bold'],
    ['asterisks, italic', '*italic*', 'italic'],
    ['backticks, a code span', '`code`', 'code'],
    ['a pipe, a table cell', 'cell | injected', 'cell  injected'],
    ['an angle bracket, a blockquote', '> blockquote', ' blockquote'],
    ['a bracket-paren pair, an inline link', 'My Project](https://evil.com', 'My Projecthttps://evil.com'],
    ['an opening bracket, a reference link', 'project[ref', 'projectref'],
];

const TEMPLATE_VALUE_PRESERVED: ReadonlyArray<readonly [string, string]> = [
    ['an underscore, common in identifiers and safe in CommonMark word context', 'my_block_name'],
    ['an empty string', ''],
    ['ordinary words', 'hello world'],
    ['a slug with hyphens and an underscore', 'my-demo-project_v2'],
];

describe('sanitizeTemplateValue', () => {
    it.each(TEMPLATE_VALUE)('strips %s', (_why, input, expected) => {
        expect(sanitizeTemplateValue(input)).toBe(expected);
    });

    it.each(TEMPLATE_VALUE_PRESERVED)('preserves %s', (_why, input) => {
        expect(sanitizeTemplateValue(input)).toBe(input);
    });
});

// ─── sanitizeGithubSlug ───────────────────────────────────────────────────────

const GITHUB_SLUG: ReadonlyArray<readonly [string, string, string]> = [
    ['a bracket-paren pair that would break link syntax', 'org](https://evil.com', 'orghttps//evil.com'],
    ['a space', 'org space', 'orgspace'],
    ['a newline and the heading it would open', 'org\n## Injected', 'orgInjected'],
];

describe('sanitizeGithubSlug', () => {
    it('keeps the characters GitHub actually allows', () => {
        expect(sanitizeGithubSlug('my-org/my-repo.v1_2')).toBe('my-org/my-repo.v1_2');
    });

    it.each(GITHUB_SLUG)('strips %s', (_why, input, expected) => {
        expect(sanitizeGithubSlug(input)).toBe(expected);
    });

    it('returns an empty string unchanged', () => {
        expect(sanitizeGithubSlug('')).toBe('');
    });
});

// ─── sanitizeUrl ──────────────────────────────────────────────────────────────

describe('sanitizeUrl', () => {
    it('returns empty string for empty input', () => {
        expect(sanitizeUrl('')).toBe('');
    });

    it('returns [invalid URL] for non-https schemes', () => {
        expect(sanitizeUrl('http://example.com')).toBe('[invalid URL]');
        expect(sanitizeUrl('javascript:alert(1)')).toBe('[invalid URL]');
        expect(sanitizeUrl('ftp://example.com')).toBe('[invalid URL]');
        expect(sanitizeUrl('data:text/html,<h1>x</h1>')).toBe('[invalid URL]');
    });

    it('passes through a valid https:// URL unchanged', () => {
        expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path');
    });

    it('preserves # fragment separator in URLs', () => {
        expect(sanitizeUrl('https://da.live/#/org/site')).toBe('https://da.live/#/org/site');
    });

    // Exact outputs, not `not.toContain`: sanitizeUrl strips [\n\r[\]()] and keeps
    // everything else, so what survives is knowable. An assertion that the bad
    // substring is absent is true of any mangling, including a wrong one.
    it.each([
        ['a newline and the heading it would open', 'https://example.com\n## Injected Heading', 'https://example.com## Injected Heading'],
        ['a bracket-paren pair, an inline link', 'https://example.com](https://attacker.com', 'https://example.comhttps://attacker.com'],
        ['an opening bracket, a reference link', 'https://example.com[text', 'https://example.comtext'],
    ])('strips %s', (_why, input, expected) => {
        expect(sanitizeUrl(input)).toBe(expected);
    });
});

// ─── sanitizeBlockId ──────────────────────────────────────────────────────────

describe('sanitizeBlockId', () => {
    it('preserves alphanumeric characters, hyphens, and underscores', () => {
        expect(sanitizeBlockId('my-block_v2')).toBe('my-block_v2');
    });

    it('strips the space in "- text" — the leading dash is preserved (hyphens are allowed in block IDs)', () => {
        // sanitizeBlockId keeps hyphens — the space after the dash is what gets stripped.
        // "- injected-block" → "-injected-block" (space removed, dash kept)
        expect(sanitizeBlockId('- injected-block')).toBe('-injected-block');
    });

    it('strips spaces', () => {
        expect(sanitizeBlockId('block name')).toBe('blockname');
    });

    it.each([
        ['a bracket-paren pair that would break link syntax', 'btn](https://evil.com', 'btnhttpsevilcom'],
        ['an opening bracket, a reference link', 'block[ref', 'blockref'],
    ])('strips %s', (_why, input, expected) => {
        // sanitizeBlockId keeps only [a-zA-Z0-9_-], so the colon and slashes go
        // too — which `not.toContain('](')` never said.
        expect(sanitizeBlockId(input)).toBe(expected);
    });

    it('strips # to prevent Markdown heading injection', () => {
        expect(sanitizeBlockId('block#heading')).toBe('blockheading');
    });

    it('returns empty string for empty input', () => {
        expect(sanitizeBlockId('')).toBe('');
    });
});

// ─── escapeMarkdown ─────────────────────────────────────────────────────────

describe('escapeMarkdown', () => {
    it('backslash-escapes each Markdown structural char', () => {
        const structural = '\\#*_`~[](){}|>!+';
        const result = escapeMarkdown(structural);

        // Each char should be preceded by a backslash
        for (const ch of structural) {
            expect(result).toContain(`\\${ch}`);
        }
    });

    it('preserves safe characters (letters, digits, spaces, /, :, @)', () => {
        const safe = 'Hello World 123 foo/bar : user@example';
        expect(escapeMarkdown(safe)).toBe(safe);
    });

    it('does not escape hyphens or dots (only structural at line-start, not in inline text)', () => {
        expect(escapeMarkdown('my-project')).toBe('my-project');
        expect(escapeMarkdown('example.com')).toBe('example.com');
        expect(escapeMarkdown('https://main--my-repo--owner.aem.live')).toBe(
            'https://main--my-repo--owner.aem.live',
        );
    });

    it('returns empty string for empty input', () => {
        expect(escapeMarkdown('')).toBe('');
    });
});

// ─── interpolateTemplate ────────────────────────────────────────────────────

describe('interpolateTemplate', () => {
    it('replaces {key} placeholders with escaped values', () => {
        const result = interpolateTemplate('Hello {name}!', { name: 'World' });

        expect(result).toBe('Hello World!');
    });

    it('throws on missing key', () => {
        expect(() => interpolateTemplate('Hello {name}!', {}))
            .toThrow(/missing.*name/i);
    });

    it('handles multiple occurrences of the same placeholder', () => {
        const result = interpolateTemplate('{x} and {x}', { x: 'val' });

        expect(result).toBe('val and val');
    });

    it('returns template unchanged when no placeholders', () => {
        const template = 'No placeholders here.';
        expect(interpolateTemplate(template, { extra: 'ignored' })).toBe(template);
    });

    it('does not re-process placeholders inside substituted values', () => {
        const result = interpolateTemplate('{a}', { a: '{b}', b: 'SHOULD_NOT_APPEAR' });

        expect(result).toBe('\\{b\\}');
        expect(result).not.toContain('SHOULD_NOT_APPEAR');
    });

    it('escapes Markdown structural chars in substituted values', () => {
        const result = interpolateTemplate('Name: {name}', { name: 'My *Bold* Project' });

        expect(result).toContain('\\*Bold\\*');
    });
});

