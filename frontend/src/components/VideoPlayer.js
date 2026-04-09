import React, { useRef, useEffect } from 'react';

export default function VideoPlayer({ stream, userName, muted = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    video.muted = muted;
    video.volume = muted ? 0 : 1;

    const tryPlay = () => {
      video.play().catch((err) => {
        console.warn('⚠️ play blocked:', err.message);
        // ✅ Débloquer au prochain clic sur la page
        const resume = () => {
          video.play().catch(console.warn);
          console.log('▶️ Resumed by click');
        };
        document.addEventListener('click', resume, { once: true });
        document.addEventListener('touchstart', resume, { once: true });
      });
    };

    if (video.readyState >= 2) {
      tryPlay();
    } else {
      video.onloadedmetadata = () => tryPlay();
    }

  }, [stream, muted]);

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
    display: 'block',
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
