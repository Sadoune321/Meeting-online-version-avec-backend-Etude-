import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  initMedia, createPeer, callPeer,
  answerCall, getLocalStream, resetMedia,
} from '../services/mediaService';
import VideoPlayer from './VideoPlayer';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://meeting-online-zcrm.onrender.com';

export default function Room({ roomId, userName }) {
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [status, setStatus] = useState('Connexion...');
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const callsRef = useRef({});

  const hostPeerId = `${roomId}-host`;
  const guestPeerId = `${roomId}-${userName}`;

  const attachRemoteStream = useCallback((peerId, stream, peerName) => {
    setPeers((prev) => {
      const exists = prev.find(p => p.peerId === peerId);
      if (exists) return prev.map(p => p.peerId === peerId ? { ...p, stream } : p);
      return [...prev, { peerId, userName: peerName || 'Inconnu', stream }];
    });
  }, []);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => console.log('✅ Socket connected:', socket.id));

    const init = async () => {
      // 1. Caméra + micro
      const stream = await initMedia();
      setLocalStream(stream);
      console.log('📷 Local stream obtained');

      // 2. Rejoindre la room via socket
      socket.emit('joinRoom', { roomId, userName }, async ({ existingPeers, isHost, error }) => {
        if (error) return console.error('❌ joinRoom error:', error);

        // 3. Créer le peer PeerJS
        const peerId = isHost ? hostPeerId : guestPeerId;
        const { peer } = await createPeer(peerId);
        peerRef.current = peer;
        setStatus(isHost ? 'En attente...' : 'Connexion à l\'hôte...');

        // 4. Recevoir les appels entrants
        peer.on('call', (call) => {
          console.log('📞 Incoming call from:', call.peer);
          answerCall(call);
          callsRef.current[call.peer] = call;
          call.on('stream', (remoteStream) => {
            attachRemoteStream(call.peer, remoteStream, call.peer);
            setStatus('Connecté ✓');
          });
          call.on('close', () => {
            setPeers(prev => prev.filter(p => p.peerId !== call.peer));
          });
        });

        // 5. Appeler les peers existants
        if (existingPeers?.length > 0) {
          for (const { peerId: remotePeerId, userName: peerName } of existingPeers) {
            const call = callPeer(remotePeerId);
            if (!call) continue;
            callsRef.current[remotePeerId] = call;
            call.on('stream', (remoteStream) => {
              attachRemoteStream(remotePeerId, remoteStream, peerName);
              setStatus('Connecté ✓');
            });
            call.on('close', () => {
              setPeers(prev => prev.filter(p => p.peerId !== remotePeerId));
            });
          }
        }
      });

      // 6. Nouveau peer rejoint
      socket.on('newPeer', async ({ peerId: remotePeerId, userName: peerName }) => {
        console.log('👤 New peer:', peerName, remotePeerId);
        setPeers(prev => {
          if (prev.find(p => p.peerId === remotePeerId)) return prev;
          return [...prev, { peerId: remotePeerId, userName: peerName, stream: null }];
        });

        // Appeler le nouveau peer
        setTimeout(() => {
          const call = callPeer(remotePeerId);
          if (!call) return;
          callsRef.current[remotePeerId] = call;
          call.on('stream', (remoteStream) => {
            attachRemoteStream(remotePeerId, remoteStream, peerName);
          });
          call.on('close', () => {
            setPeers(prev => prev.filter(p => p.peerId !== remotePeerId));
          });
        }, 1000);
      });

      socket.on('peerLeft', ({ peerId: remotePeerId }) => {
        console.log('👋 Peer left:', remotePeerId);
        try { callsRef.current[remotePeerId]?.close(); } catch (_) {}
        delete callsRef.current[remotePeerId];
        setPeers(prev => prev.filter(p => p.peerId !== remotePeerId));
      });
    };

    init().catch(console.error);

    return () => {
      resetMedia();
      socket.disconnect();
    };
  }, [roomId, userName]);

  const toggleMute = () => {
    getLocalStream()?.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
    setMuted(prev => !prev);
  };

  const toggleVideo = () => {
    getLocalStream()?.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
    setVideoOff(prev => !prev);
  };

  const leaveRoom = () => {
    resetMedia();
    if (socketRef.current) socketRef.current.disconnect();
    window.location.reload();
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Room: {roomId}</h2>
      <p style={styles.status}>{status}</p>
      <div style={styles.grid}>
        {localStream && <VideoPlayer stream={localStream} userName={`${userName} (Vous)`} muted={true} />}
        {peers.map(peer => (
          <VideoPlayer key={peer.peerId} stream={peer.stream} userName={peer.userName} muted={false} />
        ))}
      </div>
      <div style={styles.controls}>
        <button style={styles.btn} onClick={toggleMute}>{muted ? '🔇 Unmute' : '🎤 Mute'}</button>
        <button style={styles.btn} onClick={toggleVideo}>{videoOff ? '📷 Start Video' : '📹 Stop Video'}</button>
        <button style={{ ...styles.btn, backgroundColor: '#e94560' }} onClick={leaveRoom}>🚪 Quitter</button>
      </div>
    </div>
  );
}

const styles = {
  container: { backgroundColor: '#1a1a2e', minHeight: '100vh', padding: '20px', color: '#fff' },
  title: { textAlign: 'center', marginBottom: '8px' },
  status: { textAlign: 'center', color: '#00d2ff', marginBottom: '20px', fontSize: '14px' },
  grid: { display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' },
  controls: { display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '30px' },
  btn: { padding: '12px 24px', borderRadius: '8px', border: 'none', backgroundColor: '#0f3460', color: '#fff', fontSize: '16px', cursor: 'pointer' },
};
