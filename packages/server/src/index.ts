import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables BEFORE importing modules that need them
// Support both .env and .env.local
import dotenv from 'dotenv';
const serverRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(serverRoot, '.env') });
dotenv.config({ path: path.join(serverRoot, '.env.local'), override: true });

// Now import modules that depend on environment variables
const { handleMessage, handleDisconnect } = await import('./handlers.js');
const { ensureBoardExists, getUserBoards, deleteBoard, createBoard } = await import('./db/client.js');
const { initBoardSequence } = await import('./sequencer.js');
const { runMigrations } = await import('./db/migrate.js');
const { verifyClerkToken } = await import('./auth.js');
const { generateUUID } = await import('@witeboard/shared');
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

/**
 * Handle REST API requests
 */
async function handleApi(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
  const url = req.url || '';
  const method = req.method || 'GET';
  
  // Only handle /api/* routes
  if (!url.startsWith('/api/')) {
    return false;
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Get auth token from header
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Verify token
  const userId = await verifyClerkToken(token ?? undefined);

  // GET /api/boards - List user's boards
  if (url === '/api/boards' && method === 'GET') {
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return true;
    }

    try {
      const boards = await getUserBoards(userId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ boards }));
    } catch (error) {
      console.error('Error fetching boards:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return true;
  }

  // POST /api/boards - Create a new board
  if (url === '/api/boards' && method === 'POST') {
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return true;
    }

    try {
      // Read request body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const { name, isPrivate } = body;

      // Generate board ID and create the board
      const boardId = generateUUID();
      const board = await createBoard(boardId, name, userId, isPrivate ?? true);

      // Initialize sequence counter
      await initBoardSequence(boardId);

      console.log(`Board created via API: id=${boardId}, owner=${userId}, private=${isPrivate}`);

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ board }));
    } catch (error) {
      console.error('Error creating board:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return true;
  }

  // DELETE /api/boards/:id - Delete a board
  const deleteMatch = url.match(/^\/api\/boards\/([a-zA-Z0-9-]+)$/);
  if (deleteMatch && method === 'DELETE') {
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return true;
    }

    const boardId = deleteMatch[1];

    try {
      const deleted = await deleteBoard(boardId, userId);
      if (deleted) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Board not found or not authorized' }));
      }
    } catch (error) {
      console.error('Error deleting board:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return true;
  }

  // 404 for unknown API routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
  return true;
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
  const server = http.createServer(async (req, res) => {
    // Handle API routes first
    if (await handleApi(req, res)) return;

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
