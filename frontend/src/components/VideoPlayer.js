import React, { useRef, useEffect } from 'react';

export default function VideoPlayer({ stream, userName, muted = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      video.srcObject = stream;
      video.play().catch(err => console.warn('autoplay blocked:', err.message));
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  return (
    <div style={styles.container}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={styles.video}
      />
      {!stream && (
        <div style={styles.placeholder}>
          <span style={styles.placeholderText}>En attente...</span>
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
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  placeholder: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: '#fff', fontSize: '14px' },
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
