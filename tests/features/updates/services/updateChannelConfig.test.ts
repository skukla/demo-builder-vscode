/**
 * Schema guard for the demoBuilder.updateChannel contribution point.
 *
 * Ensures the early-access channel stays wired into package.json so the
 * setting can't silently regress to stable/beta only.
 */

import * as fs from 'fs';
import * as path from 'path';

interface ConfigProperty {
    enum?: string[];
    default?: string;
    description?: string;
}

function getUpdateChannelProperty(): ConfigProperty {
    const pkgPath = path.join(__dirname, '../../../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const configs: Array<{ properties?: Record<string, ConfigProperty> }> =
        pkg.contributes.configuration;
    for (const section of configs) {
        const prop = section.properties?.['demoBuilder.updateChannel'];
        if (prop) return prop;
    }
    throw new Error('demoBuilder.updateChannel not found in package.json');
}

describe('demoBuilder.updateChannel contribution', () => {
    it('exposes stable, beta, and early-access', () => {
        expect(getUpdateChannelProperty().enum).toEqual(['stable', 'beta', 'early-access']);
    });

    it('defaults to stable', () => {
        expect(getUpdateChannelProperty().default).toBe('stable');
    });

    it('documents the early-access gate in its description', () => {
        const description = (getUpdateChannelProperty().description ?? '').toLowerCase();
        expect(description).toContain('early-access');
        expect(description).toContain('collaborator');
    });
});
