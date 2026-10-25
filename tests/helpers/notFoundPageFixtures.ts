/**
 * The B2B template's real import maps, trimmed to the entries that matter (EDS-45): head.html
 * names the company switcher, the template's 404.html does not, so every missing page drew
 * blank (seen on skukla/my-commerce-demo, 2026-10-15).
 */

export const HEAD = `<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script nonce="aem" type="importmap">
    {
        "imports": {
            "@dropins/storefront-auth/": "/scripts/__dropins__/storefront-auth/",
            "@dropins/storefront-cart/": "/scripts/__dropins__/storefront-cart/",
            "@dropins/storefront-company-switcher/": "/scripts/__dropins__/storefront-company-switcher/",
            "@dropins/tools/": "/scripts/__dropins__/tools/"
        }
    }
</script>
`;

export const NOT_FOUND = `<!DOCTYPE html>
<html>
<head>
  <title>Page not found</title>
  <script nonce="aem" type="importmap">
    {
        "imports": {
            "@dropins/tools/": "/scripts/__dropins__/tools/",
            "@dropins/storefront-cart/": "/scripts/__dropins__/storefront-cart/",
            "@dropins/storefront-auth/": "/scripts/__dropins__/storefront-auth/"
        }
    }
  </script>
  <script nonce="aem" type="text/javascript">
    window.isErrorPage = true;
  </script>
</head>
<body><main class="error"><h2 class="error-message">Page Not Found</h2></main></body>
</html>
`;

/** The `imports` of a page's import map. */
export function importsOf(html: string): Record<string, string> {
    const body = /<script\b[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/i.exec(html)?.[1] ?? '{}';
    return (JSON.parse(body) as { imports: Record<string, string> }).imports;
}
