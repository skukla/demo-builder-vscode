/**
 * Jest transformer for .md and .md.template files.
 * Returns the file content as a default string export,
 * matching the esbuild text loader behavior used in production builds.
 */

/* global module */

module.exports = {
    process(sourceText) {
        return { code: `module.exports = ${JSON.stringify(sourceText)};` };
    },
};
