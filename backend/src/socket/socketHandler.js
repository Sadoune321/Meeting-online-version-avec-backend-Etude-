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
        console.log(${userName} joined room: ${roomId}, existing producers: ${existingProducers.length});
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
        if (!room) return callback({ error: 'Room not found' });

        const peer = room.peers.get(socket.id);
        if (peer) peer.producers.push(producer);

        socket.to(roomId).emit('newProducer', {
          producerId: producer.id,
          peerId: socket.id,
          kind,
          userName: peer?.userName,
        });

        producer.on('transportclose', () => {
          console.log(Producer ${producer.id} transport closed);
          producer.close();
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
          console.error('Cannot consume producerId:', producerId);
          return callback({ error: 'Cannot consume this producer' });
        }

        const consumer = await socket._recvTransport.consume({
          producerId,
          rtpCapabilities,
          paused: true,
        });
        
        const peer = room.peers.get(socket.id);
        if (peer) peer.consumers.push(consumer);

        await consumer.resume();

        consumer.on('transportclose', () => {
          console.log(Consumer ${consumer.id} transport closed);
          consumer.close();
        });

        consumer.on('producerclose', () => {
          console.log(Consumer ${consumer.id} producer closed);
          consumer.close();
          socket.emit('consumerClosed', { consumerId: consumer.id });
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

    socket.on('resumeConsumer', async ({ consumerId }, callback) => {
      try {
        const room = [...rooms.values()].find(r => r.peers.has(socket.id));
        if (!room) return callback({ error: 'Room not found' });

        const peer = room.peers.get(socket.id);
        if (!peer) return callback({ error: 'Peer not found' });

        const consumer = peer.consumers.find(c => c.id === consumerId);
        if (!consumer) return callback({ error: 'Consumer not found' });

        await consumer.resume();
        callback({ success: true });
      } catch (err) {
        console.error('resumeConsumer error: ' + err.message);
        callback({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected: ' + socket.id);
      rooms.forEach((room, roomId) => {
        if (room.peers.has(socket.id)) {
          const peer = room.peers.get(socket.id);

          peer.producers.forEach(producer => {
            try { producer.close(); } catch (e) {}
          });
          
          peer.consumers.forEach(consumer => {
            try { consumer.close(); } catch (e) {}
          });

          room.peers.delete(socket.id);
          socket.to(roomId).emit('peerLeft', { peerId: socket.id });
          console.log(Peer ${socket.id} left room ${roomId});
        }
      });
    });
  });
};
