require('dotenv').config();

module.exports = {
  worker: {
    rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT),
    rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT),
    logLevel: 'warn',
  },
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
      },
    ],
  },
  webRtcTransport: {
    listenIps: [
      {
        ip: process.env.MEDIASOUP_LISTEN_IP,
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP,
      },
    ],
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000,
  },
};