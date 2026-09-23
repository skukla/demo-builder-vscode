/**
 * Fixtures for the shared-demo probe, captured from three REAL repositories on
 * 2026-09-12 (contract tier, ADR-016): the shapes are the files' shapes, not
 * remembered ones. Values that identify an instance are replaced.
 *
 *   - `skukla/kukla-bodea`: a Demo Builder-generated EDS storefront (fstab,
 *     config.json with codes and the B2B flags, the B2B boilerplate's deps);
 *   - `adobe-commerce/boilerplate-b2b-template`: the B2B boilerplate itself
 *     (no fstab, no config.json; the B2B drop-ins in package.json; `is_template`);
 *   - `skukla/citisignal-nextjs`: a Next.js storefront (`next` in dependencies,
 *     default branch `master`, none of the EDS canonical files).
 */

import type { GitHubRepo } from '@/features/eds/services/types';

/** `GET /repos/{owner}/{repo}`, as `toGitHubRepo` keeps it. */
export const REPOS: Record<string, GitHubRepo> = {
    'skukla/kukla-bodea': {
        id: 1,
        name: 'kukla-bodea',
        fullName: 'skukla/kukla-bodea',
        htmlUrl: 'https://github.com/skukla/kukla-bodea',
        cloneUrl: 'https://github.com/skukla/kukla-bodea.git',
        defaultBranch: 'main',
        isTemplate: false,
    },
    'adobe-commerce/boilerplate-b2b-template': {
        id: 2,
        name: 'boilerplate-b2b-template',
        fullName: 'adobe-commerce/boilerplate-b2b-template',
        htmlUrl: 'https://github.com/adobe-commerce/boilerplate-b2b-template',
        cloneUrl: 'https://github.com/adobe-commerce/boilerplate-b2b-template.git',
        defaultBranch: 'main',
        isTemplate: true,
    },
    'skukla/citisignal-nextjs': {
        id: 3,
        name: 'citisignal-nextjs',
        fullName: 'skukla/citisignal-nextjs',
        htmlUrl: 'https://github.com/skukla/citisignal-nextjs',
        cloneUrl: 'https://github.com/skukla/citisignal-nextjs.git',
        defaultBranch: 'master',
        isTemplate: false,
    },
};

/** The B2B boilerplate's dependency names (kukla-bodea carries the same list). */
export const B2B_TEMPLATE_DEPENDENCIES = [
    '@adobe/adobe-client-data-layer',
    '@adobe/magento-storefront-event-collector',
    '@adobe/magento-storefront-events-sdk',
    '@dropins/storefront-account',
    '@dropins/storefront-auth',
    '@dropins/storefront-cart',
    '@dropins/storefront-checkout',
    '@dropins/storefront-company-management',
    '@dropins/storefront-company-switcher',
    '@dropins/storefront-order',
    '@dropins/storefront-payment-services',
    '@dropins/storefront-pdp',
    '@dropins/storefront-personalization',
    '@dropins/storefront-product-discovery',
    '@dropins/storefront-purchase-order',
    '@dropins/storefront-quick-order',
    '@dropins/storefront-quote-management',
    '@dropins/storefront-recommendations',
    '@dropins/storefront-requisition-list',
    '@dropins/storefront-wishlist',
    '@dropins/tools',
];

/** A B2C boilerplate's list is the same minus the five B2B drop-ins. */
export const B2C_DEPENDENCIES = B2B_TEMPLATE_DEPENDENCIES.filter(
    (name) =>
        ![
            '@dropins/storefront-company-management',
            '@dropins/storefront-company-switcher',
            '@dropins/storefront-purchase-order',
            '@dropins/storefront-quote-management',
            '@dropins/storefront-requisition-list',
        ].includes(name),
);

export const NEXTJS_DEPENDENCIES = [
    '@headlessui/react',
    '@heroicons/react',
    '@types/dompurify',
    'class-variance-authority',
    'clsx',
    'dompurify',
    'graphql',
    'lucide-react',
    'next',
    'react',
    'react-dom',
    'swr',
    'tailwind-merge',
];

export function packageJson(dependencies: string[]): string {
    return JSON.stringify({
        name: 'fixture',
        dependencies: Object.fromEntries(dependencies.map((name) => [name, '1.0.0'])),
    });
}

/** kukla-bodea's `fstab.yaml`, verbatim. */
export const BODEA_FSTAB = 'mountpoints:\n  /: https://content.da.live/skukla/kukla-bodea/\n';

/** kukla-bodea's `config.json`, with the instance endpoint replaced. */
export const BODEA_CONFIG_JSON = JSON.stringify({
    public: {
        default: {
            'commerce-core-endpoint': 'https://example.invalid/graphql',
            'commerce-endpoint': 'https://example.invalid/graphql',
            'commerce-assets-enabled': true,
            headers: {
                all: { Store: 'bodea_us' },
                cs: {
                    'Magento-Customer-Group': '',
                    'Magento-Store-Code': 'bodea_store',
                    'Magento-Store-View-Code': 'bodea_us',
                    'Magento-Website-Code': 'bodea',
                },
            },
            analytics: { 'store-id': 1 },
            'commerce-b2b-enabled': true,
            'commerce-companies-enabled': true,
        },
    },
});

/** The canonical EDS files, present on both EDS repos and absent on the Next.js one. */
export const EDS_CANONICAL = ['scripts/scripts.js', 'scripts/delayed.js', 'head.html'];
