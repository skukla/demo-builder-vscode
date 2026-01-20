/**
 * Patch: header-nav-tools-defensive
 *
 * Makes header.js defensive when nav-tools section is missing.
 * DA.live strips empty divs during content processing, causing nav to have
 * only 2 sections (brand, sections) instead of 3 (brand, sections, tools).
 * Without this patch, header.js crashes with "Cannot read properties of null".
 */

export const searchPattern = `const navTools = nav.querySelector('.nav-tools');`;

export const replacement = /* js */ `let navTools = nav.querySelector('.nav-tools');

  // Create nav-tools section if it doesn't exist in nav structure
  // This handles nav content with only 2 sections (brand, sections)
  // instead of 3 (brand, sections, tools) - prevents null reference errors
  if (!navTools) {
    navTools = document.createElement('div');
    navTools.classList.add('nav-tools');
    nav.appendChild(navTools);
  }`;
