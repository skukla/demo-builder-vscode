/**
 * esbuild configuration for bundling the VS Code extension and webview UI.
 *
 * Extension host: CJS bundle, Node platform, single output file.
 * Webview UI:     IIFE bundles, browser platform, one file per entry point.
 *                 CSS imports are injected as <style> tags at runtime (mirrors
 *                 webpack style-loader behaviour, no separate .css files needed).
 *
 * Flags:
 *   --production       Minify output, no source maps
 *   --watch            Rebuild on file changes
 *   --extension-only   Build extension host only
 *   --webview-only     Build webview UI only
 *
 * Watch mode uses a POLLING chokidar watcher (not esbuild's ctx.watch()): the
 * latter is fsevents-based and silently drops change events under heavy
 * concurrent filesystem load (e.g. when a test run + tsc + lint fire right after
 * an edit), so the bundle would go stale. Polling diffs file state, so it can't
 * miss a change; a debounce coalesces bursts and a single-flight queue guarantees
 * the final change always rebuilds. See startWatch().
 */

const esbuild = require('esbuild');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const extensionOnly = process.argv.includes('--extension-only');
const webviewOnly = process.argv.includes('--webview-only');

const buildExtension = !webviewOnly;
const buildWebviews = !extensionOnly;

// ---------------------------------------------------------------------------
// Plugin: resolve @/ path aliases to src/
// ---------------------------------------------------------------------------
const aliasPlugin = {
    name: 'alias',
    setup(build) {
        build.onResolve({ filter: /^@\// }, args => {
            const aliasPath = args.path.replace(/^@\//, '');
            const basePath = path.resolve(__dirname, 'src', aliasPath);

            // Try direct file with common extensions
            for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
                const filePath = basePath + ext;
                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    return { path: filePath };
                }
            }

            // Try index file inside directory
            if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
                for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
                    const indexPath = path.join(basePath, 'index' + ext);
                    if (fs.existsSync(indexPath)) {
                        return { path: indexPath };
                    }
                }
            }

            return { path: basePath };
        });
    },
};

// ---------------------------------------------------------------------------
// Plugin: convert CSS imports to style-tag injection (replaces style-loader)
// ---------------------------------------------------------------------------
const cssInjectionPlugin = {
    name: 'css-injection',
    setup(build) {
        build.onLoad({ filter: /\.css$/ }, async (args) => {
            const css = await fs.promises.readFile(args.path, 'utf8');
            return {
                contents: `
const __s = document.createElement('style');
__s.textContent = ${JSON.stringify(css)};
document.head.appendChild(__s);
`,
                loader: 'js',
            };
        });
    },
};

