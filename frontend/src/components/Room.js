import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { loadDevice, createSendTransport, publishStream, consumeStream, getDevice } from '../services/mediaService';
import VideoPlayer from './VideoPlayer';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://127.0.0.1:5000';

function Room({ roomId, userName }) {
  const [localStream, setLocalStream] = useState(null);
  const [peers, setPeers] = useState([]);
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
      extraHeaders: {
        'ngrok-skip-browser-warning': 'true',
      },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(' Socket connected:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.error(' Socket error:', err.message);
    });

    const init = async () => {
      
      const hasMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

      if (hasMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          setLocalStream(stream);
          console.log(' Local stream obtained');

          socket.emit('joinRoom', { roomId, userName }, async ({ rtpCapabilities, error }) => {
            if (error) return console.error(' joinRoom error:', error);
            console.log(' Joined room');

            await loadDevice(rtpCapabilities);
            console.log(' Device loaded');

            await createSendTransport(socket, roomId);
            console.log(' Send transport created');

            await publishStream(stream);
            console.log(' Stream published');
          });

        } catch (err) {
          console.error(' Media error:', err.message);
          
          socket.emit('joinRoom', { roomId, userName }, async ({ rtpCapabilities, error }) => {
            if (error) return console.error(' joinRoom error:', error);
            await loadDevice(rtpCapabilities);
            await createSendTransport(socket, roomId);
          });
        }
      } else {
        
        console.warn(' getUserMedia non disponible - HTTPS requis sur mobile');
        socket.emit('joinRoom', { roomId, userName }, async ({ rtpCapabilities, error }) => {
          if (error) return console.error(' joinRoom error:', error);
          console.log(' Joined room sans caméra');
          await loadDevice(rtpCapabilities);
          await createSendTransport(socket, roomId);
        });
      }

      
      socket.on('newPeer', ({ peerId, userName: peerName }) => {
        console.log(' New peer:', peerName);
        setPeers((prev) => {
          if (prev.find((p) => p.peerId === peerId)) return prev;
          return [...prev, { peerId, userName: peerName, stream: null }];
        });
      });

      
      socket.on('newProducer', async ({ producerId, peerId, kind }) => {
        console.log(' New producer:', producerId, 'kind:', kind);
        try {
          const device = getDevice();
          if (!device) return console.error(' Device not loaded');
          const peerStream = await consumeStream(socket, roomId, producerId, device.rtpCapabilities);
          console.log('Consumed stream from:', peerId);
          setPeers((prev) => {
            const exists = prev.find((p) => p.peerId === peerId);
            if (exists) {
              return prev.map((p) => p.peerId === peerId ? { ...p, stream: peerStream } : p);
            }
            return [...prev, { peerId, userName: 'Participant', stream: peerStream }];
          });
        } catch (err) {
          console.error(' consumeStream error:', err);
        }
      });

      // Peer parti
      socket.on('peerLeft', ({ peerId }) => {
        console.log(' Peer left:', peerId);
        setPeers((prev) => prev.filter((p) => p.peerId !== peerId));
      });
    };

    init().catch(console.error);

    return () => {
      socket.disconnect();
    };
  }, []);

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
      <h2 style={styles.title}>Room : {roomId}</h2>

      {!navigator.mediaDevices && (
        <p style={styles.warning}>
           Caméra non disponible — HTTPS requis sur mobile
        </p>
      )}

      <div style={styles.grid}>
        <VideoPlayer stream={localStream} userName={`${userName} (Vous)`} muted={true} />
        {peers.map((peer) => (
          <VideoPlayer key={peer.peerId} stream={peer.stream} userName={peer.userName} />
        ))}
      </div>

      <div style={styles.controls}>
        <button style={styles.btn} onClick={toggleMute}>
          {muted ? ' Unmute' : ' Mute'}
        </button>
        <button style={styles.btn} onClick={toggleVideo}>
          {videoOff ? ' Start Video' : ' Stop Video'}
        </button>
        <button style={{ ...styles.btn, backgroundColor: '#e94560' }} onClick={leaveRoom}>
           Quitter
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { backgroundColor: '#1a1a2e', minHeight: '100vh', padding: '20px', color: '#fff' },
  title: { textAlign: 'center', marginBottom: '20px' },
  warning: { textAlign: 'center', color: '#e94560', marginBottom: '16px' },
  grid: { display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'center' },
  controls: { display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '30px' },
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

export default Room;