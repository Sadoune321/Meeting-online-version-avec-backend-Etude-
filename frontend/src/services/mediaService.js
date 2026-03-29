import * as mediasoupClient from 'mediasoup-client';

let device = null;
let sendTransport = null;
let recvTransport = null;

export const loadDevice = async (rtpCapabilities) => {
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: rtpCapabilities });
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

export const getOrCreateRecvTransport = async (socket, roomId) => {
  if (recvTransport) return recvTransport;

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

export const consumeStream = async (socket, roomId, producerId, rtpCapabilities) => {
  const transport = await getOrCreateRecvTransport(socket, roomId);

  return new Promise((resolve, reject) => {
    socket.emit('consume', { roomId, producerId, rtpCapabilities }, async ({ id, kind, rtpParameters, error }) => {
      if (error) return reject(new Error(error));
      try {
        const consumer = await transport.consume({
          id,
          producerId,
          kind,
          rtpParameters,
        });

        consumer.on('transportclose', () => {
          console.log('Transport closed for consumer:', consumer.id);
        });

        const stream = new MediaStream();
        stream.addTrack(consumer.track);

        console.log('Consumer created - kind:', kind, 'track:', consumer.track.readyState);
        resolve(stream);
      } catch (err) {
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
