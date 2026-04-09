# Adfrio Media Platform

Production-ready full-stack MERN monorepo with a black-and-white UI, dual-mode music/video hubs, persistent global media playback, and deployable client/server stacks.

## Stack

- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn-style components + Zustand + TanStack Query + plyr-react
- Backend: Node.js + Express + TypeScript + MongoDB (Mongoose)
- Auth: Google OAuth + OTP over email (Nodemailer)
- Media Source: Piped API failover proxy (search + streams)
- PWA: `vite-plugin-pwa` + manifest + service worker
- Deploy: Vercel (`client`) + Render (`server`) + MongoDB Atlas

## Monorepo Structure

- `client/` Vite frontend app
- `server/` Express API
- `render.yaml` Render blueprint for backend deployment

## Core Features

- Spotify-like music hub and YouTube-like video hub
- Infinite scroll media discovery
- Persistent global audio player across route navigation
- Automatic audio pause + fullscreen video takeover on video play
- Manual video quality switching (e.g. 1080p / 720p) in Plyr
- 10-second seek backward/forward controls
- Sleep timer controls
- Media Session API integration for lock-screen/native controls
- Responsive layout with mobile bottom navigation + global player controls
- Playlist persistence in MongoDB Atlas

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

- `server/.env.example` -> `server/.env`
- `client/.env.example` -> `client/.env`

3. Start development:

```bash
npm run dev
```

- Client: `http://localhost:5173`
- Server: `http://localhost:8080`

## Scripts

- `npm run dev` start client + server concurrently
- `npm run lint` type-check both workspaces
- `npm run build` production build for both workspaces

## API Endpoints

- `GET /health`
- `POST /api/auth/google`
- `POST /api/auth/google/code`
- `POST /api/auth/otp/request`
- `POST /api/auth/otp/verify`
- `GET /api/auth/me`
- `GET /api/media/search?q=&type=music|video&pageToken=`
- `GET /api/media/streams/:id`
- `GET /api/playlists`
- `POST /api/playlists`
- `POST /api/playlists/:id/items`
- `DELETE /api/playlists/:id/items/:mediaId`
- `DELETE /api/playlists/:id`

## Deploy

### Frontend (Vercel)

- Create a new Vercel project and set **Root Directory** to `client`.
- Framework preset: `Vite`.
- Build command: `npm run build`.
- Output directory: `dist`.
- Keep `client/vercel.json` enabled (SPA rewrite + security headers).
- Add environment variables:
  - `VITE_API_URL=https://your-render-api.onrender.com/api`
  - `VITE_GOOGLE_CLIENT_ID=<google-oauth-web-client-id>`
- If you use a custom domain, add it in Vercel first, then use that exact URL in Render `CLIENT_URL`.

### Backend (Render)

- Use `render.yaml` blueprint (recommended) or create a Web Service manually with **Root Directory** `server`.
- Build command: `npm install && npm run build`.
- Start command: `npm run start`.
- Health check path: `/health`.
- Set environment variables:
  - Required: `CLIENT_URL`, `MONGO_URI`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`.
  - Required for Google auth code flow: `GOOGLE_CLIENT_SECRET`.
  - Recommended: `JWT_EXPIRES_IN=30d`, `GOOGLE_REDIRECT_URI=postmessage`, `PIPED_INSTANCES=<comma-separated instances>`.
  - Optional (OTP email): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Keep `NODE_ENV=production`.
- Do not hardcode `PORT`; Render injects it automatically.

## Production Notes

- Backend CORS now only allows:
  - Your configured `CLIENT_URL`.
  - Local dev origins (`localhost` ports 3000/4173/5173).
  - Render/Vercel preview subdomains.
- Configure at least two Piped instances in `PIPED_INSTANCES` for failover.
- OTP email falls back to console logging in development if SMTP is not configured.
- Rotate JWT secret and enforce secure secret management in production.
- Review and patch npm audit vulnerabilities before public launch.

