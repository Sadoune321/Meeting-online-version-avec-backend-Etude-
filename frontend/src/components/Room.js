import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  loadDevice,
  createSendTransport,
  publishStream,
  consumeStream,
  getDevice,
} from '../services/mediaService';
import VideoPlayer from './VideoPlayer';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://meeting-online-zcrm.onrender.com';

export default function Room({ roomId, userName }) {
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]); // { peerId, userName, stream }
  const [muted, setMuted] = useState(false);
  const [videoOff, setVideoOff] = useState(false);
  const socketRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const socket = io(SERVER_URL, {
      transports: ['polling', 'websocket'],
      forceNew: true,
      reconnection: false,
    });
    socketRef.current = socket;

    socket.on('connect', () => console.log('✅ Socket connected:', socket.id));
    socket.on('connect_error', (err) => console.error('❌ Socket error:', err.message));

    const init = async () => {
      // 1️⃣ Obtenir le flux local
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        console.log('📷 Local stream obtained');
      } catch (err) {
        console.error('❌ getUserMedia error:', err.message);
      }

      // 2️⃣ Rejoindre la room
      socket.emit('joinRoom', { roomId, userName }, async ({ rtpCapabilities, existingProducers, error }) => {
        if (error) return console.error('❌ joinRoom error:', error);

        // 3️⃣ Charger le device et créer transport
        await loadDevice(rtpCapabilities);
        console.log('✅ Device loaded');
        await createSendTransport(socket, roomId);
        console.log('✅ Send transport created');

        // 4️⃣ Publier le flux local
        if (stream) {
          await publishStream(stream);
          console.log('✅ Local stream published');
        }

        // 5️⃣ Consommer les producers existants
        if (existingProducers?.length > 0) {
          for (const { producerId, peerId, kind, userName: peerName } of existingProducers) {
            try {
              const device = getDevice();
              const peerStream = await consumeStream(socket, roomId, producerId, device.rtpCapabilities);
              setPeers((prev) => [...prev, { peerId, userName: peerName, stream: peerStream }]);
            } catch (err) {
              console.error('❌ consume existing producer error:', err);
            }
          }
        }
      });

      // 6️⃣ Nouveau peer rejoint
      socket.on('newPeer', ({ peerId, userName: peerName }) => {
        console.log('👤 New peer:', peerName);
        setPeers((prev) => [...prev, { peerId, userName: peerName, stream: null }]);
      });

      // 7️⃣ Nouveau producer disponible
      socket.on('newProducer', async ({ producerId, peerId, kind }) => {
        try {
          const device = getDevice();
          if (!device) return;
          const peerStream = await consumeStream(socket, roomId, producerId, device.rtpCapabilities);
          console.log('✅ Consumed stream from peer:', peerId);
          setPeers((prev) =>
            prev.map((p) => (p.peerId === peerId ? { ...p, stream: peerStream } : p))
          );
        } catch (err) {
          console.error('❌ consumeStream error:', err);
        }
      });

      // 8️⃣ Peer parti
      socket.on('peerLeft', ({ peerId }) => {
        console.log('👋 Peer left:', peerId);
        setPeers((prev) => prev.filter((p) => p.peerId !== peerId));
      });
    };

    init().catch(console.error);

    return () => socket.disconnect();
  }, []);

  // 9️⃣ Contrôles du local
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
      setMuted((prev) => !prev);
    }
  };
  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
      setVideoOff((prev) => !prev);
    }
  };
  const leaveRoom = () => {
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (socketRef.current) socketRef.current.disconnect();
    window.location.reload();
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Room: {roomId}</h2>

      <div style={styles.grid}>
        {localStream && <VideoPlayer stream={localStream} userName={`${userName} (Vous)`} muted={true} />}
        {peers.map((peer) => (
          <VideoPlayer
            key={peer.peerId}
            stream={peer.stream}
            userName={peer.userName}
            muted={false} // activer le son des autres peers
          />
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
