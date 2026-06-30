// test.js  —  run with: node test.js
// Tests all src/ modules without starting the server or needing a browser.
'use strict';

require('dotenv').config();
const assert = require('assert/strict');

let passed = 0;
let failed = 0;

function test(label, fn) {
    try {
        fn();
        console.log(`  ✓  ${label}`);
        passed++;
    } catch (e) {
        console.error(`  ✗  ${label}`);
        console.error(`     ${e.message}`);
        failed++;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── config ───────────────────────────────────────────────────────');

const config = require('./src/config');

test('PORT is a number', () => assert.equal(typeof config.PORT, 'number'));
test('ALLOWED_TARGETS contains esp32 and stm32', () => {
    assert.ok(config.ALLOWED_TARGETS.has('esp32'));
    assert.ok(config.ALLOWED_TARGETS.has('stm32'));
});
test('ALLOWED_SAMPLERATES contains 1 MHz', () =>
    assert.ok(config.ALLOWED_SAMPLERATES.has(1_000_000))
);
test('MAX_CODE_BYTES is 500 KB', () =>
    assert.equal(config.MAX_CODE_BYTES, 500 * 1024)
);

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── validation › validateCompile ─────────────────────────────────');

const { validateCompile, validateCapture } = require('./src/validation');

test('accepts valid esp32 payload', () =>
    assert.equal(validateCompile({ code: 'int main(){}', target: 'esp32' }), null)
);
test('accepts valid stm32 payload', () =>
    assert.equal(validateCompile({ code: 'int main(){}', target: 'stm32' }), null)
);
test('rejects missing code', () =>
    assert.ok(validateCompile({ code: '', target: 'esp32' }))
);
test('rejects null payload', () =>
    assert.ok(validateCompile(null))
);
test('rejects unknown target', () =>
    assert.ok(validateCompile({ code: 'x', target: 'arduino' }))
);
test('rejects oversized code', () => {
    const big = 'x'.repeat(500 * 1024 + 1);
    assert.ok(validateCompile({ code: big, target: 'esp32' }));
});

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── validation › validateCapture ─────────────────────────────────');

test('accepts valid capture options', () =>
    assert.equal(validateCapture({ samplerate: 1_000_000, numSamples: 1000, channels: 'D0,D1' }), null)
);
test('rejects unknown samplerate', () =>
    assert.ok(validateCapture({ samplerate: 999, numSamples: 1000 }))
);
test('rejects numSamples below minimum', () =>
    assert.ok(validateCapture({ samplerate: 1_000_000, numSamples: 10 }))
);
test('rejects numSamples above maximum', () =>
    assert.ok(validateCapture({ samplerate: 1_000_000, numSamples: 2_000_000 }))
);
test('rejects invalid channel name', () =>
    assert.ok(validateCapture({ samplerate: 1_000_000, numSamples: 1000, channels: 'D0,X9' }))
);

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── rateLimiter ──────────────────────────────────────────────────');

const { canCompile, canCapture, cleanup } = require('./src/rateLimiter');

test('first compile is always allowed', () =>
    assert.ok(canCompile('socket-test-1'))
);
test('second compile within cooldown is blocked', () =>
    assert.equal(canCompile('socket-test-1'), false)
);
test('different socket is not affected by another socket cooldown', () =>
    assert.ok(canCompile('socket-test-2'))
);
test('first capture is always allowed', () =>
    assert.ok(canCapture('socket-test-3'))
);
test('second capture within cooldown is blocked', () =>
    assert.equal(canCapture('socket-test-3'), false)
);
test('cleanup removes socket entry', () => {
    cleanup('socket-test-1');
    // after cleanup the socket should be allowed again
    assert.ok(canCompile('socket-test-1'));
});

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n── modules load without errors ──────────────────────────────────');

test('compiler.js loads', () => { require('./src/compiler');  });
test('analyser.js loads', () => { require('./src/analyser');  });
test('socket.js loads',   () => { require('./src/socket');    });

// ══════════════════════════════════════════════════════════════════════════════
console.log('\n─────────────────────────────────────────────────────────────────');
console.log(`  ${passed} passed  |  ${failed} failed\n`);
if (failed > 0) process.exit(1);
