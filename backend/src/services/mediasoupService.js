const mediasoup = require('mediasoup');
const config = require('../config/mediasoup');

let worker;
const rooms = new Map();

const createWorker = async () => {
  worker = await mediasoup.createWorker(config.worker);

  worker.on('died', () => {
    console.error('Mediasoup worker died, exiting...');
    process.exit(1);
  });

  console.log('✅ Mediasoup worker created');
  return worker;
};

const getOrCreateRoom = async (roomId) => {
  if (!rooms.has(roomId)) {
    const router = await worker.createRouter({ mediaCodecs: config.router.mediaCodecs });
    rooms.set(roomId, { router, peers: new Map() });
    console.log(`Room created: ${roomId}`);
  }
  return rooms.get(roomId);
};

const createTransport = async (roomId) => {
  const room = await getOrCreateRoom(roomId);
  const transport = await room.router.createWebRtcTransport(config.webRtcTransport);

  transport.on('dtlsstatechange', (dtlsState) => {
    if (dtlsState === 'closed') {
      console.log(`Transport ${transport.id} DTLS closed`);
      transport.close();
    }
  });

  transport.on('close', () => {
    console.log(`Transport ${transport.id} closed`);
  });

  return {
    transport,
    params: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    },
  };
};

module.exports = { createWorker, getOrCreateRoom, createTransport, rooms };
