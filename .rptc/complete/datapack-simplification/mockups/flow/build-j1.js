/* Build the prototype bundle (every journey; entry Screen.tsx) with the extension's own alias resolution and CSS layering. */
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '../../../../..');
process.chdir(root);
const { aliasPlugin, LAYER_ORDER } = require(path.join(root, 'esbuild.config.js'));

// A copy of esbuild.config.js's makeCssInjectionPlugin({ layerVendor: true }), which it does not export.
const cssPlugin = {
    name: 'css-injection',
    setup(build) {
        build.onLoad({ filter: /\.css$/ }, async (args) => {
            const raw = await fs.promises.readFile(args.path, 'utf8');
            const vendor = args.path.includes('node_modules');
            const css = `${LAYER_ORDER}\n${vendor ? `@layer vendor {\n${raw}\n}` : raw}`;
            return { contents: `const __s=document.createElement('style');__s.textContent=${JSON.stringify(css)};document.head.appendChild(__s);`, loader: 'js' };
        });
    },
};

const out = process.argv[2] || '/tmp/vr-proto';
esbuild
    .build({
        entryPoints: [path.join(__dirname, 'Screen.tsx')],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: ['chrome91'],
        outfile: path.join(out, 'j1-bundle.js'),
        tsconfig: path.join(__dirname, 'tsconfig.json'),
        loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.gif': 'dataurl' },
        define: { 'process.env.NODE_ENV': '"development"' },
        plugins: [aliasPlugin, cssPlugin],
        logLevel: 'warning',
    })
    .then(() => fs.copyFileSync(path.join(__dirname, 'proto-j1.html'), path.join(out, 'proto-j1.html')))
    .catch(() => process.exit(1));
