import React, { useEffect, useRef, useState } from "react";

const SIGNALING_URL = "ws://217.154.113.141:3001/ws";

function safeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function App() {
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const [roomId, setRoomId] = useState("demo-room");
  const [status, setStatus] = useState("Idle");
  const [joined, setJoined] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    return () => {
      cleanupAll();
    };
  }, []);

  function addLog(text) {
    setLogs((prev) => [
      { id: safeId(), text, time: new Date().toLocaleTimeString() },
      ...prev,
    ].slice(0, 20));
  }

  async function ensureLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    localStreamRef.current = stream;
    return stream;
  }

  function sendSignal(data) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }

  async function ensurePeerConnection() {
    if (pcRef.current) return pcRef.current;

    const stream = await ensureLocalStream();

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: "ice-candidate", candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => {});
      }
      setStatus("Connected");
      addLog("Remote audio connected");
    };

    pc.onconnectionstatechange = () => {
      setStatus(`Peer: ${pc.connectionState}`);
      addLog(`Peer state: ${pc.connectionState}`);
    };

    pcRef.current = pc;
    return pc;
  }

  async function joinRoom() {
    try {
      setStatus("Requesting microphone...");
      await ensureLocalStream();

      setStatus("Connecting server...");
      const ws = new WebSocket(SIGNALING_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setJoined(true);
        setStatus("Joined room");
        addLog("Connected to signaling server");
        sendSignal({
          type: "join",
          roomId: roomId.trim(),
          userId: safeId(),
        });
      };

      ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);

        if (msg.type === "joined") {
          addLog(`Joined room ${msg.roomId}`);
          await ensurePeerConnection();

          if (!msg.waiting) {
            const pc = await ensurePeerConnection();
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal({ type: "description", description: pc.localDescription });
            addLog("Offer sent");
          }
          return;
        }

        if (msg.type === "peer-joined") {
          addLog("Peer joined");
          return;
        }

        if (msg.type === "description") {
          const pc = await ensurePeerConnection();

          await pc.setRemoteDescription(msg.description);

          if (msg.description.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal({ type: "description", description: pc.localDescription });
            addLog("Answer sent");
          }
          return;
        }

        if (msg.type === "ice-candidate") {
          if (pcRef.current && msg.candidate) {
            await pcRef.current.addIceCandidate(msg.candidate);
            addLog("ICE candidate added");
          }
          return;
        }

        if (msg.type === "peer-left") {
          setStatus("Peer left");
          addLog("Peer left");
        }

        if (msg.type === "error") {
          setStatus(`Error: ${msg.message}`);
          addLog(`Error: ${msg.message}`);
        }
      };

      ws.onclose = () => {
        setJoined(false);
        setStatus("Server disconnected");
        addLog("WebSocket closed");
      };

      ws.onerror = () => {
        setStatus("WebSocket error");
        addLog("WebSocket error");
      };
    } catch (err) {
      console.error(err);
      setStatus(`Failed: ${err.message}`);
      addLog(`Failed: ${err.message}`);
    }
  }

  function hangUp() {
    sendSignal({ type: "leave" });
    cleanupAll();
    setJoined(false);
    setStatus("Left room");
    addLog("Left room");
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    addLog(track.enabled ? "Microphone on" : "Microphone muted");
  }

  function cleanupAll() {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (_) {}
      wsRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
  }

  return (
    <div className="app">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div className="card">
        <h1>Telegram Live Call</h1>

        <label>Room ID</label>
        <input
          className="input"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
        />

        <div className="status">{status}</div>

        <div className="row">
          <button onClick={joinRoom} disabled={joined}>Join</button>
          <button onClick={hangUp}>Hang Up</button>
          <button onClick={toggleMute}>Mute / Unmute</button>
        </div>
      </div>

      <div className="card">
        <h2>Logs</h2>
        {logs.map((item) => (
          <div key={item.id} className="log">
            <div>{item.text}</div>
            <small>{item.time}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
