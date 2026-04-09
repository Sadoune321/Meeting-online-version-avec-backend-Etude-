import Peer from 'peerjs';

let peer = null;
let localStream = null;
let currentCalls = {};

const getTurnServers = async () => {
  try {
    const apiKey = '6eb88ccf21906700de0bb66a4ca35a8d1401';
    const domain = 'metting-online.metered.live';

    const res = await fetch(
      `https://${domain}/api/v1/turn/credentials?apiKey=${apiKey}`
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
  const iceServers = await getTurnServers();
  console.log('📡 ICE servers:', iceServers.length);

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
      console.error('❌ Peer error:', err.type, err.message);
      reject(err);
    });

    peer.on('disconnected', () => {
      console.warn('⚠️ Peer disconnected, reconnecting...');
      try { peer.reconnect(); } catch (_) {}
    });
  });
};

export const callPeer = (remotePeerId) => {
  if (!peer || !localStream) {
    console.error('❌ callPeer: peer ou localStream null');
    return null;
  }
  console.log('📞 Calling peer:', remotePeerId);
  const call = peer.call(remotePeerId, localStream);
  if (call) currentCalls[remotePeerId] = call;
  return call;
};

export const answerCall = (call) => {
  if (!localStream) {
    console.error('❌ answerCall: localStream null');
    return;
  }
  console.log('📞 Answering call from:', call.peer);
  call.answer(localStream);
  currentCalls[call.peer] = call;
};

export const closeCall = (remotePeerId) => {
  try {
    if (currentCalls[remotePeerId]) {
      currentCalls[remotePeerId].close();
      delete currentCalls[remotePeerId];
    }
  } catch (_) {}
};

export const resetMedia = () => {
  try {
    localStream?.getTracks().forEach(t => t.stop());
  } catch (_) {}
  try {
    Object.values(currentCalls).forEach(c => c.close());
  } catch (_) {}
  try {
    peer?.destroy();
  } catch (_) {}
  peer = null;
  localStream = null;
  currentCalls = {};
};
