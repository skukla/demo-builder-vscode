/**
 * Patch Content Index
 *
 * Exports all patch content modules for use by the template patch registry.
 * Each patch module exports searchPattern and replacement strings.
 */

import * as headerNavToolsDefensive from './header-nav-tools-defensive';
import * as aemAssetsSkuSanitization from './aem-assets-sku-sanitization';
import * as productLinkSkuEncoding from './product-link-sku-encoding';
import * as productLinkSkuSlashEncoding from './product-link-sku-slash-encoding';
import * as personalizationAuthGuard from './personalization-auth-guard';

/**
 * Map of patch ID to patch content module
 */
export const patchContent: Record<string, { searchPattern: string; replacement: string }> = {
    'header-nav-tools-defensive': headerNavToolsDefensive,
    'aem-assets-sku-sanitization': aemAssetsSkuSanitization,
    'product-link-sku-encoding': productLinkSkuEncoding,
    'product-link-sku-slash-encoding': productLinkSkuSlashEncoding,
    'personalization-auth-guard': personalizationAuthGuard,
};
