const WebSocket = require('ws');

let wssInstance = null;
const userConnections = new Map(); 

function attachWebRtcSignaling(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });
  wssInstance = wss;

  const rooms = new Map(); 

  function getRoom(roomId) {
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    return rooms.get(roomId);
  }

  function broadcastToOthers(roomId, sender, msg) {
    const room = rooms.get(roomId);
    if (!room) return;
    for (const client of room) {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    }
  }

  wss.on('connection', (ws) => {
    ws.roomId = null;
    ws.userId = null;

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }

      if (msg.type === 'register') {
        const userId = String(msg.userId || '').trim();
        if (!userId) return;

        ws.userId = userId;
        if (!userConnections.has(userId)) userConnections.set(userId, new Set());
        userConnections.get(userId).add(ws);
        ws.send(JSON.stringify({ type: 'registered', userId }));
        return;
      }

      if (msg.type === 'join') {
        const roomId = String(msg.roomId || '').trim();
        if (!roomId) return;

        ws.roomId = roomId;
        const room = getRoom(roomId);
        room.add(ws);

        const role = room.size === 1 ? 'caller' : 'callee';
        ws.send(JSON.stringify({ type: 'role', role }));

        broadcastToOthers(roomId, ws, { type: 'peer-joined' });
        return;
      }

      if (!ws.roomId) return;

      if (msg.type === 'offer' || msg.type === 'answer' || msg.type === 'ice') {
        broadcastToOthers(ws.roomId, ws, msg);
      }
    });

    ws.on('close', () => {
      if (ws.userId) {
        const conns = userConnections.get(ws.userId);
        if (conns) {
          conns.delete(ws);
          if (conns.size === 0) userConnections.delete(ws.userId);
        }
      }

      const roomId = ws.roomId;
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      room.delete(ws);
      if (room.size === 0) rooms.delete(roomId);
      else {
        for (const client of room) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'peer-left' }));
          }
        }
      }
    });
  });

  return wss;
}

function notifyUser(userId, message) {
  const conns = userConnections.get(String(userId));
  if (!conns) return;
  for (const ws of conns) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }
}

module.exports = { attachWebRtcSignaling, notifyUser };
