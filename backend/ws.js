const WebSocket = require('ws');

function attachWebRtcSignaling(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  const rooms = new Map(); // roomId -> Set<ws>

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

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
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

module.exports = { attachWebRtcSignaling };
