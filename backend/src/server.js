require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sequelize = require('./config/database');
const { createWorker } = require('./services/mediasoupService');
const socketHandler = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT)  60000,
  pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL)  25000,
  transports: ['websocket', 'polling'],
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const keepAlive = () => {
  const port = process.env.PORT  5000;
  setInterval(() => {
    http.get('http://localhost:' + port + '/health', (res) => {
      console.log('Keep alive ping - status: ' + res.statusCode);
    }).on('error', (err) => {
      console.error('Keep alive error: ' + err.message);
    });
  }, 10 * 60 * 1000);
};

const start = async () => {
  try {
    await sequelize.sync({ force: false });
    console.log('Database connected');

    await createWorker();

    socketHandler(io);

    const PORT = process.env.PORT  5000;

    server.listen(PORT, '0.0.0.0', () => {
      console.log('Server running on port ' + PORT);
      keepAlive();
    });
  } catch (err) {
    console.error('Startup error: ' + err.message);
    process.exit(1);
  }
};

start();
