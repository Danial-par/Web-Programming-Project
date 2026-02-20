# Web-Programming-Project

## Running the stack with Docker

Requirements:
- Docker
- Docker Compose

The repository ships with a docker-compose file that starts:
- PostgreSQL
- Django REST backend (port 8000)
- React/Vite frontend (port 5173)

To start everything:

```bash
docker compose up --build
```

Then open:
- Backend API docs: http://localhost:8000/api/docs/
- Frontend: http://localhost:5173/

The backend is already configured with:

- `ALLOWED_HOSTS=localhost,127.0.0.1,backend`
- `CORS_ALLOW_ALL_ORIGINS=True` (see `backend/.env.example`, loaded by `docker-compose.yml`)

The frontend talks to the backend using:

- `VITE_API_BASE_URL=http://localhost:8000/api`

If you change backend port or host, update that environment variable accordingly.

## Running the frontend locally (without Docker)

From the `frontend` directory:

```bash
cd frontend
npm install
npm run dev
```

This will start Vite on http://localhost:5173.

Make sure the backend is running on http://localhost:8000 (either via Docker or your local Python environment),
or adjust `VITE_API_BASE_URL` when starting Vite:

```bash
VITE_API_BASE_URL=http://localhost:8000/api npm run dev
```
