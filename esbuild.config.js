/**
 * esbuild configuration for bundling the VS Code extension host
 *
 * This bundles all extension code into a single file, dramatically reducing
 * the VSIX size by eliminating the need to ship node_modules.
 */

const esbuild = require('esbuild');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Plugin to resolve path aliases (@/core, @/features, etc.)
 * Handles TypeScript extensions and barrel files (index.ts)
 */
const aliasPlugin = {
    name: 'alias',
    setup(build) {
        const fs = require('fs');

        // Resolve @/ aliases to src/
        build.onResolve({ filter: /^@\// }, args => {
            const aliasPath = args.path.replace(/^@\//, '');
            const basePath = path.resolve(__dirname, 'src', aliasPath);

            // Try direct file with extensions
            const extensions = ['.ts', '.tsx', '.js', '.jsx', ''];
            for (const ext of extensions) {
                const filePath = basePath + ext;
                if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                    return { path: filePath };
                }
            }

            // Try as directory with index file
            if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
                for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
                    const indexPath = path.join(basePath, 'index' + ext);
                    if (fs.existsSync(indexPath)) {
                        return { path: indexPath };
                    }
                }
            }

            // Fall back to original resolution
            return { path: basePath };
        });
    },
};

/**
 * Plugin to mark problematic modules as external
 * Some modules with native bindings or dynamic requires can't be bundled
 */
const externalsPlugin = {
    name: 'externals',
    setup(build) {
        // Mark native/problematic modules as external if needed
        // These will need to be in node_modules at runtime
        const externalModules = [
            // Add any modules that fail to bundle here
        ];

        for (const mod of externalModules) {
            build.onResolve({ filter: new RegExp(`^${mod}$`) }, () => ({
                external: true,
            }));
        }
    },
};

async function main() {
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
            'vscode', // Provided by VS Code runtime
            'fs', // Node.js fs module - externalize to prevent minification issues with fs/promises vs fs
        ],
        loader: {
            '.node': 'copy', // Handle native modules if any
        },
        plugins: [
            aliasPlugin,
            externalsPlugin,
        ],
        // Log level
        logLevel: 'info',
        // Metafile for bundle analysis
        metafile: true,
    });

    if (watch) {
        await ctx.watch();
        console.log('[esbuild] Watching for changes...');
    } else {
        const result = await ctx.rebuild();

        // Log bundle size
        if (result.metafile) {
            const outputs = Object.entries(result.metafile.outputs);
            for (const [file, info] of outputs) {
                const size = (info.bytes / 1024 / 1024).toFixed(2);
                console.log(`[esbuild] ${file}: ${size} MB`);
            }
        }

        await ctx.dispose();
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
