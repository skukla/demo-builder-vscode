/**
 * Shared sanitization helpers for AI context file generation.
 *
 * Used by aiContextWriter.ts and skillsWriter.ts to prevent Markdown heading
 * injection, link injection, and URL-scheme injection when interpolating
 * project data into generated Markdown files.
 */

/**
 * Strip characters that could break Markdown structure when user-supplied text values are
 * interpolated into AI context files (headings, bullets, code spans, tables, blockquotes).
 *
 * Strips: `\n` `\r` (heading injection), `#` (heading marker), `*` (bold/italic),
 * `` ` `` (code span), `|` (table cell), `>` (blockquote), `[` `]` `(` `)` (link injection).
 *
 * The bracket/paren characters prevent Markdown link injection — a crafted value like
 * `My Project](https://attacker.example.com` would otherwise construct an injected link
 * in an AI context file, enabling prompt injection attacks against AI agents that parse it.
 *
 * Note: `_` is intentionally preserved — it is common in identifiers (e.g. block IDs
 * like `my_block`) and does not trigger emphasis when surrounded by word characters
 * in CommonMark renderers.
 */
export function sanitizeTemplateValue(value: string): string {
    return value.replace(/[\n\r#*`|>[\]()]/g, '');
}

/**
 * Restrict block IDs to characters used in real block slugs.
 * Block IDs originate from external GitHub library manifests and are interpolated
 * into AI context files. Stripping non-slug characters prevents Markdown list
 * injection (e.g. `- injected-block`) without breaking any valid block ID.
 */
export function sanitizeBlockId(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Restrict GitHub owner/repo slugs to characters GitHub actually allows.
 * Strips characters that could break Markdown link syntax (e.g. `][()`) even after
 * sanitizeTemplateValue runs — a crafted slug like `org](https://evil.example.com`
 * would otherwise create an unintended Markdown link.
 */
export function sanitizeGithubSlug(value: string): string {
    return value.replace(/[^a-zA-Z0-9._/-]/g, '');
}

/**
 * Validate URL protocol and strip characters that could break Markdown link syntax.
 * Returns `[invalid URL]` for non-https values to prevent `javascript:` injection.
 * Empty strings are returned as-is (no URL configured).
 *
 * Strips `\n`, `\r`, `[`, `]`, `(`, and `)` but preserves `#` — newlines prevent heading
 * injection; bracket characters prevent Markdown link injection via crafted https:// URLs
 * such as `https://example.com](https://attacker.com`; `#` is preserved because it is a
 * valid URL fragment separator (e.g. the DA.live authoring URL is `https://da.live/#/org/site`).
 */
export function sanitizeUrl(value: string): string {
    if (!value) return '';
    if (!value.startsWith('https://')) return '[invalid URL]';
    return value.replace(/[\n\r[\]()]/g, '');
}

/**
 * Backslash-escape Markdown structural characters in a value before interpolation.
 *
 * Output-escaping defense layer — runs after input sanitization (sanitizeTemplateValue)
 * for defense-in-depth. The AI agent sees the real text without misinterpreting it as
 * Markdown syntax.
 *
 * Escaped: `\ # * _ ` ~ [ ] ( ) { } | > ! +`
 *
 * NOT escaped: `-` and `.` — these are only structural at line-start positions
 * (list items, ordered lists, thematic breaks). Values are interpolated into inline
 * text, never at line start, so escaping them would add noise without benefit.
 */
export function escapeMarkdown(value: string): string {
    return value.replace(/([\\#*_`~[\](){}|>!+])/g, '\\$1');
}

/**
 * Single-pass template interpolation with automatic Markdown escaping.
 *
 * Replaces `{key}` tokens in `template` with `escapeMarkdown(values[key])`.
 * Throws if a placeholder key is not found in `values`.
 * Single-pass ensures substituted values are never re-processed.
 *
 * Keys must be word characters only (`[a-zA-Z0-9_]`). Hyphenated keys like
 * `{some-key}` are silently ignored by the regex — use camelCase or snake_case.
 */
export function interpolateTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => {
        if (!(key in values)) {
            throw new Error(`interpolateTemplate: missing value for key "${key}"`);
        }
        return escapeMarkdown(values[key]);
    });
}
