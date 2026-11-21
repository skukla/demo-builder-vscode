/**
 * Record that a periodic check ran: set its `last:` date in `.pipeline.yaml`.
 *
 * A helper the checks call, not a check of its own (so it has no registry row).
 * The dev-pipeline freshness list reads `periodic.<step>.last`, and the release
 * check asks before a cut when a step is past its budget. Until 2026-11-21 only
 * reflect and codebase-sweep had a date, so "has the battery run since October?"
 * could only be answered by reading session transcripts (PL-107).
 *
 * The date is written BY THE CHECK, when it ran, never by hand: a hand-written date
 * says someone remembered, not that the check ran. "Ran" means it reached what it
 * reads. A drift check that found drift ran; one that could not sign in did not.
 *
 * Plain CommonJS like the drift checkers that call it, so they can `require` it and
 * a test can call it without a build.
 */

const fs = require('fs');
const path = require('path');

const PIPELINE = path.join(__dirname, '..', '..', '.pipeline.yaml');

/** Today as YYYY-MM-DD in local time, the form freshness.py parses. */
function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The manifest text with `step`'s `last:` set to `date`, added when the step has none.
 * Throws when the step is not in the manifest, so a renamed step fails loudly instead
 * of writing nothing.
 *
 * @param {string} text the manifest
 * @param {string} step the periodic step's name
 * @param {string} date YYYY-MM-DD
 * @returns {string}
 */
function withLast(text, step, date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`"${date}" is not a YYYY-MM-DD date`);
    const name = step.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const line = new RegExp(`^(\\s+${name}:\\s*\\{)([^}\\n]*)(\\}.*)$`, 'm');
    const found = text.match(line);
    if (!found) throw new Error(`.pipeline.yaml has no periodic step "${step}"`);
    const [, open, body, close] = found;
    const next = /\blast:\s*\d{4}-\d{2}-\d{2}/.test(body)
        ? body.replace(/\blast:\s*\d{4}-\d{2}-\d{2}/, `last: ${date}`)
        : `${body.trimEnd()}, last: ${date} `;
    return text.replace(line, `${open}${next}${close}`);
}

/**
 * Write today's date as `step`'s last run. Reports and never throws: a check that
 * ran must still print its own result when the manifest cannot be written.
 *
 * @param {string} step the periodic step's name
 * @param {{ file?: string, date?: string }} [options] for tests
 * @returns {boolean} whether the date was written
 */
function recordRun(step, options = {}) {
    const file = options.file ?? PIPELINE;
    try {
        const text = fs.readFileSync(file, 'utf8');
        fs.writeFileSync(file, withLast(text, step, options.date ?? today()));
        console.log(`\n(${step}: last run recorded in .pipeline.yaml)`);
        return true;
    } catch (error) {
        console.log(`\n(${step}: last run NOT recorded: ${error.message})`);
        return false;
    }
}

module.exports = { withLast, recordRun };

if (require.main === module) {
    const step = process.argv[2];
    if (!step) {
        console.error('usage: node scripts/lib/pipelineLast.js <periodic step>');
        process.exit(2);
    }
    process.exit(recordRun(step) ? 0 : 1);
}
