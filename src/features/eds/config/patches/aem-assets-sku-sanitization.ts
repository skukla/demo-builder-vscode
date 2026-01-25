/**
 * Patch: aem-assets-sku-sanitization
 *
 * Auto-sanitizes SKU aliases in AEM Assets URL generation.
 * Product SKUs containing forward slashes (e.g., "apple-iphone-se/iphone-se")
 * create invalid AEM Assets URLs. This patch modifies the dropin's
 * makeAemAssetsImageSlot function to replace slashes with dashes automatically.
 *
 * This single patch replaces the need to patch 16+ individual block files.
 *
 * Before: /as/apple-iphone-se/iphone-se.webp (404 error)
 * After:  /as/apple-iphone-se-iphone-se.webp (works correctly)
 */

// The minified code pattern in makeAemAssetsImageSlot function:
// - `m` is the alias parameter
// - `w` is generateAemAssetsOptimizedUrl function
// - We add sanitization before the alias is used
export const searchPattern = `const{wrapper:s,alias:m,params:r,imageProps:i}=e;if(!i.src)throw new Error("An image source is required. Please provide a \`src\` or \`imageProps.src\`.");const n=s??document.createElement("div"),o=w(i.src,m,r)`;

export const replacement = `const{wrapper:s,alias:m,params:r,imageProps:i}=e;const sanitizedAlias=m.replace(/\\//g,"-");if(!i.src)throw new Error("An image source is required. Please provide a \`src\` or \`imageProps.src\`.");const n=s??document.createElement("div"),o=w(i.src,sanitizedAlias,r)`;
