import React, { useEffect, useRef } from 'react';

function VideoPlayer({ stream, userName, muted = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    video.onloadedmetadata = () => {
      video.play().catch((err) => {
        console.error('Video play error:', err.message);
      });
    };
  }, [stream]);

  return (
    <div style={styles.container}>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          style={styles.video}
        />
      ) : (
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
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#fff',
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
    fontSize: '14px',
  },
};

export default VideoPlayer;
