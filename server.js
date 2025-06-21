import { WebSocketServer } from "ws";
import http from 'http';

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('WebSocket server running');
});

server.listen(8080, () => {
  console.log('HTTP server listening on port 8080');
});

const wss = new WebSocketServer({ server });

let CLIENTS = [];

wss.on('connection', (ws) => {
  console.log("A client has connected.");
  CLIENTS.push(ws);
  console.log(`Connected clients: ${CLIENTS.length}`);

  ws.on('message', (data) => {
    const messageString = data.toString('utf8');

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageString);
      }
    });
  });

  ws.on('close', () => {
    CLIENTS = CLIENTS.filter(client => client !== ws);
    console.log("A client has disconnected.");
    console.log(`Connected clients: ${CLIENTS.length}`);
  });

  ws.on('error', (err) => {
    console.error("WebSocket error:", err);
  });
});
