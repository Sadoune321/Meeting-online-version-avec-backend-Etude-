require('dotenv').config();

module.exports = {
  worker: {
    rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT) || 10000,
    rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT) || 10100,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
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
        parameters: { 'x-google-start-bitrate': 1000 },
      },
    ],
  },

  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || null,
      },
    ],
    enableUdp: false,
    enableTcp: true,
    preferUdp: false,
    maxIncomingBitrate: 1500000,
    initialAvailableOutgoingBitrate: 1000000,
  },
};
