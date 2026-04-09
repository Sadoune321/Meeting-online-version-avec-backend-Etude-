import Peer from 'peerjs';

let peer = null;
let localStream = null;
let currentCalls = {};

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://meeting-online-zcrm.onrender.com';

const getTurnServers = async () => {
  try {
    const apiKey = '6eb88ccf21906700de0bb66a4ca35a8d1401';
    const domain = 'meeting-online.metered.live'; // CORRIGÉ

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
  
  // Fallback STUN/TURN servers
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];
};

export const initMedia = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: true,
    });
    console.log('📷 Media initialized');
    return localStream;
  } catch (err) {
    console.error('❌ Media init failed:', err);
    throw err;
  }
};

export const getLocalStream = () => localStream;

export const createPeer = async (peerId) => {
  const iceServers = await getTurnServers();
  console.log('📡 ICE servers:', iceServers.length);

  return new Promise((resolve, reject) => {
    // Utiliser le serveur PeerJS de votre backend
    const host = SERVER_URL.replace('https://', '').replace('http://', '');
    
    peer = new Peer(peerId, {
      host: host,
      port: 443,
      secure: true,
      path: '/peerjs',
      config: {
        iceServers,
        iceTransportPolicy: 'all', // Changé de 'relay' à 'all'
      },
      debug: 3, // Ajouté pour plus de logs
    });

    peer.on('open', (id) => {
      console.log('✅ Peer ready:', id);
      resolve({ peer, id });
    });

    peer.on('error', (err) => {
      console.error('❌ Peer error:', err);
      reject(err);
    });

    peer.on('disconnected', () => {
      console.warn('⚠️ Peer disconnected, reconnecting...');
      setTimeout(() => {
        try { 
          peer.reconnect(); 
        } catch (e) {
          console.error('Reconnect failed:', e);
        }
      }, 1000);
    });
  });
};

export const callPeer = (remotePeerId) => {
  const currentStream = getLocalStream();
  
  if (!peer) {
    console.error('❌ callPeer: peer null');
    return null;
  }
  
  if (!currentStream) {
    console.error('❌ callPeer: localStream null');
    return null;
  }

  // Vérifier l'état du stream
  const videoTracks = currentStream.getVideoTracks();
  const audioTracks = currentStream.getAudioTracks();
  
  if (videoTracks.length === 0 || audioTracks.length === 0) {
    console.error('❌ Stream has no tracks:', { video: videoTracks.length, audio: audioTracks.length });
    return null;
  }

  console.log('📞 Calling peer:', remotePeerId);
  console.log('📹 Stream status:', {
    video: videoTracks[0]?.enabled,
    audio: audioTracks[0]?.enabled
  });

  try {
    const call = peer.call(remotePeerId, currentStream);
    if (call) {
      currentCalls[remotePeerId] = call;
      console.log('✅ Call created:', remotePeerId);
    }
    return call;
  } catch (err) {
    console.error('❌ Call failed:', err);
    return null;
  }
};

export const answerCall = (call) => {
  const currentStream = getLocalStream();
  if (!currentStream) {
    console.error('❌ answerCall: localStream null');
    return;
  }
  console.log('📞 Answering call from:', call.peer);
  call.answer(currentStream);
  currentCalls[call.peer] = call;
};

export const closeCall = (remotePeerId) => {
  try {
    if (currentCalls[remotePeerId]) {
      currentCalls[remotePeerId].close();
      delete currentCalls[remotePeerId];
      console.log('📵 Call closed:', remotePeerId);
    }
  } catch (err) {
    console.error('Error closing call:', err);
  }
};

export const resetMedia = () => {
  try {
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }
  } catch (err) {
    console.error('Error stopping tracks:', err);
  }
  
  try {
    Object.values(currentCalls).forEach(c => c.close());
  } catch (err) {
    console.error('Error closing calls:', err);
  }
  
  try {
    if (peer) {
      peer.destroy();
    }
  } catch (err) {
    console.error('Error destroying peer:', err);
  }
  
  peer = null;
  localStream = null;
  currentCalls = {};
};
