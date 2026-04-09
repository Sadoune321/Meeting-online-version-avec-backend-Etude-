import Peer from 'peerjs';

let peer = null;
let localStream = null;
let currentCall = null;

const getTurnServers = async (apiKey, domain) => {
  try {
    const res = await fetch(
      `https://${domain}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
    );
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log('✅ TURN servers fetched:', data.length);
      return data;
    }
  } catch (e) {
    console.warn('⚠️ TURN fetch failed:', e.message);
  }
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];
};

export const initMedia = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });
  return localStream;
};

export const getLocalStream = () => localStream;

export const createPeer = async (peerId) => {
  const apiKey = process.env.REACT_APP_METERED_API_KEY;
  const domain = process.env.REACT_APP_METERED_SUBDOMAIN;
  const iceServers = await getTurnServers(apiKey, domain);

  return new Promise((resolve, reject) => {
    peer = new Peer(peerId, {
      config: {
        iceServers,
        iceTransportPolicy: 'relay',
      },
    });

    peer.on('open', (id) => {
      console.log('✅ Peer ready:', id);
      resolve({ peer, id });
    });

    peer.on('error', (err) => {
      console.error('❌ Peer error:', err.type);
      reject(err);
    });
  });
};

export const callPeer = (remotePeerId) => {
  if (!peer || !localStream) return null;
  currentCall = peer.call(remotePeerId, localStream);
  return currentCall;
};

export const answerCall = (call) => {
  if (!localStream) return;
  call.answer(localStream);
  currentCall = call;
};

export const resetMedia = () => {
  localStream?.getTracks().forEach(t => t.stop());
  try { currentCall?.close(); } catch (_) {}
  try { peer?.destroy(); } catch (_) {}
  peer = null;
  localStream = null;
  currentCall = null;
};
