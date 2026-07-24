import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(rootDir, '.env') });

let ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
try {
  const ffmpegModule = await import('ffmpeg-static');
  if (ffmpegModule.default) ffmpegPath = ffmpegModule.default;
} catch {
  // Optional: Falls das Paket nicht installiert werden konnte, wird ein lokal installiertes ffmpeg versucht.
}

const app = express();
const PORT = Number(process.env.PORT || 8787);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me-immediately';
const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, 'uploads');
const clientDist = path.join(rootDir, 'client', 'dist');

await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(uploadDir, { recursive: true });

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(uploadDir));

const files = {
  users: path.join(dataDir, 'users.json'),
  projects: path.join(dataDir, 'projects.json'),
  settings: path.join(dataDir, 'settings.json')
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`Fehler beim Lesen von ${file}:`, error);
    return structuredClone(fallback);
  }
}

async function writeJson(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}

function id(prefix = 'id') {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function seed() {
  const users = await readJson(files.users, []);
  if (!users.length) {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'SafaStart2026!';
    users.push({
      id: id('usr'),
      username,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'admin',
      active: true,
      mustChangePassword: true,
      createdAt: new Date().toISOString()
    });
    await writeJson(files.users, users);
    console.log(`\nAdmin angelegt: ${username} / ${password}\nPasswort nach dem ersten Login ändern.\n`);
  }
  if (!(await readJson(files.projects, null))) await writeJson(files.projects, []);
  const settings = await readJson(files.settings, null);
  if (!settings) {
    await writeJson(files.settings, {
      pollinationsKey: '',
      chatModel: 'openai',
      imageModel: 'flux',
      videoModel: 'wan'
    });
  }
}
await seed();

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

async function auth(req, res, next) {
  try {
    const raw = req.headers.authorization || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' });
    const payload = jwt.verify(token, JWT_SECRET);
    const users = await readJson(files.users, []);
    const user = users.find((item) => item.id === payload.sub && item.active);
    if (!user) return res.status(401).json({ error: 'Konto nicht gefunden oder deaktiviert.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Sitzung ungültig oder abgelaufen.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Nur für Admins.' });
  next();
}

function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

function getPollinationsKey(settings) {
  return process.env.POLLINATIONS_KEY || settings.pollinationsKey || '';
}

function externalUrl(req, filename) {
  return `${req.protocol}://${req.get('host')}/uploads/${filename}`;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'Safa AI Studio' }));

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const users = await readJson(files.users, []);
  const user = users.find((item) => item.username.toLowerCase() === username.toLowerCase());
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Benutzername oder Passwort ist falsch.' });
  }
  res.json({ token: signToken(user), user: safeUser(user) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));

app.post('/api/auth/change-password', auth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 8) return res.status(400).json({ error: 'Das neue Passwort braucht mindestens 8 Zeichen.' });
  if (!(await bcrypt.compare(currentPassword, req.user.passwordHash))) {
    return res.status(400).json({ error: 'Das aktuelle Passwort ist falsch.' });
  }
  const users = await readJson(files.users, []);
  const index = users.findIndex((item) => item.id === req.user.id);
  users[index].passwordHash = await bcrypt.hash(newPassword, 12);
  users[index].mustChangePassword = false;
  await writeJson(files.users, users);
  res.json({ ok: true });
});

app.get('/api/users', auth, adminOnly, async (_req, res) => {
  const users = await readJson(files.users, []);
  res.json({ users: users.map(safeUser) });
});

app.post('/api/users', auth, adminOnly, async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: 'Benutzername: 3–32 Zeichen, nur Buchstaben, Zahlen, Punkt, Minus oder Unterstrich.' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Passwort braucht mindestens 8 Zeichen.' });
  const users = await readJson(files.users, []);
  if (users.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: 'Benutzername ist bereits vergeben.' });
  }
  const user = {
    id: id('usr'), username, passwordHash: await bcrypt.hash(password, 12), role,
    active: true, mustChangePassword: true, createdAt: new Date().toISOString()
  };
  users.push(user);
  await writeJson(files.users, users);
  res.status(201).json({ user: safeUser(user) });
});

