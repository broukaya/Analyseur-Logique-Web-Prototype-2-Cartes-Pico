// src/analyser.js
'use strict';

const { spawn } = require('child_process');

// Track active capture processes: Map<socketId, ChildProcess>
const activeCaptures = new Map();

function runCapture(socket, {
    samplerate = 1_000_000,
    numSamples = 10_000,
    channels   = 'D0,D1,D2,D3,D4,D5,D6,D7',
} = {}) {

    socket.emit('log', `[ANALYSER] Démarrage — ${numSamples} samples @ ${samplerate} Hz`);

    // WSL2's USB passthrough doesn't reliably catch the fx2lafw firmware-upload
    // re-enumeration when sigrok uses a fixed --samples count (causes
    // "Device failed to renumerate" / "No devices found"). Using --time
    // instead works reliably — so we convert the requested sample count
    // into an equivalent duration.
    const durationMs = Math.max(50, Math.round((numSamples / samplerate) * 1000));

    const args = [
        '-d', 'fx2lafw',
        '--config',        `samplerate=${samplerate}`,
        '--time',           `${durationMs}ms`,
        '--channels',      channels,
        '--output-format', 'csv',
    ];

    const proc = spawn('sigrok-cli', args);
    activeCaptures.set(socket.id, proc);

    let headerSkipped = false;
    let csvBuffer     = '';

    proc.stdout.on('data', chunk => {
        csvBuffer += chunk.toString();
        const lines = csvBuffer.split('\n');
        csvBuffer   = lines.pop();   // keep last incomplete line

        lines.forEach(line => {
            if (!line.trim() || line.startsWith(';')) return;
            if (!headerSkipped) { headerSkipped = true; return; }
            socket.emit('signal-data', line.trim());
        });
    });

    proc.stderr.on('data', data =>
        data.toString().split('\n').forEach(l => l.trim() && socket.emit('log', `[SIGROK] ${l}`))
    );

    proc.on('close', code => {
        activeCaptures.delete(socket.id);
        if (code === 0 || code === null) {
            socket.emit('log', '[ANALYSER] Capture terminée.');
            socket.emit('capture-done', { success: true });
        } else {
            socket.emit('log', `[ANALYSER] Erreur sigrok (code ${code})`);
            socket.emit('capture-done', { success: false, code });
        }
    });

    proc.on('error', err => {
        socket.emit('log', `[ANALYSER] Impossible de lancer sigrok-cli : ${err.message}`);
        socket.emit('capture-done', { success: false });
    });

    // Hard timeout: kill after 30 s
    setTimeout(() => {
        if (activeCaptures.has(socket.id)) {
            proc.kill();
            socket.emit('log', '[ANALYSER] Capture interrompue (timeout 30s)');
        }
    }, 30_000);
}

function stopCapture(socketId) {
    const proc = activeCaptures.get(socketId);
    if (proc) {
        proc.kill();
        activeCaptures.delete(socketId);
    }
}

function hasActiveCapture(socketId) {
    return activeCaptures.has(socketId);
}

module.exports = { runCapture, stopCapture, hasActiveCapture };
