require('dotenv').config();

module.exports = {
  worker: {
    rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT) || 10000,
    rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT) || 10100,
    logLevel: 'debug', // Mettre en debug pour voir les problèmes
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
        ip: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
        // 🔥 CRUCIAL : Utiliser l'IP publique de Render
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || '74.220.48.240',
      },
    ],
    // 🔥 ACTIVER UDP (essentiel pour WebRTC)
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    preferTcp: false,
    initialAvailableOutgoingBitrate: 1_000_000,
    minimumAvailableOutgoingBitrate: 600_000,
    maxIncomingBitrate: 1_500_000,
  },
};
