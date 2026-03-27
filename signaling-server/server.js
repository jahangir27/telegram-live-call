const http = require("http");
const WebSocket = require("ws");

const server = http.createServer();
const wss = new WebSocket.Server({ server, path: "/ws" });

const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, []);
  }
  return rooms.get(roomId);
}

function removeFromRoom(ws) {
  if (!ws.roomId) return;

  const peers = rooms.get(ws.roomId) || [];
  const remaining = peers.filter((peer) => peer !== ws);

  if (remaining.length === 0) {
    rooms.delete(ws.roomId);
  } else {
    rooms.set(ws.roomId, remaining);
    remaining.forEach((peer) => {
      send(peer, { type: "peer-left" });
    });
  }

  ws.roomId = null;
}

wss.on("connection", (ws) => {
  ws.roomId = null;
  ws.userId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    if (msg.type === "join") {
      const roomId = String(msg.roomId || "").trim();
      if (!roomId) {
        send(ws, { type: "error", message: "Missing roomId" });
        return;
      }

      removeFromRoom(ws);

      const peers = getRoom(roomId);
      if (peers.length >= 2) {
        send(ws, { type: "error", message: "Room is full" });
        return;
      }

      ws.roomId = roomId;
      ws.userId = msg.userId || null;
      peers.push(ws);

      send(ws, {
        type: "joined",
        roomId,
        polite: peers.length === 2,
        waiting: peers.length === 1
      });

      if (peers.length === 2) {
        send(peers[0], { type: "peer-joined" });
        send(peers[1], { type: "peer-joined" });
      }

      return;
    }

    if (msg.type === "leave") {
      removeFromRoom(ws);
      return;
    }

    if (msg.type === "description" || msg.type === "ice-candidate") {
      const peers = rooms.get(ws.roomId) || [];
      peers.forEach((peer) => {
        if (peer !== ws) {
          send(peer, msg);
        }
      });
      return;
    }

    send(ws, { type: "error", message: "Unknown message type" });
  });

  ws.on("close", () => {
    removeFromRoom(ws);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server listening on :${PORT}`);
});
