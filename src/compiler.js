// src/compiler.js
'use strict';

const path = require('path');
const fs   = require('fs');
const { exec } = require('child_process');
const { randomUUID } = require('crypto');

const TEMP_DIR = path.join(__dirname, '..', 'temp');

// ─── ESP32 ────────────────────────────────────────────────────────────────────
async function compileESP32(code, socket) {
    const buildDir = path.join(TEMP_DIR, randomUUID());
    fs.mkdirSync(buildDir, { recursive: true });
    socket.emit('log', `[INFO] Build dir: ${buildDir}`);

    // Write project structure expected by ESP-IDF
    const mainDir = path.join(buildDir, 'main');
    fs.mkdirSync(mainDir, { recursive: true });
    fs.writeFileSync(path.join(mainDir, 'main.cpp'), code);
    fs.writeFileSync(path.join(buildDir, 'CMakeLists.txt'),
        `cmake_minimum_required(VERSION 3.5)\ninclude($ENV{IDF_PATH}/tools/cmake/project.cmake)\nproject(remote_lab)`
    );
    fs.writeFileSync(path.join(mainDir, 'CMakeLists.txt'),
        `idf_component_register(SRCS "main.cpp" INCLUDE_DIRS ".")`
    );
    socket.emit('log', '[INFO] Structure ESP-IDF prête, lancement Docker...');

    return _runDocker(
        `docker run --rm -v "${buildDir}:/project" -w /project espressif/idf idf.py build`,
        buildDir,
        socket,
    );
}

// ─── STM32 ────────────────────────────────────────────────────────────────────
async function compileSTM32(code, socket) {
    const buildDir = path.join(TEMP_DIR, randomUUID());
    fs.mkdirSync(buildDir, { recursive: true });
    socket.emit('log', `[INFO] Build dir: ${buildDir}`);

    fs.writeFileSync(path.join(buildDir, 'main.cpp'), code);
    fs.writeFileSync(path.join(buildDir, 'CMakeLists.txt'), `
cmake_minimum_required(VERSION 3.16)
set(CMAKE_SYSTEM_NAME Generic)
set(CMAKE_SYSTEM_PROCESSOR arm)
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
set(CMAKE_C_COMPILER   arm-none-eabi-gcc)
set(CMAKE_CXX_COMPILER arm-none-eabi-g++)
set(CMAKE_ASM_COMPILER arm-none-eabi-gcc)
set(CMAKE_C_FLAGS   "-mcpu=cortex-m4 -mthumb")
set(CMAKE_CXX_FLAGS "-mcpu=cortex-m4 -mthumb -fno-exceptions -fno-rtti")
set(CMAKE_EXE_LINKER_FLAGS "-specs=nosys.specs")
project(remote_lab C CXX ASM)
add_executable(remote_lab.elf main.cpp)
    `);
    socket.emit('log', '[INFO] CMakeLists.txt STM32 prête, lancement Docker...');

    return _runDocker(
        `docker run --rm -v "${buildDir}:/project" -w /project srzzumix/arm-none-eabi ` +
        `sh -c "cmake -G 'Unix Makefiles' -DCMAKE_BUILD_TYPE=Release -B build && cmake --build build"`,
        buildDir,
        socket,
    );
}

// ─── Shared Docker runner ─────────────────────────────────────────────────────
function _runDocker(cmd, buildDir, socket) {
    socket.emit('log', `[DEBUG] ${cmd}`);
    const proc = exec(cmd);

    proc.stdout.on('data', data =>
        data.toString().split('\n').forEach(l => l.trim() && socket.emit('log', `[BUILD] ${l}`))
    );
    proc.stderr.on('data', data =>
        data.toString().split('\n').forEach(l => l.trim() && socket.emit('log', `[BUILD ERR] ${l}`))
    );

    return new Promise((resolve, reject) => {
        proc.on('close', code => {
            try { fs.rmSync(buildDir, { recursive: true, force: true }); } catch (_) {}
            if (code === 0) {
                socket.emit('log', '[SUCCÈS] Compilation terminée !');
                resolve();
            } else {
                socket.emit('log', `[ERREUR] Compilation échouée (code ${code})`);
                reject(new Error(`Docker exited with code ${code}`));
            }
        });
    });
}

module.exports = { compileESP32, compileSTM32 };