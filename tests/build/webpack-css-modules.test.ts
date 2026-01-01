/**
 * Webpack CSS Modules Configuration Tests
 *
 * TDD: Tests written FIRST to define behavior before implementation.
 *
 * These tests verify that webpack is correctly configured to support CSS Modules
 * (*.module.css files) alongside existing global CSS imports.
 *
 * Requirements:
 * 1. CSS Modules rule must exist with test: /\.module\.css$/
 * 2. CSS Modules must have localIdentName pattern for scoped class names
 * 3. Global CSS rule must exclude CSS Modules files
 * 4. CSS Modules rule must come BEFORE global CSS rule in webpack config
 */

import * as path from 'path';

describe('Webpack CSS Modules Configuration', () => {
    // Load webpack config fresh for each test to avoid state pollution
    const getWebpackConfig = () => {
        // Clear require cache to get fresh config
        const configPath = path.resolve(__dirname, '../../webpack.config.js');
        delete require.cache[require.resolve(configPath)];
        return require(configPath);
    };

    describe('CSS Modules rule', () => {
        it('should have a rule for CSS Module files (*.module.css)', () => {
            // Given: The webpack configuration
            const config = getWebpackConfig();

            // When: We search for CSS Modules rule
            const cssModulesRule = config.module.rules.find(
                (rule: { test?: RegExp }) =>
                    rule.test && rule.test.toString() === '/\\.module\\.css$/'
            );

            // Then: The rule should exist
            expect(cssModulesRule).toBeDefined();
            expect(cssModulesRule.test.test('component.module.css')).toBe(true);
            expect(cssModulesRule.test.test('styles.module.css')).toBe(true);
            expect(cssModulesRule.test.test('regular.css')).toBe(false);
        });

        it('should use css-loader with modules option enabled', () => {
            // Given: The webpack configuration
            const config = getWebpackConfig();

            // When: We find the CSS Modules rule
            const cssModulesRule = config.module.rules.find(
                (rule: { test?: RegExp }) =>
                    rule.test && rule.test.toString() === '/\\.module\\.css$/'
            );

            // Then: It should have css-loader with modules configuration
            expect(cssModulesRule).toBeDefined();
            expect(cssModulesRule.use).toBeDefined();

            // Find css-loader in the use array
            const cssLoader = cssModulesRule.use.find(
                (loader: string | { loader: string }) =>
                    typeof loader === 'object' && loader.loader === 'css-loader'
            );

            expect(cssLoader).toBeDefined();
            expect(cssLoader.options).toBeDefined();
            expect(cssLoader.options.modules).toBeDefined();
        });

        it('should have localIdentName pattern for scoped class names', () => {
            // Given: The webpack configuration
            const config = getWebpackConfig();

            // When: We find the CSS Modules rule and its css-loader config
            const cssModulesRule = config.module.rules.find(
                (rule: { test?: RegExp }) =>
                    rule.test && rule.test.toString() === '/\\.module\\.css$/'
            );
            const cssLoader = cssModulesRule?.use?.find(
                (loader: string | { loader: string }) =>
                    typeof loader === 'object' && loader.loader === 'css-loader'
            );

            // Then: localIdentName should follow the pattern [name]__[local]--[hash:base64:5]
            expect(cssLoader.options.modules.localIdentName).toBe(
                '[name]__[local]--[hash:base64:5]'
            );
        });

        it('should include style-loader before css-loader', () => {
            // Given: The webpack configuration
            const config = getWebpackConfig();

            // When: We find the CSS Modules rule
            const cssModulesRule = config.module.rules.find(
                (rule: { test?: RegExp }) =>
                    rule.test && rule.test.toString() === '/\\.module\\.css$/'
            );

            // Then: style-loader should be first in the use array
            expect(cssModulesRule.use[0]).toBe('style-loader');
        });
    });

    describe('Global CSS rule', () => {
        it('should exclude CSS Module files from global CSS rule', () => {
            // Given: The webpack configuration
            const config = getWebpackConfig();

            // When: We find the global CSS rule (test: /\.css$/)
            const globalCssRule = config.module.rules.find(
                (rule: { test?: RegExp; exclude?: RegExp }) =>
                    rule.test &&
                    rule.test.toString() === '/\\.css$/' &&
                    rule.exclude
            );

            // Then: It should exclude .module.css files
            expect(globalCssRule).toBeDefined();
            expect(globalCssRule.exclude.test('component.module.css')).toBe(true);
            expect(globalCssRule.exclude.test('styles.module.css')).toBe(true);
            expect(globalCssRule.exclude.test('global.css')).toBe(false);
        });

        it('should still work for regular CSS files', () => {
            // Given: The webpack configuration
            const config = getWebpackConfig();

            // When: We find the global CSS rule
            const globalCssRule = config.module.rules.find(
                (rule: { test?: RegExp; exclude?: RegExp }) =>
                    rule.test &&
                    rule.test.toString() === '/\\.css$/' &&
                    rule.exclude
            );

            // Then: Regular CSS files should match the test pattern
            expect(globalCssRule.test.test('styles.css')).toBe(true);
            expect(globalCssRule.test.test('global.css')).toBe(true);
            // But should not match module.css (handled by exclusion)
        });
    });

    describe('Rule ordering', () => {
        it('should have CSS Modules rule BEFORE global CSS rule', () => {
            // Given: The webpack configuration
            const config = getWebpackConfig();

            // When: We find the indices of both rules
            const rules = config.module.rules;

            const cssModulesIndex = rules.findIndex(
                (rule: { test?: RegExp }) =>
                    rule.test && rule.test.toString() === '/\\.module\\.css$/'
            );

            const globalCssIndex = rules.findIndex(
                (rule: { test?: RegExp; exclude?: RegExp }) =>
                    rule.test &&
                    rule.test.toString() === '/\\.css$/' &&
                    rule.exclude
            );

            // Then: CSS Modules rule should come before global CSS rule
            // This is critical because webpack processes rules in order
            expect(cssModulesIndex).toBeGreaterThan(-1);
            expect(globalCssIndex).toBeGreaterThan(-1);
            expect(cssModulesIndex).toBeLessThan(globalCssIndex);
        });
    });

    describe('Integration verification', () => {
        it('should have exactly two CSS-related rules', () => {
            // Given: The webpack configuration
            const config = getWebpackConfig();

            // When: We count CSS-related rules
            const cssRules = config.module.rules.filter(
                (rule: { test?: RegExp }) =>
                    rule.test && /css/.test(rule.test.toString())
            );

            // Then: There should be exactly 2 CSS rules
            // (CSS Modules + Global CSS)
            expect(cssRules).toHaveLength(2);
        });

        it('should not have duplicate css-loader configurations', () => {
            // Given: The webpack configuration
            const config = getWebpackConfig();

            // When: We check each CSS rule
            const cssRules = config.module.rules.filter(
                (rule: { test?: RegExp }) =>
                    rule.test && /css/.test(rule.test.toString())
            );

            // Then: Each rule should have distinct configuration
            const cssModulesRule = cssRules.find(
                (rule: { test?: RegExp }) =>
                    rule.test?.toString() === '/\\.module\\.css$/'
            );
            const globalCssRule = cssRules.find(
                (rule: { test?: RegExp }) =>
                    rule.test?.toString() === '/\\.css$/'
            );

            // CSS Modules rule should have modules option
            const cssModulesLoader = cssModulesRule?.use?.find(
                (l: string | { loader: string }) =>
                    typeof l === 'object' && l.loader === 'css-loader'
            );
            expect(cssModulesLoader?.options?.modules).toBeDefined();

            // Global CSS rule should NOT have modules option (uses array shorthand)
            expect(globalCssRule?.use).toEqual(['style-loader', 'css-loader']);
        });
    });
});
