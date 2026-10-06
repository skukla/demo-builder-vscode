/**
 * AGENTS.md sections about the EDS storefront: where it lives, how product pages
 * are routed, and its block libraries. Split from `agentsMdSections.ts` by topic
 * (EDS-8, 2026-10-05); that module re-exports each builder, so
 * `aiContextWriter` still composes them from one place. The generated text is
 * unchanged, so AI_CONTEXT_VERSION does not move.
 *
 * Security: all user-supplied values are sanitized before interpolation — see
 * sanitization.ts.
 */

import {
    sanitizeTemplateValue,
    sanitizeGithubSlug,
    sanitizeUrl,
    sanitizeBlockId,
    escapeMarkdown,
} from '../sanitization';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import { isEdsProject, getEdsLiveUrl, getEdsPreviewUrl } from '@/types/typeGuards';

export function buildStorefront(project: Project): string {
    if (!isEdsProject(project)) return '';

    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!edsInstance?.path) return '';

    // githubRepo is NOT escaped — it's used inside a URL path where backslash breaks things
    const githubRepo = sanitizeGithubSlug(
        sanitizeTemplateValue((edsInstance.metadata?.githubRepo as string | undefined) ?? ''),
    );
    const localPath = escapeMarkdown(sanitizeTemplateValue(edsInstance.path));

    const lines: string[] = [
        '## Storefront',
        `- **Local path:** ${localPath}  (git clone of the GitHub repo — edit files here)`,
    ];

    if (githubRepo) {
        lines.push(`- **GitHub repo:** https://github.com/${githubRepo}`);
    }

    const previewUrl = getEdsPreviewUrl(project);
    if (previewUrl) {
        lines.push(`- **Preview URL:** ${escapeMarkdown(sanitizeUrl(previewUrl))}`);
    }

    const liveUrl = getEdsLiveUrl(project);
    if (liveUrl) {
        lines.push(`- **Live URL:** ${escapeMarkdown(sanitizeUrl(liveUrl))}`);
    }

    lines.push('');
    lines.push(
        `> Block files live in \`${localPath}/blocks/\`. Edit them here with standard file tools.`,
    );
    lines.push('> Helix picks up pushes to the GitHub repo automatically for preview.');
    lines.push('> For live: push changes to GitHub — Helix picks up the update automatically.');
    lines.push('');
    // The storefront ships a complete typography scale and agents did not know
    // it existed, so block CSS grew hand-picked font sizes ("fonts are too
    // small") with no oracle to iterate against. Deliberately phrased as "read
    // the properties" — the scale belongs to the boilerplate, and a hardcoded
    // token list here would rot when it re-versions. Note the boilerplate's own
    // blocks are inconsistent (some hardcode sizes), so "match the neighbours"
    // is explicitly not the rule.
    lines.push('> **Typography rule:** the storefront ships a complete type scale as');
    lines.push('> `--type-*` custom properties in `styles/styles.css` (display, headline, body,');
    lines.push('> details — each a full `font` shorthand with size and line-height). When writing');
    lines.push('> block CSS, read that file and use `font: var(--type-…)` for every text style —');
    lines.push(
        '> never invent a `font-size`, and do not copy one from a neighbouring block (a few',
    );
    lines.push('> boilerplate blocks hardcode sizes; they are the exception, not the pattern).');

    return lines.join('\n');
}

/**
 * PDP routing context for EDS storefronts.
 *
 * Tells the AI what's not obvious from the code:
 *   1. Per-product URLs route through the canonical Adobe BYOM
 *      `content.overlay` pattern (replacement for deprecated folder
 *      mapping), NOT per-product DA pages.
 *   2. The full routing stack has four layers (pre-warming, overlay,
 *      Phase 2 template fetch, smart-404 recovery) — every AI suggestion
 *      should fit somewhere on this stack instead of inventing a new one.
 *   3. Don't suggest `aem-commerce-prerender` per-project, Tier 3 SSR
 *      (JSON-LD / Merchant Center), or folder mapping. All wrong for
 *      this design.
 */
