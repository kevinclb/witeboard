import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { handleMessage, handleDisconnect } from './handlers.js';
import { ensureBoardExists } from './db/client.js';
import { initBoardSequence } from './sequencer.js';
import { runMigrations } from './db/migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || process.env.WS_PORT || '3001', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Static file serving for production
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  if (!isProduction) return false;

  const url = req.url || '/';
  
  // Health check endpoint
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return true;
  }

  // Try to serve static file
  let filePath = path.join(PUBLIC_DIR, url === '/' ? 'index.html' : url);
  
  // Security: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }

  // Check if file exists
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }

  // SPA fallback: serve index.html for any non-file route
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(indexPath).pipe(res);
    return true;
  }

  return false;
}

async function main() {
  console.log(`Starting Witeboard server (${isProduction ? 'production' : 'development'})...`);

  // Run migrations and initialize database
  try {
    // Run migrations (idempotent - safe to run every startup)
    await runMigrations();
    
    // Ensure global board exists and init sequence
    await ensureBoardExists('global', 'Global Whiteboard');
    await initBoardSequence('global');
    console.log('✓ Global board initialized');
  } catch (error) {
    console.error('Failed to initialize database. Is Postgres running?');
    if (!isProduction) {
      console.error('Run: pnpm db:up');
    }
    console.error(error);
    process.exit(1);
  }

  // Create HTTP server
  const server = http.createServer((req, res) => {
    // Handle static files in production
    if (serveStatic(req, res)) return;

    // Health check (also works in development)
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
      return;
    }

    // Default response for non-production
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Witeboard WebSocket Server');
  });

  // Create WebSocket server attached to HTTP server
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    console.log('New connection');

    ws.on('message', async (data) => {
      try {
        await handleMessage(ws, data.toString());
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      handleDisconnect(ws);
    });
  });

  // Start server
  server.listen(PORT, () => {
    console.log(`✓ Server listening on http://localhost:${PORT}`);
    if (isProduction) {
      console.log(`✓ Serving static files from ${PUBLIC_DIR}`);
    }
    console.log(`✓ WebSocket available at ws://localhost:${PORT}`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
