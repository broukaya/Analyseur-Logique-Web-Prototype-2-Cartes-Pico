// src/config.js
'use strict';

module.exports = {
    PORT: Number(process.env.PORT) || 3000,
    SESSION_SECRET: process.env.SESSION_SECRET || 'change_me',

    // Compilation
    ALLOWED_TARGETS: new Set(['esp32', 'stm32']),
    MAX_CODE_BYTES:  500 * 1024,   // 500 KB

    // Capture
    ALLOWED_SAMPLERATES: new Set([20000, 100000, 1000000, 8000000, 24000000]),
    MAX_SAMPLES: 1_000_000,

    // Rate limits (milliseconds)
    COMPILE_COOLDOWN_MS: 15_000,   // 15 s between compiles per socket
    CAPTURE_COOLDOWN_MS:  5_000,   //  5 s between captures per socket
    HTTP_RATE_WINDOW_MS: 60_000,   //  1 minute window
    HTTP_RATE_MAX:       60,       // 60 HTTP requests per window
};
