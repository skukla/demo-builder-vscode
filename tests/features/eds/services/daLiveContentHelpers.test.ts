import {
    transformHtmlForDaLive,
    buildSourceUrl,
    resolveDaPath,
} from '@/features/eds/services/daLiveContentHelpers';

describe('daLiveContentHelpers', () => {
    describe('transformHtmlForDaLive', () => {
        const base = 'https://main--site--org.aem.live';

        it('wraps content in the DA.live document shell', () => {
            expect(transformHtmlForDaLive('<p>hi</p>', base)).toBe(
                `<body><header></header><main><p>hi</p></main><footer></footer></body>`
            );
        });

        it('rewrites ./media_ URLs to absolute source-CDN URLs', () => {
            const out = transformHtmlForDaLive('<img src="./media_abc123.png">', base);
            expect(out).toContain(`src="${base}/media_abc123.png"`);
        });

        it('rewrites /media_ URLs to absolute source-CDN URLs', () => {
            const out = transformHtmlForDaLive('<img src="/media_abc123.png">', base);
            expect(out).toContain(`src="${base}/media_abc123.png"`);
        });

        it('preserves query params on media URLs', () => {
            const out = transformHtmlForDaLive('<img src="./media_abc123.png?width=750">', base);
            expect(out).toContain(`src="${base}/media_abc123.png?width=750"`);
        });

        it('replaces empty structural divs with a preserved placeholder', () => {
            expect(transformHtmlForDaLive('<div></div>', base)).toContain(
                '<div><p>&nbsp;</p></div>'
            );
            expect(transformHtmlForDaLive('<div>  </div>', base)).toContain(
                '<div><p>&nbsp;</p></div>'
            );
        });
    });

    describe('buildSourceUrl', () => {
        const base = 'https://main--site--org.aem.live';

        it('returns the raw path for non-HTML content', () => {
            expect(buildSourceUrl(base, '/media_x.png', false)).toBe(`${base}/media_x.png`);
        });

        it('appends index.plain.html for the root and trailing-slash paths', () => {
            expect(buildSourceUrl(base, '/', true)).toBe(`${base}/index.plain.html`);
            expect(buildSourceUrl(base, '/nav/', true)).toBe(`${base}/nav/index.plain.html`);
        });

        it('appends .plain.html for a leaf HTML path', () => {
            expect(buildSourceUrl(base, '/products', true)).toBe(`${base}/products.plain.html`);
        });
    });

    describe('resolveDaPath', () => {
        it('leaves non-HTML paths at their normalized form', () => {
            expect(resolveDaPath('/media_x.png', false)).toBe('media_x.png');
        });

        it('appends .html to a leaf HTML path', () => {
            expect(resolveDaPath('/products', true)).toBe('products.html');
        });

        it('appends index.html for empty and trailing-slash HTML paths', () => {
            expect(resolveDaPath('/', true)).toBe('index.html');
            expect(resolveDaPath('/nav/', true)).toBe('nav/index.html');
        });

        it('leaves a path that already ends in .html untouched', () => {
            expect(resolveDaPath('/products.html', true)).toBe('products.html');
        });
    });
});
