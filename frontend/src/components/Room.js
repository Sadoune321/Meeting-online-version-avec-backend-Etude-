import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  initMedia,
  createPeer,
  callPeer,
  answerCall,
  closeCall,
  getLocalStream,
  resetMedia,
} from '../services/mediaService';
import VideoPlayer from './VideoPlayer';

const SERVER_URL =
  process.env.REACT_APP_SERVER_URL ||
  'https://meeting-online-zcrm.onrender.com';

export default function Room({ roomId, userName }) {
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const [status, setStatus] = useState('Connexion...');
  const socketRef = useRef(null);
  const calledPeers = useRef(new Set());

  const attachRemoteStream = useCallback((remotePeerId, stream, peerName) => {
    console.log('🎥 Attaching stream from:', remotePeerId);
    setPeers((prev) => {
      const exists = prev.find(p => p.peerId === remotePeerId);
      if (exists) {
        return prev.map(p =>
          p.peerId === remotePeerId ? { ...p, stream } : p
        );
      }
      return [...prev, {
        peerId: remotePeerId,
        userName: peerName || remotePeerId,
        stream,
      }];
    });
  }, []);

  const setupCall = useCallback((call, peerName) => {
    let streamReceived = false;

    call.on('stream', (remoteStream) => {
      if (streamReceived) return;
      streamReceived = true;
      console.log('✅ Stream received from:', call.peer);
      attachRemoteStream(call.peer, remoteStream, peerName);
      setStatus('Connecté ✓');
    });

    call.on('close', () => {
      console.log('📵 Call closed:', call.peer);
      calledPeers.current.delete(call.peer);
      setPeers(prev => prev.filter(p => p.peerId !== call.peer));
    });

    call.on('error', (err) => {
      console.error('❌ Call error:', err);
    });
  }, [attachRemoteStream]);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => console.log('✅ Socket connected:', socket.id));
    socket.on('connect_error', err =>
      console.error('❌ Socket error:', err.message)
    );

    const init = async () => {
      // 1. Caméra + micro
      const stream = await initMedia();
      setLocalStream(stream);
      console.log('📷 Local stream obtained');

      // 2. Rejoindre la room
      socket.emit('joinRoom', { roomId, userName }, async ({
        existingPeers,
        isHost,
        error,
      }) => {
        if (error) return console.error('❌ joinRoom error:', error);
        console.log(
          `👤 Role: ${isHost ? 'HOST' : 'GUEST'}, existing: ${existingPeers?.length}`
        );

        // 3. Créer le peer PeerJS
        const peerId = isHost
          ? `${roomId}-host`
          : `${roomId}-${userName}`;

        try {
          const { peer } = await createPeer(peerId);

          // 4. Recevoir les appels entrants
          peer.on('call', (incomingCall) => {
            console.log('📞 Incoming call from:', incomingCall.peer);
            answerCall(incomingCall);
            setupCall(incomingCall, incomingCall.peer);
          });

          setStatus(
            isHost ? 'En attente d\'un invité...' : 'Connexion à l\'hôte...'
          );

          // 5. Appeler les peers existants
          if (existingPeers?.length > 0) {
            for (const { peerId: remotePeerId, userName: peerName } of existingPeers) {
              if (calledPeers.current.has(remotePeerId)) continue;
              calledPeers.current.add(remotePeerId);
              console.log('📞 Calling existing peer:', remotePeerId);
              setTimeout(() => {
                const call = callPeer(remotePeerId);
                if (call) setupCall(call, peerName);
              }, 500);
            }
          }
        } catch (err) {
          console.error('❌ createPeer error:', err);
          setStatus('Erreur de connexion');
        }
      });

      // 6. Nouveau peer rejoint
      socket.on('newPeer', ({ peerId: remotePeerId, userName: peerName }) => {
        console.log('👤 New peer joined:', peerName, remotePeerId);

        setPeers(prev => {
          if (prev.find(p => p.peerId === remotePeerId)) return prev;
          return [...prev, {
            peerId: remotePeerId,
            userName: peerName,
            stream: null,
          }];
        });

        if (calledPeers.current.has(remotePeerId)) return;
        calledPeers.current.add(remotePeerId);

        setTimeout(() => {
          const call = callPeer(remotePeerId);
          if (call) setupCall(call, peerName);
        }, 1000);
      });

      socket.on('peerLeft', ({ peerId: remotePeerId }) => {
        console.log('👋 Peer left:', remotePeerId);
        closeCall(remotePeerId);
        calledPeers.current.delete(remotePeerId);
        setPeers(prev => prev.filter(p => p.peerId !== remotePeerId));
      });
    };

    init().catch(err => {
      console.error('❌ Init error:', err);
      setStatus('Erreur: autorisez la caméra et le micro');
    });

    return () => {
      resetMedia();
      socket.disconnect();
    };
  }, [roomId, userName, setupCall]);

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
        {localStream && (
          <VideoPlayer
            stream={localStream}
            userName={`${userName} (Vous)`}
            muted={true}
          />
        )}
        {peers.map(peer => (
          <VideoPlayer
            key={peer.peerId}
            stream={peer.stream}
            userName={peer.userName}
            muted={false}
          />
        ))}
      </div>
      <div style={styles.controls}>
        <button style={styles.btn} onClick={toggleMute}>
          {muted ? '🔇 Unmute' : '🎤 Mute'}
        </button>
        <button style={styles.btn} onClick={toggleVideo}>
          {videoOff ? '📷 Start Video' : '📹 Stop Video'}
        </button>
        <button
          style={{ ...styles.btn, backgroundColor: '#e94560' }}
          onClick={leaveRoom}
        >
          🚪 Quitter
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#1a1a2e',
    minHeight: '100vh',
    padding: '20px',
    color: '#fff',
  },
  title: { textAlign: 'center', marginBottom: '8px' },
  status: {
    textAlign: 'center',
    color: '#00d2ff',
    marginBottom: '20px',
    fontSize: '14px',
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    justifyContent: 'center',
  },
  controls: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    marginTop: '30px',
  },
  btn: {
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#0f3460',
    color: '#fff',
    fontSize: '16px',
    cursor: 'pointer',
  },
};
