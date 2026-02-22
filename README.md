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

## Role setup (group names = access)

Assigning a user to a **Django Group** with one of the following names is enough for that role’s access; you do not need to add Django permissions to the group.

| Role (group name) | Capabilities |
|-------------------|--------------|
| **Cadet** | See all complaints, cadet review |
| **Officer** | See all complaints, officer review; scene reports (view all, approve); officer tip review; reward lookup; add/change evidence |
| **Detective** | Detective board (create/edit/delete items and connections); propose & review suspects; detective interrogation score; detective tip review; reward lookup; add/change evidence |
| **Sergeant** | Sergeant interrogation score |
| **Captain** | View all cases; view case report; captain interrogation decision; scene report approve; officer tip review; add case; add/change evidence |
| **Chief** | View all cases; view case report; chief critical interrogation review; auto-approve scene report; officer tip review; reward lookup; add/change evidence |
| **Judge** | Trial verdict; view case report |
| **Admin** | Same as Chief for case/report/scene/interrogation; admin panel (staff) is separate |
| **Workshop** | Detective board access; add/change evidence; fill forensic results |

You can still assign Django permissions to groups for finer control; the backend checks **permission OR group name** for these roles.

## Admin panel

Users with **Admin** or **Chief** role (and staff) can open the **Admin Panel** from the dashboard (`/admin`). There you can:

- **Roles:** List all roles (Django groups), create a new role by name, delete a role.
- **User role assignment:** Search users (by username, email, or name), select a user, then assign or remove roles. Backend: `GET /api/users/` (admin-only, optional `?q=...`), `POST /api/users/:id/assign-role/` and `POST /api/users/:id/remove-role/` with `{ "name": "<roleName>" }`.

## Frontend tests

From the `frontend` directory:

```bash
npm run test        # watch mode
npm run test:run    # single run
```

Tests use Vitest and React Testing Library. They cover login form validation, protected route redirect, home page stats (mocked fetch), most-wanted list (mocked fetch), and dashboard module visibility by role.
