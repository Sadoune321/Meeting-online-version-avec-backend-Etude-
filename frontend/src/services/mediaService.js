import * as mediasoupClient from 'mediasoup-client';

let device;
let sendTransport;
let recvTransport;

export const loadDevice = async (rtpCapabilities) => {
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: rtpCapabilities });
  return device;
};

export const getDevice = () => device;

export const createSendTransport = async (socket, roomId) => {
  return new Promise((resolve, reject) => {
    socket.emit('createTransport', { roomId, direction: 'send' }, ({ params, error }) => {
      if (error) return reject(error);
      sendTransport = device.createSendTransport(params);

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit('connectTransport', { dtlsParameters, direction: 'send' }, ({ error }) => {
          if (error) return errback(error);
          callback();
        });
      });

      sendTransport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
        socket.emit('produce', { roomId, kind, rtpParameters }, ({ id, error }) => {
          if (error) return errback(error);
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
      if (error) return reject(error);
      recvTransport = device.createRecvTransport(params);

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        socket.emit('connectTransport', { dtlsParameters, direction: 'recv' }, ({ error }) => {
          if (error) return errback(error);
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
  if (!recvTransport) {
    await createRecvTransport(socket, roomId);
  }
  return new Promise((resolve, reject) => {
    socket.emit('consume', { roomId, producerId, rtpCapabilities }, async ({ id, kind, rtpParameters, error }) => {
      if (error) return reject(error);
      const consumer = await recvTransport.consume({ id, producerId, kind, rtpParameters });
      const stream = new MediaStream([consumer.track]);
      resolve(stream);
    });
  });
};