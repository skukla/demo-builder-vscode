/**
 * Shared setup for the dataInstallerParsers suites.
 *
 * The parsers are pure, so there is nothing to mock — what the two suites share
 * is their INPUT: the fixture loader, and the minimal wire row that carries
 * nothing but an identity.
 *
 * `dataInstallerParsers.test.ts` reads bodies CAPTURED FROM THE LIVE SERVICE and
 * scrubbed of identifiers, which is what makes it evidence rather than a restated
 * implementation — the published docs are wrong in seven places, so a
 * hand-written fixture would encode the doc's lie and pass against a client that
 * cannot work. `dataInstallerParsers-shapes.test.ts` covers what those captures
 * cannot reach: a field the service does not send, or sends with the wrong type.
 */

import * as path from 'path';

/** Where the captured responses live. */
export const FIXTURES = path.join(__dirname, '../../../fixtures/data-installer');

/** One captured response, by file name. */
export const loadFixture = (name: string): unknown => require(path.join(FIXTURES, name));

/**
 * A catalog row carrying only what an identity needs.
 *
 * `datapack_name` is the one field a row cannot be read without: a row missing it
 * has no identity and is skipped rather than emitted with an empty name.
 */
export const IDENTITY_ROW = { datapack_name: 'citisignal', version: 'main' };