export function buildPdpRouting(project: Project): string {
    if (!isEdsProject(project)) return '';

    return [
        '## PDP Routing (How Product Pages Work)',
        '',
        "Per-product URLs (`/products/{urlKey}/{sku}`) are routed automatically using Adobe's canonical BYOM `content.overlay` pattern (the documented replacement for deprecated folder mapping). **Do not** create per-product DA pages, **do not** configure folder mapping, and **do not** suggest deploying `aem-commerce-prerender` per project.",
        '',
        '**The four-layer routing stack:**',
        "1. **Pre-warming at create/reset** — Demo Builder enumerates the Commerce catalog and pre-publishes every SKU's PDP URL into Helix content-bus during setup. Equivalent to one cycle of the canonical scheduled poller, run synchronously. After this runs, every catalog product loads instantly on first click. Check reset logs for `[Catalog Prewarm] Complete: N/N succeeded`.",
        '2. **BYOM `content.overlay` registration** — Configuration Service points Helix at a shared `render-pdp` action. Registration shape matches `aem-commerce-prerender`\'s canonical setup wizard (`{ url, type: "markup", suffix: ".html" }`).',
        "3. **`render-pdp` returns SC's authored template** (Phase 2 LIVE since 2026-06-09) — the overlay fetches the storefront's authored `/products/default` and returns it for each product's page, with the product's real SKU added as `<meta name=\"sku\">` (the URL's SKU segment is cleaned the way Helix cleans every published path, so it is not the real SKU). SC customizations to `/products/default` (header, footer, custom blocks, layout) inherit on every real PDP automatically. Generic shell remains as a fallback when the authored template fetch fails. Custom blocks that link to a product must use `getProductLink(urlKey, sku)`.",
        "4. **Smart-404 client-side recovery** — vendored into `head.html`, `404.html`, and `delayed.js`. When a user visits a PDP URL that wasn't pre-warmed (catalog churn after setup, brand-new SKU), the snippet triggers `prepublish-pdp` to publish on demand and redirects. Closes the gap Adobe acknowledges in `adobe-rnd/aem-commerce-prerender` issue #262 (event-driven recovery, OPEN at https://github.com/adobe-rnd/aem-commerce-prerender/issues/262).",
        '',
        '**Visitor behavior:**',
        '- Pre-warmed SKU → instant (content-bus has it from setup)',
        '- New SKU added after setup → smart-404 cycle (~2s) on first visit → published to content-bus → instant thereafter',
        '- Mixed-case URLs from PLPs → eager `head.html` redirect to lowercase before any paint',
        '- Deleted SKU → cached HTML still serves; drop-in detects empty Commerce data (backlog item to redirect to native `/404`)',
        '',
        '**When PDPs 404 in a freshly-created storefront**, check in this order:',
        "1. Is `demoBuilder.byom.overlayUrl` configured? (default points at the team's shared deployment)",
        '2. Did the latest reset complete the pre-warming step? (check `[Catalog Prewarm]` log lines)',
        '3. Is the `render-pdp` overlay action reachable? (`curl <overlayUrl>`)',
        '4. Is the smart `/404.html` published? (`curl https://main--{repo}--{owner}.aem.live/404.html`)',
        '5. Did the Configuration Service write include `suffix: ".html"` on the overlay? (this aligns with canonical; missing it caused live-tier 404s in earlier debugging)',
        '',
        '**Things to NOT suggest** — these are wrong for this architecture:',
        "- Deploying `aem-commerce-prerender` per project (it's single-tenant; conflicts with our multi-tenant Configuration Service writes — see `reference_commerce_prerender_unfit` memory entry)",
        '- Server-side SSR injection (JSON-LD, og:image per SKU, Merchant Center metadata) — Tier 3 from the canonical pattern, deliberately omitted for demos',
        '- Folder mapping in any form — deprecated by Adobe',
        "- Manual per-product DA pages — colleague's workaround that doesn't scale",
        '',
        'Full architecture, request flows, and load-bearing dependencies: see `docs/architecture/eds-byom-pdp-routing.md`. Decision rationale and canonical anchoring: `docs/architecture/adr/005-byom-pdp-routing.md` (ADR-005).',
    ].join('\n');
}

// All values are sanitized before interpolation — see ./sanitization for the threat model.
// GitHub owner/repo values are double-sanitized: sanitizeTemplateValue first (strips Markdown
// control characters), then sanitizeGithubSlug (enforces the slug allowlist). Both layers
// are intentional — sanitizeGithubSlug's allowlist alone is sufficient, but the layering
// provides defense-in-depth and makes the sanitization intent explicit at each call site.
export function buildBlockLibraries(project: Project): string {
    if (!isEdsProject(project)) return '';

    const installed = project.installedBlockLibraries;
    if (!installed || installed.length === 0) return '';

    const customLibs = project.customBlockLibraries ?? [];
    const customKeys = new Set(customLibs.map((lib) => `${lib.source.owner}/${lib.source.repo}`));

    const lines: string[] = ['## Block Libraries'];

    for (const lib of installed) {
        // Owner/repo are NOT escaped — they're inside URL paths where backslash breaks things
        const owner = sanitizeGithubSlug(sanitizeTemplateValue(lib.source.owner));
        const repo = sanitizeGithubSlug(sanitizeTemplateValue(lib.source.repo));
        const type = customKeys.has(`${lib.source.owner}/${lib.source.repo}`)
            ? 'custom'
            : 'built-in';
        const blockList = lib.blockIds.map((id) => escapeMarkdown(sanitizeBlockId(id))).join(', ');
        const libName = escapeMarkdown(sanitizeTemplateValue(lib.name));

        lines.push('');
        lines.push(`- **${libName}** (${type})`);
        lines.push(`  - Source: https://github.com/${owner}/${repo}`);
        lines.push(`  - Blocks: ${blockList}`);
        if (lib.commitSha) {
            lines.push(
                `  - Source commit: ${escapeMarkdown(sanitizeTemplateValue(lib.commitSha))}`,
            );
        }
    }

    lines.push('');
    lines.push(
        '> Blocks are copied into the storefront repo during setup — they are NOT separate local',
    );
    lines.push(
        '> repositories. To edit a block, modify it in `blocks/` and call `sync_storefront` to push',
    );
    lines.push('> to the storefront.');
    lines.push('>');
    lines.push(
        '> Block libraries are read-only sources — edits to copied block files live in this',
    );
    lines.push(
        "> storefront's repo, not the library repo. Library promotion is a planned future Demo",
    );
    lines.push('> Builder feature.');

    return lines.join('\n');
}