app.patch('/api/users/:id', auth, adminOnly, async (req, res) => {
  const users = await readJson(files.users, []);
  const index = users.findIndex((item) => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Konto nicht gefunden.' });
  if (typeof req.body.active === 'boolean') users[index].active = req.body.active;
  if (req.body.role && users[index].id !== req.user.id) users[index].role = req.body.role === 'admin' ? 'admin' : 'user';
  if (req.body.password) {
    if (String(req.body.password).length < 8) return res.status(400).json({ error: 'Passwort braucht mindestens 8 Zeichen.' });
    users[index].passwordHash = await bcrypt.hash(String(req.body.password), 12);
    users[index].mustChangePassword = true;
  }
  await writeJson(files.users, users);
  res.json({ user: safeUser(users[index]) });
});

app.get('/api/settings', auth, adminOnly, async (_req, res) => {
  const settings = await readJson(files.settings, {});
  res.json({
    hasPollinationsKey: Boolean(getPollinationsKey(settings)),
    keySource: process.env.POLLINATIONS_KEY ? 'env' : settings.pollinationsKey ? 'local' : 'none',
    chatModel: settings.chatModel || 'openai',
    imageModel: settings.imageModel || 'flux',
    videoModel: settings.videoModel || 'wan'
  });
});

app.put('/api/settings', auth, adminOnly, async (req, res) => {
  const settings = await readJson(files.settings, {});
  if (typeof req.body.pollinationsKey === 'string' && !process.env.POLLINATIONS_KEY) {
    settings.pollinationsKey = req.body.pollinationsKey.trim();
  }
  for (const key of ['chatModel', 'imageModel', 'videoModel']) {
    if (typeof req.body[key] === 'string' && req.body[key].trim()) settings[key] = req.body[key].trim();
  }
  await writeJson(files.settings, settings);
  res.json({ ok: true, hasPollinationsKey: Boolean(getPollinationsKey(settings)) });
});

app.get('/api/projects', auth, async (req, res) => {
  const projects = await readJson(files.projects, []);
  const visible = req.user.role === 'admin' ? projects : projects.filter((item) => item.ownerId === req.user.id);
  visible.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ projects: visible });
});

app.post('/api/projects', auth, async (req, res) => {
  const projects = await readJson(files.projects, []);
  const now = new Date().toISOString();
  const project = {
    id: id('prj'), ownerId: req.user.id,
    name: String(req.body.name || 'Unbenanntes Projekt').slice(0, 100),
    type: String(req.body.type || 'design').slice(0, 30),
    data: req.body.data || {}, createdAt: now, updatedAt: now
  };
  projects.push(project);
  await writeJson(files.projects, projects);
  res.status(201).json({ project });
});

app.put('/api/projects/:id', auth, async (req, res) => {
  const projects = await readJson(files.projects, []);
  const index = projects.findIndex((item) => item.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Projekt nicht gefunden.' });
  if (req.user.role !== 'admin' && projects[index].ownerId !== req.user.id) return res.status(403).json({ error: 'Kein Zugriff.' });
  projects[index] = {
    ...projects[index],
    name: String(req.body.name || projects[index].name).slice(0, 100),
    data: req.body.data ?? projects[index].data,
    updatedAt: new Date().toISOString()
  };
  await writeJson(files.projects, projects);
  res.json({ project: projects[index] });
});

app.delete('/api/projects/:id', auth, async (req, res) => {
  const projects = await readJson(files.projects, []);
  const project = projects.find((item) => item.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Projekt nicht gefunden.' });
  if (req.user.role !== 'admin' && project.ownerId !== req.user.id) return res.status(403).json({ error: 'Kein Zugriff.' });
  await writeJson(files.projects, projects.filter((item) => item.id !== req.params.id));
  res.json({ ok: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10) || '.bin';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } });

app.post('/api/upload', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei empfangen.' });
  res.json({ url: externalUrl(req, req.file.filename), filename: req.file.filename });
});

app.post('/api/ai/chat', auth, async (req, res) => {
  const prompt = String(req.body.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'Bitte eine Nachricht eingeben.' });
  const settings = await readJson(files.settings, {});
  const key = getPollinationsKey(settings);
  if (!key) {
    return res.json({
      offline: true,
      answer: `Der KI-Schlüssel ist noch nicht eingerichtet. Öffne als Admin „Admin & Einstellungen“ und füge einen Pollinations-Key ein.\n\nDeine Aufgabe war: „${prompt}“\n\nBis dahin kannst du den Flyer-, Bild-, Video- und Website-Editor bereits ohne KI benutzen.`
    });
  }
  try {
    const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: req.body.model || settings.chatModel || 'openai',
        messages: [
          {
            role: 'system',
            content: 'Du bist Safa AI, ein präziser Assistent für Werbetechnik, Beschriftung, Leuchtwerbung, Fahrzeugfolierung, Social-Media-Angebote, Flyer, Druckdaten und Webseiten. Antworte auf Deutsch, klar, praktisch und ohne unnötige Fachbegriffe.'
          },
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!response.ok) throw new Error(`KI-Dienst meldet ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || 'Keine Antwort erhalten.';
    res.json({ answer });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: `KI-Anfrage fehlgeschlagen: ${error.message}` });
  }
});

app.post('/api/ai/image', auth, async (req, res) => {
  const prompt = String(req.body.prompt || '').trim();
  const size = String(req.body.size || '1024x1024');
  if (!prompt) return res.status(400).json({ error: 'Bitte einen Bild-Prompt eingeben.' });
  const settings = await readJson(files.settings, {});
  const key = getPollinationsKey(settings);
  if (!key) return res.status(400).json({ error: 'Im Admin-Bereich zuerst einen Pollinations-Key eintragen.' });
  try {
    const response = await fetch('https://gen.pollinations.ai/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: req.body.model || settings.imageModel || 'flux',
        size,
        n: 1,
        quality: req.body.quality || 'medium',
        response_format: 'b64_json',
        safe: 'privacy,secrets,sexual,violence,shield'
      })
    });
    if (!response.ok) throw new Error(`Bild-KI meldet ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const imageData = data.data?.[0]?.b64_json;
    const imageUrl = data.data?.[0]?.url;
    if (imageData) {
      const filename = `ai-${Date.now()}-${crypto.randomUUID()}.png`;
      await fs.writeFile(path.join(uploadDir, filename), Buffer.from(imageData, 'base64'));
      return res.json({ url: externalUrl(req, filename) });
    }
    if (imageUrl) return res.json({ url: imageUrl });
    throw new Error('Der KI-Dienst hat kein Bild geliefert.');
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: `Bildgenerierung fehlgeschlagen: ${error.message}` });
  }
});

