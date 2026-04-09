import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import Peer from 'peerjs';

const SERVER_URL =
  process.env.REACT_APP_SERVER_URL ||
  'https://meeting-online-zcrm.onrender.com';

async function getTurnServers() {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];
}

export default function Room({ roomId, userName }) {
  const [isConnected, setIsConnected] = useState(false);
  const [muted, setMuted]             = useState(false);
  const [videoOff, setVideoOff]       = useState(false);
  const [status, setStatus]           = useState('Initialisation...');
  const [role, setRole]               = useState(null);

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerRef        = useRef(null);
  const callRef        = useRef(null);
  const retryTimer     = useRef(null);
  const mountedRef     = useRef(true);
  const connectedRef   = useRef(false);
  const socketRef      = useRef(null);

  const hostId  = `${roomId}-host`;
  const guestId = `${roomId}-${userName}`;

  // ─── Attach remote stream (même logique que MeetHub) ──────────────────────
  const attachStream = useCallback((stream) => {
    console.log('attachStream:', stream.getTracks().map(t => `${t.kind}(${t.readyState})`).join(', '));
    const video = remoteVideoRef.current;
    if (!video) { console.error('remoteVideoRef NULL'); return; }
    video.srcObject = stream;
    video.muted = false;
    video.volume = 1;
    video.play()
      .then(() => console.log('✅ video.play() OK'))
      .catch(err => {
        console.warn('video.play() blocked:', err.message);
        const resume = () => { video.play().catch(console.warn); };
        document.addEventListener('click', resume, { once: true });
        document.addEventListener('touchstart', resume, { once: true });
      });
    connectedRef.current = true;
    setIsConnected(true);
    setStatus('Connecté ✓');
  }, []);

  // ─── Wire call (même logique que MeetHub) ─────────────────────────────────
  const wireCall = useCallback((call) => {
    callRef.current = call;

    const checkPc = setInterval(() => {
      const pc = call.peerConnection;
      if (!pc) return;
      const state = pc.iceConnectionState;
      console.log('ICE:', state);
      if (state === 'failed') {
        console.error('ICE FAILED');
        setStatus('Connexion échouée');
      }
      if (state === 'connected' || state === 'completed') {
        console.log('✅ ICE connected');
        clearInterval(checkPc);
      }
    }, 800);

    call.on('stream', (remote) => {
      clearInterval(checkPc);
      if (!mountedRef.current) return;
      console.log('"stream" event reçu ✓');
      attachStream(remote);
    });

    call.on('close', () => {
      clearInterval(checkPc);
      if (!mountedRef.current) return;
      connectedRef.current = false;
      setIsConnected(false);
      setStatus('Peer déconnecté');
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    });

    call.on('error', (e) => {
      clearInterval(checkPc);
      console.error('call error:', e);
    });
  }, [attachStream]);

  // ─── Call host (même logique que MeetHub) ─────────────────────────────────
  const callHost = useCallback((peer) => {
    if (!mountedRef.current || !localStreamRef.current || connectedRef.current) return;
    console.log('Calling host:', hostId);
    setStatus('Appel en cours...');

    let call;
    try {
      call = peer.call(hostId, localStreamRef.current);
    } catch (e) {
      console.error('peer.call() threw:', e.message);
      retryTimer.current = setTimeout(() => callHost(peer), 3000);
      return;
    }

    if (!call) {
      console.error('peer.call() returned null');
      retryTimer.current = setTimeout(() => callHost(peer), 3000);
      return;
    }

    wireCall(call);

    // Watchdog — retry si pas de stream après 8s
    const wd = setTimeout(() => {
      if (!connectedRef.current && mountedRef.current) {
        console.warn('Watchdog: pas de stream après 8s, retry...');
        setStatus('Reconnexion...');
        try { call.close(); } catch (_) {}
        retryTimer.current = setTimeout(() => callHost(peer), 2000);
      }
    }, 8000);

    call.on('stream', () => clearTimeout(wd));
    call.on('error', () => {
      clearTimeout(wd);
      if (!connectedRef.current && mountedRef.current) {
        retryTimer.current = setTimeout(() => callHost(peer), 3000);
      }
    });
  }, [hostId, wireCall]);

  // ─── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    connectedRef.current = false;

    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => console.log('✅ Socket connected:', socket.id));
    socket.on('connect_error', err => console.error('❌ Socket error:', err.message));

    const init = async () => {
      // 1. Caméra + micro
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
        console.log('✅ Camera & mic OK');
      } catch (e) {
        console.error('getUserMedia:', e.message);
        setStatus('Erreur: autorisez la caméra et le micro');
        return;
      }

      // 2. TURN servers
      setStatus('Chargement TURN...');
      const iceServers = await getTurnServers();
      console.log('ICE servers:', iceServers.length);

      const cfg = {
        config: {
          iceServers,
          iceTransportPolicy: 'relay',
        },
      };

      // 3. Rejoindre la room via socket
      socket.emit('joinRoom', { roomId, userName }, ({ isHost, error }) => {
        if (error) return console.error('joinRoom error:', error);

        const makePeer = (id, onOpen, onIdTaken) => {
          const peer = id ? new Peer(id, cfg) : new Peer(cfg);
          peer.on('open', (pid) => {
            if (mountedRef.current) onOpen(peer, pid);
          });
          peer.on('error', (err) => {
            if (!mountedRef.current) return;
            console.error('Peer error:', err.type);
            if (err.type === 'unavailable-id' && onIdTaken) {
              peer.destroy();
              onIdTaken();
            }
          });
          return peer;
        };

        const tryHost = () => {
          console.log('Registering as HOST:', hostId);
          makePeer(hostId, (peer, id) => {
            console.log('✅ HOST ready:', id);
            setRole('host');
            setStatus('En attente d\'un invité...');
            peerRef.current = peer;

            peer.on('call', (incomingCall) => {
              if (!mountedRef.current) return;
              console.log('📞 Incoming call — answering');
              setStatus('Invité en connexion...');
              incomingCall.answer(localStreamRef.current);
              wireCall(incomingCall);
            });
          }, tryGuest);
        };

        const tryGuest = () => {
          console.log('Registering as GUEST:', guestId);
          makePeer(guestId, (peer, id) => {
            console.log('✅ GUEST ready:', id);
            setRole('guest');
            setStatus('Connexion à l\'hôte...');
            peerRef.current = peer;
            callHost(peer);
          }, () => {
            console.log('Guest ID pris — ID aléatoire');
            makePeer(undefined, (peer, id) => {
              if (!mountedRef.current) return;
              console.log('✅ GUEST (random):', id);
              setRole('guest');
              setStatus('Connexion à l\'hôte...');
              peerRef.current = peer;
              callHost(peer);
            });
          });
        };

        if (isHost) {
          tryHost();
        } else {
          tryGuest();
        }
      });
    };

    init().catch(console.error);

    return () => {
      mountedRef.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      try { callRef.current?.close(); } catch (_) {}
      try { peerRef.current?.destroy(); } catch (_) {}
      socket.disconnect();
    };
  }, [roomId, userName, wireCall, callHost, hostId, guestId]);

  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => (t.enabled = !t.enabled));
    setMuted(prev => !prev);
  };

  const toggleVideo = () => {
    localStreamRef.current?.getVideoTracks().forEach(t => (t.enabled = !t.enabled));
    setVideoOff(prev => !prev);
  };

  const leaveRoom = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    try { callRef.current?.close(); } catch (_) {}
    try { peerRef.current?.destroy(); } catch (_) {}
    if (socketRef.current) socketRef.current.disconnect();
    window.location.reload();
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Room: {roomId}</h2>
      <p style={styles.status}>{status}</p>

      <div style={styles.grid}>
        {/* Vidéo locale */}
        <div style={styles.tile}>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            style={styles.video}
          />
          <span style={styles.name}>
            {userName} (Vous) {role === 'host' ? '· Hôte' : role === 'guest' ? '· Invité' : ''}
          </span>
        </div>

        {/* Vidéo distante */}
        <div style={{
          ...styles.tile,
          borderColor: isConnected ? 'rgba(0,210,255,0.3)' : 'rgba(255,255,255,0.08)',
        }}>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              ...styles.video,
              display: isConnected ? 'block' : 'none',
            }}
          />
          {!isConnected && (
            <div style={styles.waiting}>
              <span style={styles.waitingText}>
                {role === 'host' ? '⏳ En attente d\'un invité...' : '🔄 Connexion...'}
              </span>
            </div>
          )}
          {isConnected && (
            <span style={styles.name}>
              {role === 'host' ? 'Invité' : 'Hôte'}
            </span>
          )}
        </div>
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
  title: {
    textAlign: 'center',
    marginBottom: '8px',
    fontSize: '24px',
    fontWeight: 'bold',
  },
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
  tile: {
    position: 'relative',
    borderRadius: '12px',
    overflow: 'hidden',
    backgroundColor: '#0f3460',
    width: '320px',
    height: '240px',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  waiting: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '14px',
  },
  name: {
    position: 'absolute',
    bottom: '8px',
    left: '8px',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '13px',
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
