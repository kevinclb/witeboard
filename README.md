# Witeboard

A globally shared, real-time collaborative whiteboard. Draw together with anyone, anywhere.

![Witeboard Screenshot](https://via.placeholder.com/800x400?text=Witeboard+Screenshot)

## Features

- **Real-time collaboration** — See others draw live with cursor presence
- **Infinite canvas** — Pan and zoom to explore endless space
- **Persistent drawings** — Everything syncs and survives page refresh
- **Anonymous by default** — No sign-up required, just draw
- **Multi-user presence** — See who's online with live cursor tracking

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- Docker (for local Postgres)

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/witeboard.git
cd witeboard

# Install dependencies
pnpm install

# Start Postgres (Docker)
pnpm db:up

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

Open http://localhost:5173 in your browser.

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start client + server in development mode |
| `pnpm build` | Build all packages for production |
| `pnpm db:up` | Start Postgres container |
| `pnpm db:down` | Stop Postgres container |
| `pnpm db:migrate` | Run database migrations |

## Architecture

```
witeboard/
├── packages/
│   ├── client/          # Vite + React frontend
│   ├── server/          # Node.js WebSocket backend
│   └── shared/          # Shared TypeScript types
├── docker-compose.yml   # Local Postgres
├── Dockerfile           # Production build
└── railway.json         # Railway deployment config
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite, React 18, TypeScript, Zustand |
| Backend | Node.js, ws (WebSocket), TypeScript |
| Database | PostgreSQL |
| Real-time | WebSocket with custom protocol |

### How It Works

1. **Append-only event log** — All drawing operations are immutable events
2. **Server-authoritative ordering** — Server assigns sequence numbers for consistency
3. **Deterministic replay** — Clients replay events to render identical canvases
4. **Three-layer canvas** — History, live strokes, and cursor overlay for performance

## Deployment

### Railway (Recommended)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/witeboard)

Or deploy manually:

1. Create a new Railway project
2. Add a **Postgres** database
3. Add a new service from GitHub
4. Railway auto-detects the Dockerfile
5. The `DATABASE_URL` is automatically injected

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string |
| `PORT` | No | `3001` | Server port |
| `NODE_ENV` | No | `development` | Environment mode |

### Manual Deployment

```bash
# Build for production
pnpm build

# The server serves both API and static files
cd packages/server
NODE_ENV=production node dist/index.js
```

## Controls

| Action | Control |
|--------|---------|
| Draw | Left-click + drag |
| Pan | Space + drag, or middle-click + drag |
| Zoom | Scroll wheel |
| Reset view | Click zoom percentage |

## API / WebSocket Protocol

### Client → Server

- `HELLO` — Join a board with identity
- `DRAW_EVENT` — Submit a stroke
- `CURSOR_MOVE` — Update cursor position

### Server → Client

- `WELCOME` — Confirm identity
- `SYNC_SNAPSHOT` — Full event history for replay
- `DRAW_EVENT` — Broadcast stroke to all clients
- `CURSOR_MOVE` — Broadcast cursor position
- `USER_LIST` / `USER_JOIN` / `USER_LEAVE` — Presence updates

## Roadmap

- [ ] Brush size and color picker UI
- [ ] Eraser tool
- [ ] Private breakout rooms (`/b/:boardId`)
- [ ] User authentication
- [ ] Undo/redo
- [ ] Export to PNG

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

## License

MIT

