const https = require('https');
const { getOrCreateRoom, createTransport, rooms } = require('../services/mediasoupService');

// Configuration ICE directe sans API externe
const getIceServers = () => {
  // Serveurs STUN/TURN publics gratuits et fiables
  return [
    // STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.stunprotocol.org:3478' },
    
    // TURN servers publics (pour traverser les NAT stricts)
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
      username: 'webrtc',
      credential: 'webrtc',
    },
    {
      urls: 'turn:turn.anyfirewall.com:80?transport=udp',
      username: 'webrtc',
      credential: 'webrtc',
    }
  ];
};

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    socket.on('joinRoom', async ({ roomId, userName }, callback) => {
      try {
        const room = await getOrCreateRoom(roomId);
        socket.join(roomId);
        
        // Stocker les infos utilisateur
        if (!room.peers.has(socket.id)) {
          room.peers.set(socket.id, { userName, producers: [], consumers: [] });
        }

        const rtpCapabilities = room.router.rtpCapabilities;
        const existingProducers = [];

        room.peers.forEach((peer, peerId) => {
          if (peerId !== socket.id) {
            peer.producers.forEach((producer) => {
              existingProducers.push({
                producerId: producer.id,
                peerId,
                kind: producer.kind,
                userName: peer.userName,
              });
            });
          }
        });

        callback({ rtpCapabilities, existingProducers });
        socket.to(roomId).emit('newPeer', { peerId: socket.id, userName });
        console.log(`${userName} joined room: ${roomId}, existing producers: ${existingProducers.length}`);
      } catch (err) {
        console.error('joinRoom error:', err.message);
        callback({ error: err.message });
      }
    });

    socket.on('createTransport', async ({ roomId, direction }, callback) => {
      try {
        const { transport, params } = await createTransport(roomId);

        if (direction === 'send') {
          socket._sendTransport = transport;
        } else {
          socket._recvTransport = transport;
        }

        // Utiliser la configuration ICE directe
        const iceServers = getIceServers();
        console.log(`📡 Sending ${direction} transport with ${iceServers.length} ICE servers`);

        callback({ 
          params: { 
            ...params, 
            iceServers,
            iceTransportPolicy: 'all',
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
          } 
        });
        console.log(`✅ Transport ${direction} created for ${socket.id}`);
      } catch (err) {
        console.error('createTransport error:', err.message);
        callback({ error: err.message });
      }
    });

    socket.on('connectTransport', async ({ dtlsParameters, direction }, callback) => {
      try {
        const transport = direction === 'send' ? socket._sendTransport : socket._recvTransport;
        if (!transport) return callback({ error: `Transport ${direction} not found` });
        
        console.log(`🔌 Connecting ${direction} transport ${transport.id}`);
        await transport.connect({ dtlsParameters });
        
        // Écouter les événements de connexion
        transport.on('connectionstatechange', (state) => {
          console.log(`🔗 ${direction} transport connection state: ${state}`);
          if (state === 'failed') {
            console.error(`❌ ${direction} transport failed for ${socket.id}`);
          } else if (state === 'connected') {
            console.log(`✅ ${direction} transport connected for ${socket.id}`);
          }
        });
        
        callback({ success: true });
      } catch (err) {
        console.error('connectTransport error:', err.message);
        callback({ error: err.message });
      }
    });

    // Le reste de ton code (produce, consume, etc.) reste identique
    socket.on('produce', async ({ roomId, kind, rtpParameters }, callback) => {
      try {
        if (!socket._sendTransport) return callback({ error: 'Send transport not found' });

        const producer = await socket._sendTransport.produce({ kind, rtpParameters });

        const room = rooms.get(roomId);
        if (!room) return callback({ error: 'Room not found' });

        const peer = room.peers.get(socket.id);
        if (peer) peer.producers.push(producer);

        socket.to(roomId).emit('newProducer', {
          producerId: producer.id,
          peerId: socket.id,
          kind,
          userName: peer?.userName,
        });

        callback({ id: producer.id });
        console.log(`✅ Producer created: ${kind} for ${socket.id}`);
      } catch (err) {
        console.error('produce error:', err.message);
        callback({ error: err.message });
      }
    });

    socket.on('consume', async ({ roomId, producerId, rtpCapabilities }, callback) => {
      try {
        const room = rooms.get(roomId);
        if (!room) return callback({ error: 'Room not found' });
        if (!socket._recvTransport) return callback({ error: 'Recv transport not found' });

        const consumer = await socket._recvTransport.consume({
          producerId,
          rtpCapabilities,
          paused: false, // Démarrer directement sans pause
        });

        const peer = room.peers.get(socket.id);
        if (peer) peer.consumers.push(consumer);

        callback({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });

        console.log(`✅ Consumer created: ${consumer.kind} for ${socket.id}`);
      } catch (err) {
        console.error('consume error:', err.message);
        callback({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
      rooms.forEach((room, roomId) => {
        if (room.peers.has(socket.id)) {
          room.peers.delete(socket.id);
          socket.to(roomId).emit('peerLeft', { peerId: socket.id });
          console.log(`Peer ${socket.id} left room ${roomId}`);
        }
      });
    });
  });
};
