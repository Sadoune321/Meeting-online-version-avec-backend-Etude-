import React, { useState, useEffect } from 'react';
import Room from './components/Room';

function App() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const unlock = () => {
      document.querySelectorAll('video').forEach(v => {
        v.play().catch(() => {});
      });
    };
    document.addEventListener('click', unlock, { once: true });
    return () => document.removeEventListener('click', unlock);
  }, []);

  const handleJoin = () => {
    if (roomId.trim() && userName.trim()) {
      setJoined(true);
    }
  };

  if (joined) {
    return <Room roomId={roomId} userName={userName} />;
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>📹 Meet App</h1>

        <input
          style={styles.input}
          type="text"
          placeholder="Votre nom"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
        />

        <input
          style={styles.input}
          type="text"
          placeholder="Room ID (ex: room-123)"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />

        <button style={styles.button} onClick={handleJoin}>
          Rejoindre
        </button>
      </div>
    </div>
  );
}