app.post('/api/ai/video', auth, async (req, res) => {
  const prompt = String(req.body.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'Bitte einen Video-Prompt eingeben.' });
  const settings = await readJson(files.settings, {});
  const key = getPollinationsKey(settings);
  if (!key) return res.status(400).json({ error: 'Im Admin-Bereich zuerst einen Pollinations-Key eintragen.' });
  const model = String(req.body.model || settings.videoModel || 'wan');
  const width = Number(req.body.width || 720);
  const height = Number(req.body.height || 1280);
  const duration = Math.max(2, Math.min(15, Number(req.body.duration || 4)));
  const params = new URLSearchParams({ model, width: String(width), height: String(height), duration: String(duration), safe: 'privacy,secrets,sexual,violence,shield' });
  try {
    const response = await fetch(`https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?${params}`, {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (!response.ok) throw new Error(`Video-KI meldet ${response.status}: ${await response.text()}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const filename = `video-${Date.now()}-${crypto.randomUUID()}.mp4`;
    await fs.writeFile(path.join(uploadDir, filename), buffer);
    res.json({ url: externalUrl(req, filename) });
  } catch (error) {
    console.error(error);
    res.status(502).json({ error: `Videogenerierung fehlgeschlagen: ${error.message}` });
  }
});

app.post('/api/video/merge', auth, async (req, res) => {
  const urls = Array.isArray(req.body.urls) ? req.body.urls : [];
  if (urls.length < 1) return res.status(400).json({ error: 'Keine Videoabschnitte vorhanden.' });
  try {
    const inputFiles = urls.map((url) => {
      const filename = decodeURIComponent(new URL(url).pathname.split('/').pop());
      const full = path.join(uploadDir, path.basename(filename));
      if (!full.startsWith(uploadDir)) throw new Error('Ungültiger Dateipfad.');
      return full;
    });
    for (const file of inputFiles) await fs.access(file);
    const listFile = path.join(uploadDir, `merge-${crypto.randomUUID()}.txt`);
    await fs.writeFile(listFile, inputFiles.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n'));
    const outputName = `gesamtvideo-${Date.now()}-${crypto.randomUUID()}.mp4`;
    const outputFile = path.join(uploadDir, outputName);
    await new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputFile]);
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr.slice(-1500))));
    });
    await fs.unlink(listFile).catch(() => {});
    res.json({ url: externalUrl(req, outputName) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: `Video konnte nicht zusammengefügt werden: ${error.message}` });
  }
});

try {
  await fs.access(clientDist);
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} catch {
  // Im Entwicklungsmodus liefert Vite das Frontend aus.
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Interner Fehler.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Safa AI Studio Server läuft auf Port ${PORT}`);
});
