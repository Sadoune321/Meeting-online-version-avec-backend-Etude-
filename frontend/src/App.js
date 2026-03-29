import React, { useState } from 'react';
import Room from './components/Room';

function App() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');

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

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    backgroundColor: '#1a1a2e',
  },
  card: {
    backgroundColor: '#16213e',
    padding: '40px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '320px',
  },
  title: {
    color: '#fff',
    textAlign: 'center',
    margin: 0,
  },
  input: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #0f3460',
    backgroundColor: '#0f3460',
    color: '#fff',
    fontSize: '16px',
  },
  button: {
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#e94560',
    color: '#fff',
    fontSize: '16px',
    cursor: 'pointer',
  },
};

export default App;