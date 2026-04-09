import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  loadDevice, createSendTransport, createRecvTransport,
  publishStream, consumeStream, getDevice,
} from '../services/mediaService';
import VideoPlayer from './VideoPlayer';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://meeting-online-zcrm.onrender.com';

export default function Room({ roomId, userName }) {
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]);
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => console.log('✅ Socket connected:', socket.id));
    socket.on('connect_error', (err) => console.error('❌ Socket error:', err.message));

    const init = async () => {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        console.log('📷 Local stream obtained');
      } catch (err) {
        console.error('❌ getUserMedia error:', err.message);
      }

      socket.emit('joinRoom', { roomId, userName }, async ({ rtpCapabilities, existingProducers, error }) => {
        if (error) return console.error('❌ joinRoom error:', error);

        await loadDevice(rtpCapabilities);
        console.log('✅ Device loaded');

        await createSendTransport(socket, roomId);
        console.log('✅ Send transport created');

        await createRecvTransport(socket, roomId);
        console.log('✅ Recv transport created');

        if (stream) {
          await publishStream(stream);
          console.log('✅ Local stream published');
        }

        // Consommer les producers existants
        if (existingProducers?.length > 0) {
          const device = getDevice();
          for (const { producerId, peerId, userName: peerName } of existingProducers) {
            try {
              const peerStream = await consumeStream(socket, roomId, producerId, device.rtpCapabilities);
              setPeers((prev) => [...prev, { peerId, userName: peerName, stream: peerStream }]);
              console.log('✅ Existing producer consumed:', peerId);
            } catch (err) {
              console.error('❌ consume existing error:', err);
            }
          }
        }
      });

      socket.on('newPeer', ({ peerId, userName: peerName }) => {
        console.log('👤 New peer joined:', peerName);
        setPeers((prev) => {
          if (prev.find(p => p.peerId === peerId)) return prev;
          return [...prev, { peerId, userName: peerName, stream: null }];
        });
      });

      // ✅ CORRIGÉ : ajoute le peer s'il n'existe pas encore + guard device
      socket.on('newProducer', async ({ producerId, peerId, userName: peerName }) => {
        try {
          const device = getDevice();
          if (!device) return console.error('❌ Device not ready');

          console.log('🎬 New producer from:', peerId);
          const peerStream = await consumeStream(socket, roomId, producerId, device.rtpCapabilities);

          setPeers((prev) => {
            const exists = prev.find(p => p.peerId === peerId);
            if (exists) {
              // Peer déjà dans la liste, on lui assigne le stream
              return prev.map(p => p.peerId === peerId ? { ...p, stream: peerStream } : p);
            } else {
              // Peer pas encore dans la liste (newPeer pas encore reçu)
              return [...prev, { peerId, userName: peerName || 'Inconnu', stream: peerStream }];
            }
          });
        } catch (err) {
          console.error('❌ consumeStream error:', err);
        }
      });

      socket.on('peerLeft', ({ peerId }) => {
        console.log('👋 Peer left:', peerId);
        setPeers((prev) => prev.filter(p => p.peerId !== peerId));
      });
    };

    init().catch(console.error);

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [roomId, userName]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
      setMuted((prev) => !prev);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
      setVideoOff((prev) => !prev);
    }
  };

  const leaveRoom = () => {
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (socketRef.current) socketRef.current.disconnect();
    window.location.reload();
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Room: {roomId}</h2>
      <div style={styles.grid}>
        {localStream && <VideoPlayer stream={localStream} userName={`${userName} (Vous)`} muted={true} />}
        {peers.map((peer) => (
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
  title: { textAlign: 'center', marginBottom: '20px' },
  grid: { display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' },
  controls: { display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '30px' },
  btn: { padding: '12px 24px', borderRadius: '8px', border: 'none', backgroundColor: '#0f3460', color: '#fff', fontSize: '16px', cursor: 'pointer' },
};
