import * as mediasoupClient from 'mediasoup-client';

let device = null;
let sendTransport = null;
let recvTransport = null;

// Charger le device
export const loadDevice = async (rtpCapabilities) => {
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: rtpCapabilities });
  console.log('Device loaded successfully');
  return device;
};

export const getDevice = () => device;

// Créer transport pour envoyer
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

// Créer transport pour recevoir
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

// Publier le flux local
export const publishStream = async (stream) => {
  const producers = [];
  for (const track of stream.getTracks()) {
    const producer = await sendTransport.produce({ track });
    producers.push(producer);
  }
  return producers;
};

// Consommer un producer
export const consumeStream = async (socket, roomId, producerId, rtpCapabilities) => {
  if (!recvTransport) {
    await createRecvTransport(socket, roomId);
  }
  return new Promise((resolve, reject) => {
    socket.emit('consume', { roomId, producerId, rtpCapabilities }, async ({ id, kind, rtpParameters, error }) => {
      if (error) return reject(new Error(error));
      try {
        const consumer = await recvTransport.consume({ id, producerId, kind, rtpParameters });
        const stream = new MediaStream([consumer.track]);
        resolve(stream);
      } catch (err) {
        reject(err);
      }
    });
  });
};

// Réinitialiser les medias
export const resetMedia = () => {
  device = null;
  sendTransport = null;
  recvTransport = null;
};
