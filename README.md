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

- Import `client` directory as a Vercel project.
- Build command: `npm run build`
- Output directory: `dist`
- Set env:
  - `VITE_API_URL=https://your-render-api.onrender.com/api`
  - `VITE_GOOGLE_CLIENT_ID=...`

### Backend (Render)

- Use `render.yaml` blueprint or create a Web Service pointing to `server`.
- Set all required env vars listed in `server/.env.example`.
- Google Authorization Code flow requires both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the backend.
- Default Google redirect for popup flow is `GOOGLE_REDIRECT_URI=postmessage`.
- Ensure `CLIENT_URL` matches your Vercel domain.

## Production Notes

- Configure at least two Piped instances in `PIPED_INSTANCES` for failover.
- OTP email falls back to console logging in development if SMTP is not configured.
- Rotate JWT secret and enforce secure secret management in production.
- Review and patch npm audit vulnerabilities before public launch.