// ---------------------------------------------------------------------------
// Build stamp — write dist/build-info.json naming the checkout, branch, commit
// and build time.
//
// Why: launch.json passes --extensionDevelopmentPath=${workspaceFolder}, so F5
// binds the Extension Dev Host to whichever WINDOW had focus. On 2026-08-12 two
// dist/ trees existed (main checkout + a worktree) and the Dev Host loaded the
// other one — every change was invisible, with nothing anywhere naming the build
// that was actually running. This stamp is what makes that answerable.
//
// Never fails the build: git may be absent, or this may be an archive export.
// ---------------------------------------------------------------------------
function gitOutput(args) {
    try {
        return require('child_process')
            .execFileSync('git', args, { cwd: __dirname, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
            .trim();
    } catch {
        return '';
    }
}

function writeBuildInfo() {
    try {
        fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
        const info = {
            checkoutPath: __dirname,
            branch: gitOutput(['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown',
            commit: gitOutput(['rev-parse', '--short', 'HEAD']) || 'unknown',
            dirty: gitOutput(['status', '--porcelain']).length > 0,
            builtAt: new Date().toISOString(),
        };
        fs.writeFileSync(
            path.join(__dirname, 'dist', 'build-info.json'),
            JSON.stringify(info, null, 2) + '\n',
        );
        return info;
    } catch (e) {
        console.warn('[build] could not write build-info.json:', e.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// Create a context, run the initial build, and return it for watch mode.
// In non-watch mode the context is built once and disposed.
// ---------------------------------------------------------------------------
async function startContext(name, options) {
    const ctx = await esbuild.context(options);
    const result = await ctx.rebuild();
    logOutputSizes(result.metafile);
    if (!watch) {
        await ctx.dispose();
        return null;
    }
    console.log(`[esbuild] ${name}: built`);
    return { ctx, name };
}

// ---------------------------------------------------------------------------
// Extension host build
// ---------------------------------------------------------------------------
function runExtensionBuild() {
    return startContext('extension', {
        entryPoints: ['src/extension.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/extension.js',
        external: [
            'vscode',
            // Externalise fs so fs/promises and fs don't get merged — Node provides both at runtime.
            'fs',
        ],
        loader: { '.node': 'copy', '.md': 'text', '.md.template': 'text' },
        plugins: [aliasPlugin],
        logLevel: 'info',
        metafile: true,
    });
}

// ---------------------------------------------------------------------------
// MCP proxy build (stdio→UDS forwarder spawned by Claude Code — no vscode)
// ---------------------------------------------------------------------------
function runMcpProxyBuild() {
    return startContext('mcp-proxy', {
        entryPoints: ['src/mcp-proxy.ts'],
        bundle: true,
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: 'dist/mcp-proxy.js',
        external: ['vscode', 'fs', 'path', 'os', 'child_process', 'crypto', 'util', 'net'],
        plugins: [aliasPlugin],
        logLevel: 'info',
        metafile: true,
    });
}

// ---------------------------------------------------------------------------
// Webview UI builds (one IIFE bundle per entry point)
// ---------------------------------------------------------------------------
const WEBVIEW_ENTRIES = {
    wizard:       'src/features/project-creation/ui/wizard/index.tsx',
    // main.tsx, not index.tsx: an index.ts barrel sits beside it, and tsc keeps
    // only one file per basename — an index.tsx entry here is never typechecked.
    dashboard:    'src/features/dashboard/ui/main.tsx',
    configure:    'src/features/dashboard/ui/configure/index.tsx',
    sidebar:      'src/features/sidebar/ui/index.tsx',
    projectsList: 'src/features/projects-dashboard/ui/index.tsx',
    // Standalone AI surface (Batch E1) — webview behind `demoBuilder.openAi`.
    aiOverview:   'src/features/dashboard/ui/aiSurface/index.tsx',
    // Dedicated integrations surface — webview behind `demoBuilder.showIntegrations`.
    integrations: 'src/features/dashboard/ui/integrationsSurface/index.tsx',
    // Standalone Data Installer surface — webview behind `demoBuilder.showDataInstaller`.
    dataInstaller: 'src/features/data-installer/ui/index.tsx',
};

function runWebviewBuild() {
    return startContext('webview', {
        entryPoints: WEBVIEW_ENTRIES,
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['chrome91'], // VS Code ships Chromium 91+
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        outdir: 'dist/webview',
        entryNames: '[name]-bundle',
        loader: {
            '.png': 'dataurl',
            '.jpg': 'dataurl',
            '.svg': 'dataurl',
            '.gif': 'dataurl',
        },
        define: {
            // Required for React's dead-code elimination of development warnings
            'process.env.NODE_ENV': production ? '"production"' : '"development"',
        },
        plugins: [aliasPlugin, cssInjectionPlugin],
        logLevel: 'info',
        metafile: true,
    });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function logOutputSizes(metafile) {
    if (!metafile) {
        return;
    }
    for (const [file, info] of Object.entries(metafile.outputs)) {
        const kb = (info.bytes / 1024).toFixed(1);
        console.log(`[esbuild] ${file}: ${kb} KB`);
    }
}

// ---------------------------------------------------------------------------
// Robust watch: poll src/ with chokidar and drive incremental ctx.rebuild().
//
// Why polling: esbuild's ctx.watch() (and chokidar's default fsevents) drop
// change events when the filesystem is under heavy concurrent load — e.g. a full
// jest run + tsc + lint firing right after an edit — leaving the bundle stale.
// Polling compares file state each interval, so a change is never missed; the
// debounce coalesces rapid bursts and the single-flight queue (`building` +
// `pending`) guarantees the LAST change still rebuilds even if it lands mid-build.
// All contexts rebuild on any src change — esbuild's incremental rebuilds reuse
// each context's cache, so this stays fast (and avoids brittle path routing for
// files shared between the extension and webview).
// ---------------------------------------------------------------------------
function startWatch(contexts) {
    let debounce = null;
    let building = false;
    let pending = false;

    const rebuildAll = async () => {
        if (building) {
            pending = true;
            return;
        }
        building = true;
        const started = Date.now();
        try {
            for (const { ctx } of contexts) {
                const result = await ctx.rebuild();
                logOutputSizes(result.metafile);
            }
            // Re-stamp on every rebuild: builtAt is what the staleness check
            // compares against, so a stamp frozen at watcher start would report
            // every later rebuild as stale.
            writeBuildInfo();
            console.log(`[watch] rebuilt in ${Date.now() - started}ms`);
        } catch (e) {
            console.error('[watch] rebuild failed:', e.message);
        } finally {
            building = false;
            if (pending) {
                pending = false;
                schedule();
            }
        }
    };

    const schedule = () => {
        clearTimeout(debounce);
        debounce = setTimeout(rebuildAll, 100);
    };

    const watcher = chokidar.watch('src', {
        ignoreInitial: true,
        usePolling: true,
        interval: 250,
        binaryInterval: 500,
        // Wait for writes to settle so we never bundle a half-written file.
        awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
    });

    watcher.on('all', (event, file) => {
        console.log(`[watch] ${event}: ${file}`);
        schedule();
    });
    watcher.on('error', err => console.error('[watch] watcher error:', err));

    console.log('[watch] polling src/ via chokidar — robust against dropped fs events');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
    const tasks = [];
    if (buildExtension) {
        tasks.push(runExtensionBuild());
        tasks.push(runMcpProxyBuild());
    }
    if (buildWebviews) {
        tasks.push(runWebviewBuild());
    }
    const contexts = (await Promise.all(tasks)).filter(Boolean);

    const info = writeBuildInfo();
    if (info) {
        console.log(`[build] ${info.branch}@${info.commit}${info.dirty ? '+' : ''} from ${info.checkoutPath}`);
    }

    if (watch) {
        startWatch(contexts);
    }
}

// Only build when RUN, not when required.
//
// `tests/sop/stylesheet-bundles.test.ts` requires this file to reuse the
// real WEBVIEW_ENTRIES and the real alias resolution. Without this guard that
// require would kick off a full build. The exports below exist so the check
// cannot drift from the build it is checking — a second copy of the alias
// resolver would eventually disagree with this one, and the check would be
// confidently wrong about which files are in a bundle.
if (require.main === module) {
    main().catch(e => {
        console.error(e);
        process.exit(1);
    });
}

module.exports = { WEBVIEW_ENTRIES, aliasPlugin };
