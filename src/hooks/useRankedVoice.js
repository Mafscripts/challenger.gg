import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

const CONNECTED_STATUSES = new Set([
  "open",
  "ready_check",
  "ready",
  "in_progress",
  "pending_confirmation",
  "awaiting_confirmation",
  "awaiting_team_alpha_report",
  "awaiting_team_bravo_report",
  "score_conflict",
  "disputed",
  "completed",
]);

const websocketUrl = (path, token) => {
  const configured = String(import.meta.env.VITE_API_URL || "/api");
  let base;
  if (/^https?:\/\//i.test(configured)) {
    base = new URL(configured);
  } else if (["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port !== "4000") {
    base = new URL("http://localhost:4000");
  } else {
    base = new URL(window.location.origin);
  }
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = path;
  base.search = new URLSearchParams({ token }).toString();
  return base.toString();
};

const rtcConfig = () => {
  try {
    const configured = JSON.parse(import.meta.env.VITE_VOICE_ICE_SERVERS || "null");
    if (Array.isArray(configured) && configured.length > 0) return { iceServers: configured };
  } catch {
    // Invalid optional configuration falls back to public STUN discovery.
  }
  return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
};

export default function useRankedVoice({ matchId, matchStatus, userId, enabled }) {
  const [connectionState, setConnectionState] = useState("idle");
  const [stage, setStage] = useState("waiting");
  const [channel, setChannel] = useState("Waiting for all players");
  const [participants, setParticipants] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [error, setError] = useState("");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const socketRef = useRef(null);
  const streamRef = useRef(null);
  const peersRef = useRef(new Map());
  const remoteAudioRef = useRef(new Map());
  const pendingIceRef = useRef(new Map());
  const reconnectRef = useRef(null);
  const analyserRef = useRef(null);
  const analyserFrameRef = useRef(null);
  const speakingRef = useRef(false);
  const mutedRef = useRef(false);
  const deafenedRef = useRef(false);
  const selectedDeviceRef = useRef("");
  const mountedRef = useRef(true);
  const desiredConnectionRef = useRef(false);

  const send = useCallback((payload) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const sendPresence = useCallback((speaking = speakingRef.current) => {
    send({ type: "presence", muted: mutedRef.current, deafened: deafenedRef.current, speaking });
  }, [send]);

  const stopSpeakingMeter = useCallback(() => {
    if (analyserFrameRef.current) cancelAnimationFrame(analyserFrameRef.current);
    analyserFrameRef.current = null;
    if (analyserRef.current?.context) analyserRef.current.context.close().catch(() => null);
    analyserRef.current = null;
    speakingRef.current = false;
  }, []);

  const startSpeakingMeter = useCallback((stream) => {
    stopSpeakingMeter();
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.72;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    analyserRef.current = { context, analyser };
    let quietFrames = 0;
    const measure = () => {
      analyser.getByteTimeDomainData(samples);
      let total = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        total += normalized * normalized;
      }
      const active = !mutedRef.current && Math.sqrt(total / samples.length) > 0.035;
      quietFrames = active ? 0 : quietFrames + 1;
      const nextSpeaking = active || (speakingRef.current && quietFrames < 8);
      if (nextSpeaking !== speakingRef.current) {
        speakingRef.current = nextSpeaking;
        sendPresence(nextSpeaking);
      }
      analyserFrameRef.current = requestAnimationFrame(measure);
    };
    measure();
  }, [sendPresence, stopSpeakingMeter]);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audioinput");
    if (!mountedRef.current) return;
    setDevices(inputs);
    if (!selectedDeviceRef.current && inputs[0]) {
      selectedDeviceRef.current = inputs[0].deviceId;
      setSelectedDeviceId(inputs[0].deviceId);
    }
  }, []);

  const ensureLocalStream = useCallback(async (deviceId = selectedDeviceRef.current) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Voice chat is not supported by this browser.");
    const currentTrack = streamRef.current?.getAudioTracks?.()[0];
    if (currentTrack && (!deviceId || currentTrack.getSettings().deviceId === deviceId)) return streamRef.current;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
      video: false,
    });
    const newTrack = stream.getAudioTracks()[0];
    newTrack.enabled = !mutedRef.current;
    const oldStream = streamRef.current;
    streamRef.current = stream;
    startSpeakingMeter(stream);
    await Promise.all([...peersRef.current.values()].map(async (peer) => {
      const sender = peer.getSenders().find((entry) => entry.track?.kind === "audio");
      if (sender) await sender.replaceTrack(newTrack);
      else peer.addTrack(newTrack, stream);
    }));
    oldStream?.getTracks().forEach((track) => track.stop());
    await refreshDevices();
    return stream;
  }, [refreshDevices, startSpeakingMeter]);

  const stopPeer = useCallback((peerId) => {
    const peer = peersRef.current.get(peerId);
    if (peer) peer.close();
    peersRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    const audio = remoteAudioRef.current.get(peerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    remoteAudioRef.current.delete(peerId);
  }, []);

  const stopAllPeers = useCallback(() => {
    [...peersRef.current.keys()].forEach(stopPeer);
  }, [stopPeer]);

  const createPeer = useCallback(async (peerId, initiate = false) => {
    if (peersRef.current.has(peerId)) return peersRef.current.get(peerId);
    const stream = await ensureLocalStream();
    const peer = new RTCPeerConnection(rtcConfig());
    peersRef.current.set(peerId, peer);
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = (event) => {
      if (event.candidate) send({ type: "ice-candidate", target: peerId, candidate: event.candidate });
    };
    peer.ontrack = (event) => {
      let audio = remoteAudioRef.current.get(peerId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        remoteAudioRef.current.set(peerId, audio);
      }
      audio.srcObject = event.streams[0];
      audio.muted = deafenedRef.current;
      audio.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(peer.connectionState)) stopPeer(peerId);
    };
    if (initiate) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      send({ type: "offer", target: peerId, description: peer.localDescription });
    }
    return peer;
  }, [ensureLocalStream, send, stopPeer]);

  const flushIce = useCallback(async (peerId, peer) => {
    const queued = pendingIceRef.current.get(peerId) || [];
    pendingIceRef.current.delete(peerId);
    for (const candidate of queued) await peer.addIceCandidate(candidate).catch(() => null);
  }, []);

  const handleSocketMessage = useCallback(async (message) => {
    if (message.type === "channel-changed") {
      stopAllPeers();
      setStage(message.stage);
      setChannel(message.channel);
      if (["global", "team"].includes(message.stage)) ensureLocalStream().catch((mediaError) => setError(mediaError.message));
      return;
    }
    if (message.type === "voice-state") {
      setStage(message.stage);
      setChannel(message.channel);
      setParticipants(message.participants || []);
      const allowedPeers = new Set((message.participants || []).map((participant) => participant.user_id).filter((id) => id !== userId));
      [...peersRef.current.keys()].forEach((peerId) => {
        if (!allowedPeers.has(peerId)) stopPeer(peerId);
      });
      if (["global", "team"].includes(message.stage)) {
        await ensureLocalStream();
        for (const peerId of allowedPeers) {
          if (!peersRef.current.has(peerId)) await createPeer(peerId, String(userId).localeCompare(String(peerId)) < 0);
        }
      }
      return;
    }
    if (message.type === "offer") {
      const peer = await createPeer(message.from, false);
      await peer.setRemoteDescription(message.description);
      await flushIce(message.from, peer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      send({ type: "answer", target: message.from, description: peer.localDescription });
      return;
    }
    if (message.type === "answer") {
      const peer = peersRef.current.get(message.from);
      if (!peer) return;
      await peer.setRemoteDescription(message.description);
      await flushIce(message.from, peer);
      return;
    }
    if (message.type === "ice-candidate" && message.candidate) {
      const peer = peersRef.current.get(message.from);
      if (peer?.remoteDescription) await peer.addIceCandidate(message.candidate).catch(() => null);
      else pendingIceRef.current.set(message.from, [...(pendingIceRef.current.get(message.from) || []), message.candidate]);
      return;
    }
    if (message.type === "signal-rejected") stopPeer(message.target);
    if (message.type === "voice-error") setError(message.message || "Voice access ended.");
  }, [createPeer, ensureLocalStream, flushIce, send, stopAllPeers, stopPeer, userId]);

  const disconnect = useCallback(() => {
    desiredConnectionRef.current = false;
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    reconnectRef.current = null;
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, "Leaving ranked voice");
    stopAllPeers();
    stopSpeakingMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setParticipants([]);
    setConnectionState("idle");
  }, [stopAllPeers, stopSpeakingMeter]);

  const connect = useCallback(async () => {
    if (!enabled || !matchId || !userId || !CONNECTED_STATUSES.has(matchStatus)) return;
    desiredConnectionRef.current = true;
    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) return;
    setConnectionState("connecting");
    setError("");
    try {
      const response = await base44.functions.invoke("createRankedVoiceSession", { ranked_match_id: matchId });
      if (!desiredConnectionRef.current || !mountedRef.current) return;
      const socket = new WebSocket(websocketUrl(response.data.path, response.data.token));
      socketRef.current = socket;
      setStage(response.data.stage || "waiting");
      setChannel(response.data.channel || "Ranked Voice");
      socket.onopen = () => {
        setConnectionState("connected");
        sendPresence(false);
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleSocketMessage(message).catch((voiceError) => setError(voiceError.message || "Voice connection failed."));
        } catch {
          setError("Voice received an invalid server message.");
        }
      };
      socket.onerror = () => setError("Could not connect to ranked voice.");
      socket.onclose = (event) => {
        if (socketRef.current !== socket) return;
        socketRef.current = null;
        stopAllPeers();
        setConnectionState("disconnected");
        if (desiredConnectionRef.current && event.code !== 1008) {
          reconnectRef.current = setTimeout(connect, 2000);
        }
      };
    } catch (voiceError) {
      setConnectionState("disconnected");
      setError(voiceError.message || "Ranked voice is unavailable.");
      if (desiredConnectionRef.current) reconnectRef.current = setTimeout(connect, 3000);
    }
  }, [enabled, handleSocketMessage, matchId, matchStatus, sendPresence, stopAllPeers, userId]);

  useEffect(() => {
    mountedRef.current = true;
    const shouldConnect = enabled && CONNECTED_STATUSES.has(matchStatus);
    if (shouldConnect) connect();
    else disconnect();
    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect, enabled, matchStatus]);

  useEffect(() => {
    const onDeviceChange = () => refreshDevices().catch(() => null);
    if (enabled) refreshDevices().catch(() => null);
    navigator.mediaDevices?.addEventListener?.("devicechange", onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onDeviceChange);
  }, [enabled, refreshDevices]);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    if (next) speakingRef.current = false;
    sendPresence(next ? false : speakingRef.current);
  }, [sendPresence]);

  const toggleDeafen = useCallback(() => {
    const next = !deafenedRef.current;
    deafenedRef.current = next;
    setDeafened(next);
    remoteAudioRef.current.forEach((audio) => { audio.muted = next; });
    sendPresence();
  }, [sendPresence]);

  const selectDevice = useCallback(async (deviceId) => {
    selectedDeviceRef.current = deviceId;
    setSelectedDeviceId(deviceId);
    setError("");
    try {
      await ensureLocalStream(deviceId);
    } catch (mediaError) {
      setError(mediaError.message || "Could not use that microphone.");
    }
  }, [ensureLocalStream]);

  const prepareMicrophone = useCallback(async () => {
    setError("");
    try {
      await ensureLocalStream(selectedDeviceRef.current);
    } catch (mediaError) {
      setError(mediaError.message || "Could not access your microphones.");
    }
  }, [ensureLocalStream]);

  const resumeAudio = useCallback(() => {
    Promise.all([...remoteAudioRef.current.values()].map((audio) => audio.play().catch(() => null)))
      .then(() => setAutoplayBlocked(false));
  }, []);

  return {
    connectionState,
    stage,
    channel,
    participants,
    devices,
    selectedDeviceId,
    muted,
    deafened,
    error,
    autoplayBlocked,
    toggleMute,
    toggleDeafen,
    selectDevice,
    prepareMicrophone,
    resumeAudio,
  };
}
