// src/rateLimiter.js
'use strict';

const rateLimit = require('express-rate-limit');
const {
    HTTP_RATE_WINDOW_MS, HTTP_RATE_MAX,
    COMPILE_COOLDOWN_MS, CAPTURE_COOLDOWN_MS,
} = require('./config');

// ── HTTP rate limiter (Express middleware) ────────────────────────────────────
const httpLimiter = rateLimit({
    windowMs: HTTP_RATE_WINDOW_MS,
    max:      HTTP_RATE_MAX,
    standardHeaders: true,
    legacyHeaders:   false,
    message: 'Too many requests.',
});

// ── Per-socket cooldowns (in-memory) ─────────────────────────────────────────
// Map<socketId, { lastCompile?: number, lastCapture?: number }>
const socketTimestamps = new Map();

function canCompile(socketId) {
    const now   = Date.now();
    const entry = socketTimestamps.get(socketId) || {};
    if (entry.lastCompile && now - entry.lastCompile < COMPILE_COOLDOWN_MS)
        return false;
    socketTimestamps.set(socketId, { ...entry, lastCompile: now });
    return true;
}

function canCapture(socketId) {
    const now   = Date.now();
    const entry = socketTimestamps.get(socketId) || {};
    if (entry.lastCapture && now - entry.lastCapture < CAPTURE_COOLDOWN_MS)
        return false;
    socketTimestamps.set(socketId, { ...entry, lastCapture: now });
    return true;
}

function cleanup(socketId) {
    socketTimestamps.delete(socketId);
}

module.exports = { httpLimiter, canCompile, canCapture, cleanup };
