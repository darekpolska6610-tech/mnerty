const express = require('express');
const session = require('express-session');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Zezwolenie na połączenia z Twojej strony na Netlify
app.use(cors({
  origin: ['https://boty67.netlify.app', 'http://localhost:3000'],
  credentials: true
}));

app.use(session({
  secret: 'minokalira_secret_1337',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // W środowisku produkcyjnym z HTTPS warto zmienić na true
    sameSite: 'lax'
  }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const users = {
  'minokalira': { password: '123123w', role: 'admin' },
  'vemnum_333': { password: '123123w', role: 'admin' }
};

const LOG_FILE_PATH = path.join(__dirname, 'bot.log');

// ANTY-SPAM
const IGNORED_PHRASES = [
  'Nie mozesz podnosic przedmiotow na cudzej Dzialce',
  'Nie możesz podnosić przedmiotów na cudzej Działce',
  'Masz do odebrania:',
  'Wejdź na Discord',
  'WPISZ NA CZACIE: /dc',
  'Epicki Klucz'
];

let lastLogLine = '';
let repeatCount = 1;

function processFilteredLog(dataChunk) {
  const lines = dataChunk.toString().split('\n');
  lines.forEach(line => {
    if (!line.trim()) return;
    const isSpam = IGNORED_PHRASES.some(phrase => line.includes(phrase));
    if (isSpam) return;

    if (line === lastLogLine) {
      repeatCount++;
    } else {
      if (lastLogLine) {
        let finalOutput = lastLogLine;
        if (repeatCount > 1) {
          finalOutput = `[x${repeatCount}] ${lastLogLine}`;
        }
        fs.appendFile(LOG_FILE_PATH, finalOutput + '\n', () => {});
      }
      lastLogLine = line;
      repeatCount = 1;
    }
  });
}

// URUCHAMIANIE BOTA MINECRAFT
const BOT_SCRIPT_PATH = path.join(__dirname, 'multi-bot.js');
let botProcess = null;

function startBotProcess() {
  if (!fs.existsSync(BOT_SCRIPT_PATH)) {
    console.log(`[BŁĄD]: Brak pliku ${BOT_SCRIPT_PATH}!`);
    return;
  }

  console.log(`[SYSTEM]: Uruchamianie bota (${BOT_SCRIPT_PATH})...`);
  fs.writeFileSync(LOG_FILE_PATH, `[SYSTEM]: Uruchomiono bota o ${new Date().toLocaleTimeString()}\n`);

  botProcess = spawn('node', [BOT_SCRIPT_PATH], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  botProcess.stdout.on('data', (data) => processFilteredLog(data));
  botProcess.stderr.on('data', (data) => processFilteredLog(data));

  botProcess.on('close', (code) => {
    const msg = `\n[SYSTEM]: Bot wyłączony (kod ${code}). Restart za 5s...\n`;
    fs.appendFile(LOG_FILE_PATH, msg, () => {});
    setTimeout(startBotProcess, 5000);
  });
}

startBotProcess();

// API LOGOWANIA
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (users[username] && users[username].password === password) {
    req.session.user = { username, role: users[username].role };
    return res.json({ success: true, user: req.session.user });
  }
  res.status(401).json({ success: false, message: 'Błędne dane logowania' });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ authenticated: true, user: req.session.user });
  }
  res.json({ authenticated: false });
});

// API KOMEND
app.post('/api/command', (req, res) => {
  if (!req.session.user) return res.status(401).send({ error: 'Brak autoryzacji' });
  const { command } = req.body;

  if (command.startsWith('@wygenerujkonto')) {
    const parts = command.split(' ');
    const targetPlayer = parts[1];
    const duration = parts[2] || '1h';

    if (targetPlayer) {
      const randomSuffix = Math.floor(Math.random() * 9000 + 1000);
      const generatedLogin = `bot_${targetPlayer}_${randomSuffix}`;
      const generatedPassword = `pass_${Math.random().toString(36).substring(2, 8)}`;
      const portalLink = 'boty67.netlify.app';

      const msgCommand = `/msg ${targetPlayer} [Bot-Service] Twoje konto wygasajace za ${duration} -> Login: ${generatedLogin} | Haslo: ${generatedPassword} | Panel: ${portalLink}`;

      if (botProcess && botProcess.stdin) {
        botProcess.stdin.write(msgCommand + '\n');
      }
    }
  } else {
    if (botProcess && botProcess.stdin) {
      botProcess.stdin.write(command + '\n');
    }
  }
  res.json({ success: true });
});

// API LOGÓW KONSOLI
app.get('/api/logs', (req, res) => {
  if (!req.session.user) return res.status(401).send({ error: 'Brak autoryzacji' });
  if (fs.existsSync(LOG_FILE_PATH)) {
    fs.readFile(LOG_FILE_PATH, 'utf8', (err, data) => {
      if (err) return res.json({ logs: 'Błąd odczytu logów' });
      const lines = data.split('\n');
      res.json({ logs: lines.slice(-150).join('\n') });
    });
  } else {
    res.json({ logs: 'Oczekiwanie na start...' });
  }
});

app.get('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`[BACKEND RENDER]: Serwer działa na porcie ${PORT}`);
});
