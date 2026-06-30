// src/validation.js
'use strict';

const { ALLOWED_TARGETS, MAX_CODE_BYTES, ALLOWED_SAMPLERATES, MAX_SAMPLES } = require('./config');

/**
 * Validates a code-submit payload.
 * Returns an error string, or null if valid.
 */
function validateCompile(data) {
    if (!data || typeof data !== 'object')
        return 'Invalid payload.';
    if (typeof data.code !== 'string' || data.code.trim().length === 0)
        return 'Code is empty.';
    if (Buffer.byteLength(data.code, 'utf8') > MAX_CODE_BYTES)
        return `Code exceeds ${MAX_CODE_BYTES / 1024} KB limit.`;
    if (!ALLOWED_TARGETS.has(data.target))
        return `Invalid target "${data.target}". Allowed: ${[...ALLOWED_TARGETS].join(', ')}.`;
    return null;
}

/**
 * Validates a capture-start payload.
 * Returns an error string, or null if valid.
 */
function validateCapture(opts) {
    if (!opts || typeof opts !== 'object')
        return 'Invalid payload.';

    const sr = Number(opts.samplerate);
    if (!ALLOWED_SAMPLERATES.has(sr))
        return `Invalid samplerate. Allowed: ${[...ALLOWED_SAMPLERATES].join(', ')}.`;

    const n = Number(opts.numSamples);
    if (!Number.isInteger(n) || n < 100 || n > MAX_SAMPLES)
        return `numSamples must be between 100 and ${MAX_SAMPLES}.`;

    if (opts.channels) {
        const allowed = new Set(['D0','D1','D2','D3','D4','D5','D6','D7']);
        const chs = String(opts.channels).split(',');
        if (chs.length === 0 || chs.some(c => !allowed.has(c.trim())))
            return 'Invalid channel list.';
    }

    return null;
}

module.exports = { validateCompile, validateCapture };
