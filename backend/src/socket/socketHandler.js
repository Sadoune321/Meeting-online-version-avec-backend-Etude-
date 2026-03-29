const { getOrCreateRoom, createTransport, rooms } = require('../services/mediasoupService');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('Client connected: ' + socket.id);

    socket.on('joinRoom', async ({ roomId, userName }, callback) => {
      try {
        const room = await getOrCreateRoom(roomId);
        socket.join(roomId);
        room.peers.set(socket.id, { userName, producers: [], consumers: [] });
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
        console.log(userName + ' joined room: ' + roomId + ', existing producers: ' + existingProducers.length);
      } catch (err) {
        console.error('joinRoom error: ' + err.message);
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
        callback({ params });
      } catch (err) {
        console.error('createTransport error: ' + err.message);
        callback({ error: err.message });
      }
    });

    socket.on('connectTransport', async ({ dtlsParameters, direction }, callback) => {
      try {
        const transport = direction === 'send' ? socket._sendTransport : socket._recvTransport;
        if (!transport) return callback({ error: 'Transport ' + direction + ' not found' });
        await transport.connect({ dtlsParameters });
        callback({ success: true });
      } catch (err) {
        console.error('connectTransport error: ' + err.message);
        callback({ error: err.message });
      }
    });

    socket.on('produce', async ({ roomId, kind, rtpParameters }, callback) => {
      try {
        if (!socket._sendTransport) return callback({ error: 'Send transport not found' });
        const producer = await socket._sendTransport.produce({ kind, rtpParameters });
        const room = rooms.get(roomId);
        const peer = room.peers.get(socket.id);
        peer.producers.push(producer);

        socket.to(roomId).emit('newProducer', {
          producerId: producer.id,
          peerId: socket.id,
          kind,
        });

        callback({ id: producer.id });
      } catch (err) {
        console.error('produce error: ' + err.message);
        callback({ error: err.message });
      }
    });

    socket.on('consume', async ({ roomId, producerId, rtpCapabilities }, callback) => {
      try {
        const room = rooms.get(roomId);
        if (!room) return callback({ error: 'Room not found' });
        if (!socket._recvTransport) return callback({ error: 'Recv transport not found' });

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
          return callback({ error: 'Cannot consume this producer' });
        }

        const consumer = await socket._recvTransport.consume({
          producerId,
          rtpCapabilities,
          paused: false,
        });

        callback({
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        });
      } catch (err) {
        console.error('consume error: ' + err.message);
        callback({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected: ' + socket.id);
      rooms.forEach((room, roomId) => {
        if (room.peers.has(socket.id)) {
          room.peers.delete(socket.id);
          socket.to(roomId).emit('peerLeft', { peerId: socket.id });
        }
      });
    });
  });
};
