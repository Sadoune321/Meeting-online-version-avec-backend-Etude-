const rooms = new Map();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('✅ Client connected:', socket.id);

    socket.on('joinRoom', ({ roomId, userName }, callback) => {
      try {
        if (!rooms.has(roomId)) rooms.set(roomId, new Map());
        const room = rooms.get(roomId);
        const isHost = room.size === 0;
        const peerId = isHost ? `${roomId}-host` : `${roomId}-${userName}`;

        room.set(peerId, { userName, socketId: socket.id });
        socket._roomId = roomId;
        socket._peerId = peerId;
        socket.join(roomId);

        callback({ isHost });
        socket.to(roomId).emit('newPeer', { peerId, userName });
        console.log(`${userName} joined ${roomId} as ${isHost ? 'HOST' : 'GUEST'}`);
      } catch (err) {
        callback({ error: err.message });
      }
    });

    socket.on('disconnect', () => {
      const roomId = socket._roomId;
      const peerId = socket._peerId;
      if (roomId && rooms.has(roomId)) {
        rooms.get(roomId).delete(peerId);
        socket.to(roomId).emit('peerLeft', { peerId });
        if (rooms.get(roomId).size === 0) rooms.delete(roomId);
      }
      console.log('❌ Disconnected:', socket.id);
    });
  });
};
