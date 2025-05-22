const http = require('http');
const express = require('express');
const app = express();
const bodyParser = require('body-parser');

// --- Додаємо WebSocket для чату ---
const WebSocket = require('ws');
let wsServer;

function setupWebSocket(server) {
  wsServer = new WebSocket.Server({ server });
  wsServer.on('connection', function connection(ws) {
    ws.on('message', function incoming(message) {
      wsServer.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message.toString());
        }
      });
    });
  });
}

// --- Додаємо роздачу frontend ---
app.use(express.static(__dirname + '/../frontend'));

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
const httpServer = require('http').createServer(app);
setupWebSocket(httpServer);
httpServer.listen(PORT, () => {
  console.log('HTTP/WebSocket сервер запущено на http://localhost:' + PORT);
});

// Ініціалізація SQLite
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const port = 3000;
const JWT_SECRET = 'your_jwt_secret_key';

app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    db.run(`
      CREATE TABLE IF NOT EXISTS USERS (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        USERNAME TEXT UNIQUE NOT NULL,
        PASSWORD_HASH TEXT NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS OBJECTS (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        NAME TEXT NOT NULL,
        DESCRIPTION TEXT,
        URL TEXT NOT NULL
      )
    `);
  }
});

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  db.run(
    `INSERT INTO USERS (USERNAME, PASSWORD_HASH) VALUES (?, ?)`,
    [username, hashedPassword],
    function (err) {
      if (err) {
        console.error(err.message);
        res.status(500).send('Registration failed');
      } else {
        res.status(201).send('User registered');
      }
    }
  );
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  db.get(
    `SELECT * FROM USERS WHERE USERNAME = ?`,
    [username],
    async (err, user) => {
      if (err) {
        console.error(err.message);
        res.status(500).send('Login failed');
      } else if (user && (await bcrypt.compare(password, user.PASSWORD_HASH))) {
        const token = jwt.sign({ username: user.USERNAME }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ token });
      } else {
        res.status(401).send('Invalid credentials');
      }
    }
  );
});

app.post('/objects', authenticateToken, (req, res) => {
  const { name, description, url } = req.body;

  db.run(
    `INSERT INTO OBJECTS (NAME, DESCRIPTION, URL) VALUES (?, ?, ?)`,
    [name, description, url],
    function (err) {
      if (err) {
        console.error(err.message);
        res.status(500).send('Failed to save object');
      } else {
        res.status(201).send('Object metadata saved');
      }
    }
  );
});

app.get('/objects', (req, res) => {
  db.all(`SELECT * FROM OBJECTS`, [], (err, rows) => {
    if (err) {
      console.error(err.message);
      res.status(500).send('Failed to fetch objects');
    } else {
      res.json(rows);
    }
  });
});

// --- МУЛЬТИПЛЕЄР: синхронізація гравців через WebSocket ---
const players = {};

wsServer.on('connection', function connection(ws) {
  let thisId = null;
  ws.on('message', function incoming(message) {
    let data;
    try { data = JSON.parse(message); } catch { data = null; }
    if (data && data.type === 'player') {
      thisId = data.id;
      players[thisId] = data.pos;
      // Розсилаємо всім актуальні позиції
      const payload = JSON.stringify({ type: 'players', players });
      wsServer.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    } else if (typeof message === 'string') {
      // старий чат
      wsServer.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message.toString());
        }
      });
    }
  });
  ws.on('close', function() {
    if (thisId && players[thisId]) {
      delete players[thisId];
      // Оновити всім список гравців
      const payload = JSON.stringify({ type: 'players', players });
      wsServer.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    }
  });
});
