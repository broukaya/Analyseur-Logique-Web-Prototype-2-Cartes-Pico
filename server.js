// server.js — entry point
'use strict';

require('dotenv').config();

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');
const path     = require('path');

const { PORT }                 = require('./src/config');
const { httpLimiter }          = require('./src/rateLimiter');
const registerSocketHandlers   = require('./src/socket');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(httpLimiter);
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

registerSocketHandlers(io);

server.listen(PORT, () => console.log(`VLAB running → http://localhost:${PORT}`));
