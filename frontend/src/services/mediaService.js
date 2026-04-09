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

      sendTransport.on('connectionstatechange', (state) => {
        console.log('sendTransport state:', state);
        if (state === 'failed') sendTransport.close();
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

      recvTransport.on('connectionstatechange', (state) => {
        console.log('recvTransport state:', state);
        if (state === 'failed') recvTransport.close();
      });

      resolve(recvTransport);
    });
  });
};

export const publishStream = async (stream) => {
  const producers = [];
  for (const track of stream.getTracks()) {
    const producer = await sendTransport.produce({ track });
    console.log('✅ Producer created, kind:', producer.kind);
    producers.push(producer);
  }
  return producers;
};

export const consumeStream = async (socket, roomId, producerId, rtpCapabilities) => {
  if (!recvTransport) {
    console.warn('⚠️ recvTransport null, recréation...');
    await createRecvTransport(socket, roomId);
  }

  return new Promise((resolve, reject) => {
    socket.emit('consume', { roomId, producerId, rtpCapabilities }, async (response) => {
      console.log('📩 consume response:', response);
      const { id, kind, rtpParameters, error } = response;
      if (error) return reject(new Error(error));

      try {
        const consumer = await recvTransport.consume({ id, producerId, kind, rtpParameters });
        console.log('✅ Consumer created, kind:', kind);

        // Resume côté frontend aussi (double sécurité)
        socket.emit('resumeConsumer', { consumerId: id }, (res) => {
          console.log('▶️ resumeConsumer:', res);
        });

        const stream = new MediaStream([consumer.track]);
        resolve(stream);
      } catch (err) {
        console.error('❌ consumer error:', err);
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
