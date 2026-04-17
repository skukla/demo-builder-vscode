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

describe('sanitizeTemplateValue', () => {
    it('strips newlines (\n) to prevent Markdown heading injection', () => {
        const result = sanitizeTemplateValue('my-project\n## Injected heading');

        expect(result).not.toContain('## Injected heading');
        expect(result).toContain('my-project');
    });

    it('strips carriage returns (\r) from strings', () => {
        expect(sanitizeTemplateValue('value\rextra')).toBe('valueextra');
    });

    it('strips # to prevent inline heading marker injection', () => {
        expect(sanitizeTemplateValue('value#extra')).toBe('valueextra');
    });

    it('strips * to prevent Markdown bold/italic injection', () => {
        expect(sanitizeTemplateValue('**bold**')).toBe('bold');
        expect(sanitizeTemplateValue('*italic*')).toBe('italic');
    });

    it('strips backtick to prevent Markdown code span injection', () => {
        expect(sanitizeTemplateValue('`code`')).toBe('code');
    });

    it('strips | to prevent Markdown table cell injection', () => {
        expect(sanitizeTemplateValue('cell | injected')).toBe('cell  injected');
    });

    it('strips > to prevent Markdown blockquote injection', () => {
        expect(sanitizeTemplateValue('> blockquote')).toBe(' blockquote');
    });

    it('strips ] ( ) to prevent Markdown link injection via crafted project names', () => {
        // A project name like 'My Project](https://evil.com' would inject a link in CLAUDE.md
        const result = sanitizeTemplateValue('My Project](https://evil.com');
        expect(result).not.toContain('](');
        expect(result).toContain('My Project');
    });

    it('strips [ to prevent Markdown reference-style link injection', () => {
        expect(sanitizeTemplateValue('project[ref')).not.toContain('[');
    });

    it('preserves _ because it is common in identifiers and safe in CommonMark word context', () => {
        expect(sanitizeTemplateValue('my_block_name')).toBe('my_block_name');
    });

    it('returns empty string unchanged', () => {
        expect(sanitizeTemplateValue('')).toBe('');
    });

    it('preserves safe characters unchanged', () => {
        expect(sanitizeTemplateValue('hello world')).toBe('hello world');
        expect(sanitizeTemplateValue('my-demo-project_v2')).toBe('my-demo-project_v2');
    });
});

// ─── sanitizeGithubSlug ───────────────────────────────────────────────────────

describe('sanitizeGithubSlug', () => {
    it('allows alphanumeric characters, dots, hyphens, underscores, and slashes', () => {
        expect(sanitizeGithubSlug('my-org/my-repo.v1_2')).toBe('my-org/my-repo.v1_2');
    });

    it('strips ] ( ) that could break Markdown link syntax', () => {
        const result = sanitizeGithubSlug('org](https://evil.com');

        expect(result).not.toContain('](');
        expect(result).not.toContain(')');
    });

    it('strips spaces and other non-allowlist characters', () => {
        expect(sanitizeGithubSlug('org space')).toBe('orgspace');
    });

    it('strips newlines that could enable heading injection', () => {
        const result = sanitizeGithubSlug('org\n## Injected');

        expect(result).not.toContain('\n');
        expect(result).not.toContain('## Injected');
    });

    it('returns empty string for empty input', () => {
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

    it('strips newlines to prevent Markdown heading injection', () => {
        const result = sanitizeUrl('https://example.com\n## Injected Heading');

        expect(result).not.toContain('\n## Injected Heading');
        expect(result).toContain('https://example.com');
    });

    it('strips ] ( ) to prevent Markdown link injection', () => {
        const result = sanitizeUrl('https://example.com](https://attacker.com');

        expect(result).not.toContain('](https://attacker.com');
        expect(result).toContain('https://example.com');
    });

    it('strips [ to prevent Markdown reference-style link injection', () => {
        const result = sanitizeUrl('https://example.com[text');

        expect(result).not.toContain('[');
        expect(result).toContain('https://example.com');
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

    it('strips ] ( ) that could break Markdown link syntax', () => {
        const result = sanitizeBlockId('btn](https://evil.com');
        expect(result).not.toContain('](');
        expect(result).not.toContain(')');
    });

    it('strips [ to prevent Markdown reference-style link injection', () => {
        expect(sanitizeBlockId('block[ref')).not.toContain('[');
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

