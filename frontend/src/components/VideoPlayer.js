import React, { useRef, useEffect, useState } from 'react';

export default function VideoPlayer({ stream, userName, muted = false }) {
  const videoRef = useRef(null);
  const [needsClick, setNeedsClick] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!stream) {
      video.srcObject = null;
      return;
    }

    // ✅ Arrêter le stream précédent proprement
    video.pause();
    video.srcObject = null;

    // ✅ Assigner le nouveau stream
    video.srcObject = stream;

    const playVideo = async () => {
      try {
        await video.play();
        setNeedsClick(false);
        console.log('✅ Video playing:', userName);
      } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('⚠️ Autoplay blocked:', err.message);
        setNeedsClick(true);
      }
    };

    // ✅ Attendre que les métadonnées soient chargées
    video.onloadedmetadata = () => {
      playVideo();
    };

    // ✅ Fallback si onloadedmetadata ne se déclenche pas
    setTimeout(() => {
      if (video.readyState >= 2) {
        playVideo();
      }
    }, 500);

  }, [stream, userName]);

  const handleClick = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setNeedsClick(false);
      console.log('✅ Video started by click:', userName);
    } catch (err) {
      console.error('❌ play error:', err);
    }
  };

  return (
    <div style={styles.container} onClick={handleClick}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{
          ...styles.video,
          display: stream ? 'block' : 'none',
        }}
      />

      {/* Placeholder si pas de stream */}
      {!stream && (
        <div style={styles.overlay}>
          <div style={styles.cameraIcon}>📷</div>
          <span style={styles.text}>En attente...</span>
        </div>
      )}

      {/* Bouton cliquer pour démarrer */}
      {stream && needsClick && (
        <div style={styles.overlay}>
          <span style={styles.clickText}>👆 Cliquez pour démarrer</span>
        </div>
      )}

      {/* Nom du peer */}
      <span style={styles.name}>{userName}</span>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    borderRadius: '10px',
    overflow: 'hidden',
    backgroundColor: '#0f3460',
    width: '320px',
    height: '240px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    gap: '8px',
  },
  cameraIcon: {
    fontSize: '32px',
    opacity: 0.4,
  },
  text: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '14px',
  },
  clickText: {
    color: '#fff',
    fontSize: '14px',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: '8px 16px',
    borderRadius: '8px',
  },
  name: {
    position: 'absolute',
    bottom: '8px',
    left: '8px',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '14px',
  },
};
