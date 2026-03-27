# Telegram Live Call Mini App

A minimal WebRTC voice call project running inside a Telegram Mini App.

## Parts

- frontend: Telegram Mini App UI
- signaling-server: WebSocket signaling for WebRTC
- bot: Telegram bot to open the Mini App

## Setup

### 1. Signaling server

cd signaling-server
npm install
node server.js

### 2. Frontend

Edit src/App.jsx and set:

const SIGNALING_URL = "wss://your-domain.com/ws";

Then:

cd frontend
npm install
npm run build

Serve the built files behind HTTPS.

### 3. Bot

Copy `.env.example` to `.env` and set values.

cd bot
npm install
node bot.js

## Deployment

Use Nginx to:
- serve frontend static files
- proxy `/ws` to signaling server

Example:

server {
    listen 80;
    server_name your-domain.com;

    location /ws {
        proxy_pass http://127.0.0.1:3001/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    location / {
        root /var/www/miniapp;
        try_files $uri /index.html;
    }
}

Enable HTTPS with Let's Encrypt.

## Important

STUN only is not enough for many real-world connections.
Add a TURN server for better reliability.
