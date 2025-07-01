import { WebSocketServer, WebSocket } from "ws";
import http from 'http';
import sanitizeHtml from 'sanitize-html';

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('WebSocket server running');
});

server.listen(8080, () => {
  console.log('HTTP server listening on port 8080');
});

const wss = new WebSocketServer({ server });

const clientsData = new Map();

const sanitizeOptions = {
  allowedTags: [ 'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span', 'div', 'marquee', 'h1', 'h2', 'h3', 'h4', 'img'],
  allowedAttributes: {
    'a': [ 'href' ],
    'span': [ 'style' ],
    'div': [ 'style' ],
    'img': [ 'src', 'height', 'width' ]
  },
  transformTags: {
    '*': function(tagName, attribs) {
      if (attribs.style) {
        let cleanStyle = attribs.style.split(';').filter(prop => {
          const trimmed = prop.trim().toLowerCase();
          return trimmed.startsWith('color:') || trimmed.startsWith('background-color:') || trimmed.startsWith('font-size:');
        }).join(';');
        if (cleanStyle) {
          attribs.style = cleanStyle;
        } else {
          delete attribs.style;
        }
      }
      return { tagName: tagName, attribs: attribs };
    }
  },
  allowedSchemes: [ 'http', 'https' ],
};

function sendUserListToClient(targetWs) {
  const users = [];
  clientsData.forEach((userData, ws) => {
    users.push({
      username: userData.username,
      color: userData.color
    });
  });

  const userListMessage = JSON.stringify({
    type: 'user_list',
    users: users
  });

  if (targetWs.readyState === WebSocket.OPEN) {
    targetWs.send(userListMessage);
    console.log(`Server: Sent user list to client ${clientsData.get(targetWs)?.username || 'unknown'}.`);
  }
}

function broadcastUserList() {
    const users = [];
    clientsData.forEach((userData, ws) => {
        users.push({
            username: userData.username,
            color: userData.color
        });
    });

    const userListMessage = JSON.stringify({
        type: 'user_list',
        users: users
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && clientsData.has(client)) {
            client.send(userListMessage);
        }
    });
    console.log(`Server: Broadcasted updated user list to all ${clientsData.size} clients.`);
}


wss.on('connection', (ws) => {
  console.log("A new client is attempting to connect.");

  ws.on('message', (data) => {
    const messageString = data.toString('utf8');
    let parsedData;

    try {
      parsedData = JSON.parse(messageString);
    } catch (e) {
      console.error("Server: Error parsing incoming message JSON:", e);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON format' }));
      return;
    }

    if (parsedData.username) {
        parsedData.username = sanitizeHtml(parsedData.username, sanitizeOptions);
    }
    if (parsedData.oldUn) {
        parsedData.oldUn = sanitizeHtml(parsedData.oldUn, sanitizeOptions);
    }
    if (parsedData.message) {
        parsedData.message = sanitizeHtml(parsedData.message, sanitizeOptions);
    }

    if (parsedData.color) {
        const colorRegex = /^#([0-9a-f]{3}){1,2}$|^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$|^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0?\.\d+|\d?\.\d+)\s*\)$/i;
        if (!colorRegex.test(parsedData.color)) {
            console.warn(`Server: Invalid color format received for ${parsedData.username || 'unknown'}: ${parsedData.color}. Resetting to default.`);
            parsedData.color = '#000000';
        }
    }


    if (parsedData.type === 'join') {
      const { username, color } = parsedData;
      if (!username || !color) {
        console.warn("Server: Received a join message without username or color:", parsedData);
        ws.send(JSON.stringify({ type: 'error', message: 'Join message requires username and color' }));
        ws.close(1003, 'Invalid join message');
        return;
      }

      clientsData.set(ws, { username, color });
      console.log(`Server: Client ${username} (${color}) has joined. Total connected: ${clientsData.size}`);

      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(parsedData));
        }
      });
      sendUserListToClient(ws);
      broadcastUserList();

    } else if (parsedData.type === 'request_users') {
        sendUserListToClient(ws);

    } else {
      const userData = clientsData.get(ws);
      if (!userData) {
        console.warn("Server: Received message from unregistered client, ignoring:", parsedData);
        ws.send(JSON.stringify({ type: 'error', message: 'You must send a "join" message first.' }));
        return;
      }

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(parsedData));
        }
      });
      if (parsedData.type === 'change') {
          clientsData.set(ws, { username: parsedData.username, color: parsedData.color });
          broadcastUserList();
      }
    }
  });

  ws.on('close', () => {
    const disconnectedUserData = clientsData.get(ws);
    clientsData.delete(ws);

    if (disconnectedUserData) {
      const { username, color } = disconnectedUserData;
      console.log(`Server: Client ${username} (${color}) has disconnected. Remaining connected: ${clientsData.size}`);

      const leaveMessage = JSON.stringify({
        type: 'leave',
        username: username,
        color: color,
        timestamp: new Date().toISOString()
      });

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(leaveMessage);
        }
      });
      broadcastUserList();

    } else {
      console.log("Server: An unknown client disconnected. Remaining connected:", clientsData.size);
    }
  });

  ws.on('error', (err) => {
    const errorUserData = clientsData.get(ws);
    console.error(`Server: WebSocket error for client ${errorUserData ? errorUserData.username : 'unknown'}:`, err);
  });
});
