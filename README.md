# Meet App - Real-Time Video Conferencing

## Overview

Meet App is a real-time video conferencing application built with Node.js, Express, WebRTC, and mediasoup SFU (Selective Forwarding Unit). It supports multiple participants in a room with audio and video streaming.

## Architecture

### SFU (Selective Forwarding Unit)

The application uses mediasoup as the SFU server. Unlike peer-to-peer WebRTC where each participant sends their stream to every other participant, the SFU acts as a central media server. Each participant sends their stream once to the SFU, and the SFU forwards it to all other participants. This approach scales better for multiple participants and reduces bandwidth consumption on the client side.

In a peer-to-peer setup with 4 participants, each participant needs to send 3 streams and receive 3 streams, resulting in 12 total connections. With an SFU, each participant sends 1 stream to the server and receives streams from the server, resulting in only 4 upload connections regardless of the number of participants.

### WebRTC

WebRTC (Web Real-Time Communication) is the underlying technology that enables real-time audio and video communication directly in the browser without plugins. The application uses WebRTC transport provided by mediasoup to establish secure media channels between clients and the SFU server.

The WebRTC connection process follows these steps. First, the client requests transport parameters from the server. Second, the client creates a local WebRTC transport using mediasoup-client. Third, DTLS (Datagram Transport Layer Security) parameters are exchanged to secure the connection. Fourth, the client produces media tracks (audio and video) through the send transport. Fifth, other clients consume those tracks through their receive transports.

### TURN Server

TURN (Traversal Using Relays around NAT) is used when direct peer-to-peer or client-to-server connections are blocked by firewalls or NAT (Network Address Translation). The mediasoup configuration includes listen IPs and announced IPs to handle NAT traversal. The announced IP is the public-facing IP address that remote clients use to connect, while the listen IP is the local interface the server binds to.

### Signaling with Socket.io

WebRTC requires a signaling mechanism to exchange connection metadata before media can flow. Socket.io handles this signaling layer. The signaling process covers the following events. The joinRoom event allows a client to join a room and receive router RTP capabilities. The createTransport event creates a WebRTC transport on the server side. The connectTransport event finalizes the DTLS handshake. The produce event starts sending media from a client. The consume event starts receiving media from another client. The newProducer event notifies other clients in the room that a new media stream is available. The peerLeft event notifies clients when a participant disconnects.

### Database

SQLite with Sequelize ORM is used to persist room and participant data. SQLite was chosen for its simplicity and zero-configuration setup, making it ideal for development and small-scale deployments. The database stores room metadata and participant information.

## Technology Stack

### Backend
- Node.js with Express for the HTTP server
- Socket.io for real-time signaling
- mediasoup for the SFU media server
- Sequelize ORM with SQLite for data persistence
- dotenv for environment configuration

### Frontend
- React for the user interface
- mediasoup-client for WebRTC transport management
- socket.io-client for signaling communication

## Project Structure
```
meet/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.js        # Sequelize SQLite configuration
│   │   │   └── mediasoup.js       # mediasoup worker and router configuration
│   │   ├── models/
│   │   │   ├── Room.js            # Room model
│   │   │   └── Participant.js     # Participant model
│   │   ├── services/
│   │   │   └── mediasoupService.js # SFU worker, room and transport management
│   │   ├── socket/
│   │   │   └── socketHandler.js   # WebRTC signaling via Socket.io
│   │   └── server.js              # Express server entry point
│   ├── .env
│   ├── package.json
│   └── database.sqlite
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Room.js            # Main room component with socket and media logic
│   │   │   └── VideoPlayer.js     # Video rendering component
│   │   ├── services/
│   │   │   └── mediaService.js    # mediasoup-client device and transport management
│   │   ├── App.js                 # Room join form
│   │   └── index.js               # React entry point
│   ├── .env
│   └── package.json
└── README.md
```

## Environment Variables

### Backend .env
```
PORT=5000
NODE_ENV=development
DATABASE_URL=./database.sqlite
CORS_ORIGIN=*
MEDIASOUP_LISTEN_IP=0.0.0.0
MEDIASOUP_ANNOUNCED_IP=your_server_ip
MEDIASOUP_MIN_PORT=40000
MEDIASOUP_MAX_PORT=41000
SOCKET_PING_TIMEOUT=60000
SOCKET_PING_INTERVAL=25000
```

### Frontend .env
```
REACT_APP_SERVER_URL=http://your_server_ip:5000
```

## Installation

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm start
```

## Media Flow

### Publishing a stream

1. Client calls getUserMedia to capture camera and microphone
2. Client emits joinRoom and receives router RTP capabilities
3. Client loads mediasoup Device with router capabilities
4. Client emits createTransport with direction send
5. Client creates a send transport using mediasoup-client
6. Client emits connectTransport to finalize DTLS
7. Client calls produce for each media track
8. Server emits newProducer to all other clients in the room

### Consuming a stream

1. Client receives newProducer event from server
2. Client emits createTransport with direction recv
3. Client creates a receive transport using mediasoup-client
4. Client emits consume with producer ID and RTP capabilities
5. Server checks canConsume and creates a server-side consumer
6. Client calls consume on the receive transport to get the media track
7. Client attaches the track to a MediaStream and renders it in a video element

## Known Limitations

- Camera and microphone access requires HTTPS in production environments
- The free ngrok plan supports only one tunnel at a time
- SQLite is suitable for development but should be replaced with PostgreSQL for production
- The mediasoup worker runs in a single process and should be clustered for high availability in production

## Deployment

For production deployment with HTTPS support, the application can be deployed on Railway, Render, or any cloud provider. HTTPS is required for camera and microphone access on mobile browsers.
