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
 */

const esbuild = require('esbuild');
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
// Extension host build
// ---------------------------------------------------------------------------
async function runExtensionBuild() {
    const ctx = await esbuild.context({
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
        loader: { '.node': 'copy' },
        plugins: [aliasPlugin],
        logLevel: 'info',
        metafile: true,
    });

    if (watch) {
        await ctx.watch();
        console.log('[esbuild] extension: watching…');
    } else {
        const result = await ctx.rebuild();
        logOutputSizes(result.metafile);
        await ctx.dispose();
    }
}

// ---------------------------------------------------------------------------
// Webview UI builds (one IIFE bundle per entry point)
// ---------------------------------------------------------------------------
const WEBVIEW_ENTRIES = {
    wizard:       'src/features/project-creation/ui/wizard/index.tsx',
    dashboard:    'src/features/dashboard/ui/index.tsx',
    configure:    'src/features/dashboard/ui/configure/index.tsx',
    sidebar:      'src/features/sidebar/ui/index.tsx',
    projectsList: 'src/features/projects-dashboard/ui/index.tsx',
};

async function runWebviewBuild() {
    const ctx = await esbuild.context({
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

    if (watch) {
        await ctx.watch();
        console.log('[esbuild] webview: watching…');
    } else {
        const result = await ctx.rebuild();
        logOutputSizes(result.metafile);
        await ctx.dispose();
    }
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
// Entry point
// ---------------------------------------------------------------------------
async function main() {
    const tasks = [];
    if (buildExtension) {
        tasks.push(runExtensionBuild());
    }
    if (buildWebviews) {
        tasks.push(runWebviewBuild());
    }
    await Promise.all(tasks);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
