import * as mediasoupClient from 'mediasoup-client';

let device = null;
let sendTransport = null;
let recvTransport = null;

export const loadDevice = async (rtpCapabilities) => {
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: rtpCapabilities });
  console.log('Device loaded successfully');
  return device;
};

export const getDevice = () => device;

export const createSendTransport = async (socket, roomId) => {
  return new Promise((resolve, reject) => {
    socket.emit('createTransport', { roomId, direction: 'send' }, ({ params, error }) => {
      if (error) return reject(new Error(error));
      sendTransport = device.createSendTransport(params);

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit('connectTransport', { dtlsParameters, direction: 'send' }, ({ error }) => {
          if (error) return errback(new Error(error));
          callback();
        });
      });

      sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        socket.emit('produce', { roomId, kind, rtpParameters }, ({ id, error }) => {
          if (error) return errback(new Error(error));
          callback({ id });
        });
      });

      resolve(sendTransport);
    });
  });
};

export const createRecvTransport = async (socket, roomId) => {
  return new Promise((resolve, reject) => {
    socket.emit('createTransport', { roomId, direction: 'recv' }, ({ params, error }) => {
      if (error) return reject(new Error(error));
      recvTransport = device.createRecvTransport(params);

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit('connectTransport', { dtlsParameters, direction: 'recv' }, ({ error }) => {
          if (error) return errback(new Error(error));
          callback();
        });
      });

      resolve(recvTransport);
    });
  });
};

export const publishStream = async (stream) => {
  const producers = [];
  for (const track of stream.getTracks()) {
    const producer = await sendTransport.produce({ track });
    producers.push(producer);
  }
  return producers;
};

// ✅ CORRIGÉ : ajout du resumeConsumer obligatoire
export const consumeStream = async (socket, roomId, producerId, rtpCapabilities) => {
  if (!recvTransport) {
    console.log('⚠️ recvTransport null, recréation...');
    await createRecvTransport(socket, roomId);
  }

  return new Promise((resolve, reject) => {
    console.log('📡 Emit consume:', { roomId, producerId });
    
    socket.emit('consume', { roomId, producerId, rtpCapabilities }, async (response) => {
      console.log('📩 consume response:', response); // ← CRITIQUE : voir ce que le serveur renvoie
      
      const { id, kind, rtpParameters, error } = response;
      if (error) return reject(new Error(error));
      
      try {
        console.log('🔧 Creating consumer, kind:', kind);
        const consumer = await recvTransport.consume({ id, producerId, kind, rtpParameters });
        console.log('✅ Consumer created:', consumer.id);

        await new Promise((res) => {
          socket.emit('resumeConsumer', { consumerId: id }, (resumeResponse) => {
            console.log('▶️ resumeConsumer response:', resumeResponse); // ← voir si ça marche
            res();
          });
        });

        const stream = new MediaStream([consumer.track]);
        console.log('✅ Stream ready, tracks:', stream.getTracks().length);
        resolve(stream);
      } catch (err) {
        console.error('❌ consumer.consume() error:', err);
        reject(err);
      }
    });
  });
};

export const resetMedia = () => {
  device = null;
  sendTransport = null;
  recvTransport = null;
};
