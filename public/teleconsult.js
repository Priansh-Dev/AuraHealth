const qs = new URLSearchParams(location.search);
const roomId = qs.get('room');
const apptId = qs.get('appt');

const LS_TOKEN = 'aura_token';
const LS_USER = 'aura_user';

const roomLabel = document.getElementById('roomLabel');
const joinBtn = document.getElementById('joinBtn');
const toggleMicBtn = document.getElementById('toggleMicBtn');
const hangupBtn = document.getElementById('hangupBtn');
const callMsg = document.getElementById('callMsg');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

roomLabel.textContent = roomId ? `Room: ${roomId}` : apptId ? `Appointment: ${apptId}` : 'Missing room id.';

let ws;
let pc;
let localStream;
let micEnabled = true;
let role = null;

function getToken() {
  return localStorage.getItem(LS_TOKEN);
}

function getUser() {
  try {
    const raw = localStorage.getItem(LS_USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body;
}

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function loadAppt() {
  const id = Number(apptId);
  if (!Number.isFinite(id)) throw new Error('Invalid appointment id.');
  const body = await fetchJSON(`/api/appointments/${id}`, { headers: { ...authHeaders() } });
  return body.data;
}

const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

function setMsg(m) {
  callMsg.textContent = m;
}

let pollTimer = null;

async function startCompletionPolling() {
  if (!apptId) return;
  if (pollTimer) return;

  pollTimer = setInterval(async () => {
    try {
      const a = await loadAppt();
      if (a.status === 'COMPLETED' || a.status === 'CANCELLED') {
        clearInterval(pollTimer);
        pollTimer = null;
        hangup();
        setMsg('Consultation completed by doctor.');
      }
    } catch {
      // ignore
    }
  }, 2000);
}

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

async function startMedia() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
}

function createPeer() {
  pc = new RTCPeerConnection(rtcConfig);

  pc.ontrack = (ev) => {
    const [stream] = ev.streams;
    remoteVideo.srcObject = stream;
  };

  pc.onicecandidate = (ev) => {
    if (ev.candidate) {
      ws.send(JSON.stringify({ type: 'ice', candidate: ev.candidate }));
    }
  };

  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }
}

async function makeOffer() {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription }));
}

async function handleOffer(sdp) {
  await pc.setRemoteDescription(sdp);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }));
}

async function handleAnswer(sdp) {
  await pc.setRemoteDescription(sdp);
}

async function join() {
  const t = getToken();
  const u = getUser();
  if (!t || !u) {
    setMsg('Please login to join the consult.');
    setTimeout(() => (location.href = '/'), 700);
    return;
  }

  let effectiveRoomId = roomId;

  if (!effectiveRoomId && apptId) {
    joinBtn.disabled = true;
    setMsg('Waiting for doctor acceptance...');

    while (true) {
      const a = await loadAppt().catch((e) => {
        throw e;
      });

      if (a.status === 'COMPLETED' || a.status === 'CANCELLED') {
        setMsg('Consultation ended.');
        return;
      }

      if (a.room_id) {
        effectiveRoomId = a.room_id;
        break;
      }

      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (!effectiveRoomId) {
    setMsg('Missing room id in URL.');
    return;
  }

  joinBtn.disabled = true;
  setMsg('Requesting camera/mic...');

  try {
    await startMedia();
  } catch {
    setMsg('Camera/microphone permission denied.');
    joinBtn.disabled = false;
    return;
  }

  setMsg('Connecting...');

  ws = new WebSocket(wsUrl());

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', roomId: effectiveRoomId }));
  };

  ws.onmessage = async (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    if (msg.type === 'role') {
      role = msg.role;
      createPeer();
      setMsg(role === 'caller' ? 'Connected. Waiting for peer...' : 'Connected. Waiting for offer...');
      return;
    }

    if (!pc) return;

    if (msg.type === 'peer-joined' && role === 'caller') {
      setMsg('Peer joined. Starting call...');
      await makeOffer();
      return;
    }

    if (msg.type === 'offer') {
      setMsg('Receiving offer...');
      await handleOffer(msg.sdp);
      setMsg('In call');
      return;
    }

    if (msg.type === 'answer') {
      await handleAnswer(msg.sdp);
      setMsg('In call');
      return;
    }

    if (msg.type === 'ice' && msg.candidate) {
      try {
        await pc.addIceCandidate(msg.candidate);
      } catch {
        // ignore
      }
      return;
    }

    if (msg.type === 'peer-left') {
      setMsg('Peer left the call.');
      return;
    }
  };

  ws.onerror = () => {
    setMsg('WebSocket error.');
    joinBtn.disabled = false;
  };

  ws.onclose = () => {
    // noop
  };
}

function toggleMic() {
  if (!localStream) return;
  micEnabled = !micEnabled;
  for (const track of localStream.getAudioTracks()) {
    track.enabled = micEnabled;
  }
  toggleMicBtn.textContent = micEnabled ? 'Mute Mic' : 'Unmute Mic';
}

function hangup() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  } catch {
    // ignore
  }

  try {
    if (pc) pc.close();
  } catch {
    // ignore
  }

  pc = null;
  ws = null;

  if (localStream) {
    for (const t of localStream.getTracks()) t.stop();
    localStream = null;
  }

  localVideo.srcObject = null;
  remoteVideo.srcObject = null;

  joinBtn.disabled = false;
  setMsg('Call ended.');
}

joinBtn.addEventListener('click', join);

startCompletionPolling();

toggleMicBtn.addEventListener('click', toggleMic);

hangupBtn.addEventListener('click', hangup);

setMsg('Click “Join Call” when both patient and doctor are ready.');
