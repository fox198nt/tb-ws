import { WebSocketServer, WebSocket } from "ws";
import http from 'http';

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('WebSocket server running');
});

server.listen(8080, () => {
  console.log('HTTP server listening on port 8080');
});

const wss = new WebSocketServer({ server });

// Use a Map to store WebSocket instances along with their user data (username, color)
// Map<WebSocket, { username: string, color: string }>
const clientsData = new Map();

wss.on('connection', (ws) => {
  console.log("A new client is attempting to connect.");

  ws.on('message', (data) => {
    const messageString = data.toString('utf8');
    let parsedData;

    try {
      parsedData = JSON.parse(messageString);
    } catch (e) {
      console.error("Error parsing incoming message JSON:", e);
      // Optionally, send an error back to the client
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON format' }));
      return;
    }

    // Handle 'join' message specifically
    if (parsedData.type === 'join') {
      const { username, color } = parsedData;
      if (!username || !color) {
        console.warn("Received a join message without username or color:", parsedData);
        ws.send(JSON.stringify({ type: 'error', message: 'Join message requires username and color' }));
        ws.close(1003, 'Invalid join message'); // Close with protocol error code
        return;
      }

      // Store the user's data with their WebSocket connection
      clientsData.set(ws, { username, color });
      console.log(`Client ${username} (${color}) has joined. Total connected: ${clientsData.size}`);

      // Broadcast the exact 'join' message to all other connected clients
      // This ensures all clients have consistent data for the joined user
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(messageString); // Send the original join message string
        }
      });
    } else {
      // For other message types (chat, change), ensure the client is registered
      const userData = clientsData.get(ws);
      if (!userData) {
        console.warn("Received message from unregistered client, ignoring:", parsedData);
        ws.send(JSON.stringify({ type: 'error', message: 'You must send a "join" message first.' }));
        return;
      }

      // If the message is a 'message' or 'change' type, broadcast it
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          // You might want to re-construct the message here to ensure consistency
          // or just forward it if the client always sends complete messages
          client.send(messageString);
        }
      });
    }
  });

  ws.on('close', () => {
    const disconnectedUserData = clientsData.get(ws);
    clientsData.delete(ws); // Remove client data from the map

    if (disconnectedUserData) {
      const { username, color } = disconnectedUserData;
      console.log(`Client ${username} (${color}) has disconnected. Remaining connected: ${clientsData.size}`);

      // Construct and broadcast the 'leave' message to remaining clients
      const leaveMessage = JSON.stringify({
        type: 'leave',
        username: username,
        color: color,
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', hour12: true }) // Using server time
      });

      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(leaveMessage);
        }
      });
    } else {
      // This case handles clients that disconnected before sending a 'join' message
      console.log("An unknown client disconnected. Remaining connected:", clientsData.size);
    }
  });

  ws.on('error', (err) => {
    const errorUserData = clientsData.get(ws);
    console.error(`WebSocket error for client ${errorUserData ? errorUserData.username : 'unknown'}:`, err);
  });
});
