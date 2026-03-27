export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" }

  // Add TURN later for reliability:
  // {
  //   urls: "turn:your-domain.com:3478",
  //   username: "turnuser",
  //   credential: "turnpass"
  // }
];

export async function getLocalAudioStream() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: false
  });
}

export function createPeerConnection({
  localStream,
  onIceCandidate,
  onTrack,
  onConnectionStateChange
}) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onIceCandidate(event.candidate);
    }
  };

  pc.ontrack = (event) => {
    const [remoteStream] = event.streams;
    onTrack(remoteStream);
  };

  pc.onconnectionstatechange = () => {
    onConnectionStateChange(pc.connectionState);
  };

  return pc;
}
