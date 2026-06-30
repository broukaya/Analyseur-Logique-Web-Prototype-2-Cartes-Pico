// src/socket.js
'use strict';

const { compileESP32, compileSTM32 }     = require('./compiler');
const { runCapture, stopCapture, hasActiveCapture } = require('./analyser');
const { canCompile, canCapture, cleanup }= require('./rateLimiter');
const { validateCompile, validateCapture}= require('./validation');

function reject(socket, event, msg) {
    socket.emit('log', `[ERREUR] ${msg}`);
    socket.emit(event, { success: false });
}

module.exports = function registerSocketHandlers(io) {

    io.on('connection', socket => {
        console.log(`+ ${socket.id}`);

        // ── compile ───────────────────────────────────────────────────────────
        socket.on('code-submit', async data => {
            if (!canCompile(socket.id))
                return reject(socket, 'compile-done', 'Trop de compilations. Attendez 15 s.');

            const err = validateCompile(data);
            if (err) return reject(socket, 'compile-done', err);

            socket.emit('log', `[INFO] Cible : ${data.target.toUpperCase()}`);
            try {
                await (data.target === 'stm32'
                    ? compileSTM32(data.code, socket)
                    : compileESP32(data.code, socket));
                socket.emit('compile-done', { success: true });
            } catch (e) {
                socket.emit('log', `[ERREUR] ${e.message}`);
                socket.emit('compile-done', { success: false });
            }
        });

        // ── capture ───────────────────────────────────────────────────────────
        socket.on('capture-start', opts => {
            if (!canCapture(socket.id))
                return socket.emit('log', '[ANALYSER] Attendez 5 s avant une nouvelle capture.');
            if (hasActiveCapture(socket.id))
                return socket.emit('log', '[ANALYSER] Une capture est déjà en cours.');

            const err = validateCapture(opts);
            if (err) return reject(socket, 'capture-done', err);

            runCapture(socket, opts);
        });

        socket.on('capture-stop', () => {
            stopCapture(socket.id);
            socket.emit('log', '[ANALYSER] Capture arrêtée.');
        });

        // ── disconnect ────────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            console.log(`- ${socket.id}`);
            stopCapture(socket.id);
            cleanup(socket.id);
        });
    });
};
