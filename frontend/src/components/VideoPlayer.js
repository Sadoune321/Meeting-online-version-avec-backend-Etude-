import React, { useRef, useEffect, useState } from 'react';

export default function VideoPlayer({ stream, userName, muted = false }) {
  const videoRef = useRef(null);
  const [needsClick, setNeedsClick] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;

    const playVideo = async () => {
      try {
        await video.play();
        setNeedsClick(false);
        console.log('✅ Video playing:', userName);
      } catch (err) {
        console.warn('⚠️ Autoplay blocked:', err.message);
        setNeedsClick(true);
      }
    };

    playVideo();
  }, [stream]);

  const handleClick = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      setNeedsClick(false);
    } catch (err) {
      console.error('play error:', err);
    }
  };

  return (
    <div style={styles.container} onClick={handleClick}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={styles.video}
      />
      {!stream && (
        <div style={styles.overlay}>
          <span style={styles.text}>En attente...</span>
        </div>
      )}
      {needsClick && (
        <div style={styles.overlay}>
          <span style={styles.text}>👆 Cliquez pour démarrer</span>
        </div>
      )}
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  text: { color: '#fff', fontSize: '14px' },
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
