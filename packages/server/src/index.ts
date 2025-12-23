import 'dotenv/config';
import { WebSocketServer } from 'ws';
import { handleMessage, handleDisconnect } from './handlers.js';
import { ensureBoardExists } from './db/client.js';
import { initBoardSequence } from './sequencer.js';

const PORT = parseInt(process.env.WS_PORT || '3001', 10);

async function main() {
  console.log('Starting Witeboard server...');

  // Ensure global board exists
  try {
    await ensureBoardExists('global', 'Global Whiteboard');
    await initBoardSequence('global');
    console.log('✓ Global board initialized');
  } catch (error) {
    console.error('Failed to initialize database. Is Postgres running?');
    console.error('Run: pnpm db:up && pnpm db:migrate');
    console.error(error);
    process.exit(1);
  }

  // Create WebSocket server
  const wss = new WebSocketServer({ port: PORT });

  wss.on('connection', (ws: import('ws').WebSocket) => {
    console.log('New connection');

    ws.on('message', async (data: import('ws').RawData) => {
      try {
        await handleMessage(ws, data.toString());
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws);
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      handleDisconnect(ws);
    });
  });

  console.log(`✓ WebSocket server listening on ws://localhost:${PORT}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

