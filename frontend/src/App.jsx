import React, { useEffect, useRef, useState } from "react";
import { getTelegramWebApp, initTelegramUI } from "./telegram";
import { getLocalAudioStream, createPeerConnection } from "./webrtc";

const SIGNALING_URL = "wss://your-domain.com/ws";

export default function App() {
  const tgRef = useRef(null);
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const politeRef = useRef(false);

  const [roomId, setRoomId] = useState("demo-room");
  const [status, setStatus] = useState("Idle");
  const [joined, setJoined] = useState(false);
  const [serverConnected, setServerConnected] = useState(false);
  const [inCall, setInCall] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    tgRef.current = initTelegramUI();
    return () => {
      cleanupAll();
    };
  }, []);

  function log(text) {
    setLogs((prev) => [
      { id: crypto.randomUUID(), text, time: new Date().toLocaleTimeString() },
      ...prev
    ].slice(0, 15));
  }

  async function ensureLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await getLocalAudioStream();
    localStreamRef.current = stream;
    return stream;
  }

  function sendSignal(payload) {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }

  async function ensurePeerConnection() {
    if (pcRef.current) return pcRef.current;

    const localStream = await ensureLocalStream();

    const pc = createPeerConnection({
      localStream,
      onIceCandidate: (candidate) => {
        sendSignal({ type: "ice-candidate", candidate });
      },
      onTrack: (remoteStream) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          remoteAudioRef.current.play().catch(() => {});
        }
        setInCall(true);
        setStatus("Connected");
        log("Remote audio connected");
      },
      onConnectionStateChange: (state) => {
        if (state === "connected") {
          setInCall(true);
          setStatus("Connected");
          log("Peer connected");
        } else if (state === "connecting") {
          setStatus("Connecting peer...");
        } else if (state === "disconnected") {
          setInCall(false);
          setStatus("Disconnected");
        } else if (state === "failed") {
          setInCall(false);
          setStatus("Call failed");
        } else if (state === "closed") {
          setInCall(false);
          setStatus("Call ended");
        }
      }
    });

    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        sendSignal({ type: "description", description: pc.localDescription });
        log("Offer sent");
      } catch (err) {
        console.error(err);
        log("Negotiation failed");
      } finally {
        makingOfferRef.current = false;
      }
    };

    pcRef.current = pc;
    return pc;
  }

  async function joinRoom() {
    if (!roomId.trim()) return;

    try {
      setStatus("Requesting microphone...");
      await ensureLocalStream();
    } catch (err) {
      console.error(err);
      setStatus("Microphone permission denied");
      return;
    }

    setStatus("Connecting server...");
    const ws = new WebSocket(SIGNALING_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setServerConnected(true);
      setJoined(true);
      setStatus("Joined room");

      const tg = getTelegramWebApp();
      const user = tg?.initDataUnsafe?.user;

      sendSignal({
        type: "join",
        roomId: roomId.trim(),
        userId: user?.id ?? `web-${Math.random().toString(36).slice(2)}`
      });

      log("Connected to signaling server");
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "joined") {
        politeRef.current = Boolean(msg.polite);
        setStatus(msg.waiting ? "Waiting for other side" : "Ready");
        await ensurePeerConnection();
        log(`Joined ${msg.roomId}`);
        return;
      }

      if (msg.type === "peer-joined") {
        setStatus("Peer joined");
        await ensurePeerConnection();
        log("Peer joined room");
        return;
      }

      if (msg.type === "description") {
        const pc = await ensurePeerConnection();
        const description = msg.description;

        const readyForOffer =
          !makingOfferRef.current &&
          (pc.signalingState === "stable" ||
            pc.signalingState === "have-local-offer");

        const offerCollision =
          description.type === "offer" && !readyForOffer;

        ignoreOfferRef.current = !politeRef.current && offerCollision;

        if (ignoreOfferRef.current) {
          log("Ignored conflicting offer");
          return;
        }

        await pc.setRemoteDescription(description);

        if (description.type === "offer") {
          await pc.setLocalDescription();
          sendSignal({ type: "description", description: pc.localDescription });
          log("Answer sent");
        }
        return;
      }

      if (msg.type === "ice-candidate") {
        try {
          if (msg.candidate && pcRef.current) {
            await pcRef.current.addIceCandidate(msg.candidate);
          }
        } catch (err) {
          if (!ignoreOfferRef.current) {
            console.error(err);
            log("ICE candidate failed");
          }
        }
        return;
      }

      if (msg.type === "peer-left") {
        cleanupPeerOnly();
        setStatus("Peer left");
        log("Peer left");
      }
    };

    ws.onclose = () => {
      setServerConnected(false);
      setJoined(false);
      cleanupPeerOnly();
      setStatus("Server disconnected");
      log("Server disconnected");
    };

    ws.onerror = () => {
      setStatus("Server error");
      log("WebSocket error");
    };
  }

  function leaveRoom() {
    sendSignal({ type: "leave" });
    cleanupAll();
    setStatus("Left room");
  }

  function cleanupPeerOnly() {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onnegotiationneeded = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    setInCall(false);
  }

  function cleanupAll() {
    cleanupPeerOnly();

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

    setJoined(false);
    setServerConnected(false);
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;

    const track = stream.getAudioTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setMicEnabled(track.enabled);
    log(track.enabled ? "Microphone on" : "Microphone muted");
  }

  return (
    <div className="app">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="card">
        <h1>Live Voice Call</h1>

        <label className="label">Room</label>
        <input
          className="input"
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          disabled={joined}
          placeholder="room id"
        />

        <div className="statusBox">
          <div className="statusTitle">Status</div>
          <div className="statusValue">{status}</div>
          <div className="statusSub">
            {inCall ? "Audio is live" : "Waiting for connection"}
          </div>
        </div>

        <div className="row">
          <button className="btn primary" onClick={joinRoom} disabled={joined}>
            Join
          </button>
          <button className="btn" onClick={leaveRoom} disabled={!joined}>
            Hang up
          </button>
        </div>

        <button className="btn large" onClick={toggleMute} disabled={!joined}>
          {micEnabled ? "Mute microphone" : "Unmute microphone"}
        </button>

        <div className="flags">
          <span>{serverConnected ? "Server: online" : "Server: offline"}</span>
          <span>{joined ? "Room: joined" : "Room: not joined"}</span>
        </div>
      </div>

      <div className="card">
        <h2>Session log</h2>
        <div className="logList">
          {logs.length === 0 && <div className="logItem">No activity yet.</div>}
          {logs.map((item) => (
            <div className="logItem" key={item.id}>
              <div>{item.text}</div>
              <div className="logTime">{item.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
