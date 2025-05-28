// backend/chat-server.js
// Простий WebSocket сервер для чату (Node.js)
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3001 });

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    // Розсилаємо повідомлення всім клієнтам
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });
  });
});

console.log('WebSocket чат-сервер запущено на ws://localhost:3001');
