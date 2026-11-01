/**
 * The keys and tokens a private ACO catalog view takes (PL-60). Adobe's docs: an RSA key of 2048 to 8192
 * bits, the public half registered in PEM SPKI form, and an RS256 JWT sent as
 * `AC-Catalog-View-Access-Token`. Its only required claim is `exp`, and an hour is what Commerce's
 * own default is, so that is what this signs.
 *
 * @module features/data-installer/services/aco/acoAccessToken
 */

import * as crypto from 'crypto';

/** The smallest key ACO takes. */
const KEY_BITS = 2048;

/** How long a token lasts, in seconds. */
const TOKEN_LIFE_SECONDS = 3600;

/** A new key pair, both halves in PEM. */
export function generateAcoKeyPair(): { publicKey: string; privateKey: string } {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: KEY_BITS,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
}

const encoded = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/**
 * A signed token for a private view.
 *
 * @param privateKey - the key's private half, PEM
 * @param now - the current time in milliseconds
 */
export function signAcoViewToken(privateKey: string, now: number = Date.now()): string {
    const unsigned = `${encoded({ alg: 'RS256', typ: 'JWT' })}.${encoded({ exp: Math.floor(now / 1000) + TOKEN_LIFE_SECONDS })}`;
    const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url');
    return `${unsigned}.${signature}`;
}
