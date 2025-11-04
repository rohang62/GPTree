# RohanGPT – Production‑Ready Chatbot App

RohanGPT is a ChatGPT‑style web app with a React (Vite + TypeScript) frontend and a Python (FastAPI) backend. It streams LLM responses token‑by‑token via SSE, persists data in Supabase, and implements conversation side threads (nested, infinite), pagination, auth, and a polished, keyboard‑friendly UI.

This README explains every major part of the application, the code layout, how the pieces interact, and exactly how to run it locally or with Docker. It also lists API endpoints, database schema, and troubleshooting tips.

## Highlights

- Pixel‑close ChatGPT core UX (left sidebar + main chat pane)
- Real‑time streaming via Server‑Sent Events (SSE)
- Supabase Auth + Profiles; conversations/messages stored in Supabase
- Infinite/nested side threads with inline buttons generated from text selections
- Markdown rendering with code highlight and copy button; math (KaTeX)
- Pagination for conversations and messages (20 per page)
- Light/dark theme, accessibility improvements, keyboard shortcuts
- CORS configured for local dev

## Architecture

- Frontend: React 18 + Vite + TypeScript + TailwindCSS
  - State: Zustand
  - Routing: React Router
  - Streaming: `EventSource` + `AbortController`
  - Markdown: `react-markdown`, `remark-gfm`, `remark-math`, `rehype-highlight`, `rehype-katex`
  - Auth/DB: `@supabase/supabase-js`

- Backend: FastAPI (Python 3.11 recommended) + Uvicorn
  - SSE streaming endpoint (`/api/chat/stream`)
  - CRUD for conversations/messages
  - Supabase Python client for persistence
  - OpenAI‑compatible provider layer (swappable)

## Folder Structure

```
.
├── backend/
│   ├── main.py                # FastAPI app, CORS, router includes
│   ├── routers/
│   │   ├── chat.py            # SSE chat streaming + non‑streaming fallback
│   │   ├── conversations.py   # CRUD + pagination + side‑thread creation
│   │   └── messages.py        # Message pagination/creation
│   ├── llm_providers/
│   │   └── openai.py          # OpenAI‑compatible async streaming generator
│   ├── supabase_client.py     # Lazy supabase client init (service role)
│   └── requirements.txt       # Backend deps
│
├── frontend/
│   ├── index.html
│   ├── vite.config.ts
│   ├── Dockerfile
│   └── src/
│       ├── main.tsx           # React root with ErrorBoundary + Router
│       ├── App.tsx            # Route table (/, /login, /signup, /forgot)
│       ├── index.css          # Tailwind + theme variables
│       ├── lib/
│       │   ├── api.ts         # Fetch helpers + types
│       │   └── supabase.ts    # Supabase client init (browser)
│       ├── hooks/
│       │   └── useSSEStream.ts# EventSource lifecycle + AbortController
│       ├── store/
│       │   ├── useAuthStore.ts# Auth/session/profile state + actions
│       │   └── useChatStore.ts# Conversations/messages/theme/model state
│       ├── components/
│       │   ├── ChatLayout.tsx # Sidebar + main chat + settings + thread dock
│       │   ├── MessageList.tsx# Chat bubbles, render markdown, actions
│       │   ├── Composer.tsx   # Expandable textarea + send/stop
│       │   ├── Markdown.tsx   # Markdown renderer w/ code copy & math
│       │   ├── SideThreadPanel.tsx # Right‑docked thread panel (nested)
│       │   └── ErrorBoundary.tsx   # UI error boundary
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Signup.tsx
│       │   └── ForgotPassword.tsx  # Disabled flow (informational)
│       └── components/ProtectedRoute.tsx
│
├── docker-compose.yml         # Frontend + backend services
└── README.md
```

## Frontend – Key Modules

- `src/components/ChatLayout.tsx`
  - Controls the main layout: left sidebar (conversations list, search, profile), and right main content area (header with title, message list, composer).
  - Integrates `useSSEStream` for streaming; `useAuthStore` and `useChatStore` for state.
  - Pagination for conversations/messages; infinite scroll.
  - Side threads: maintains a stack of right‑docked `SideThreadPanel`s and a minimized dock at the bottom (chips with titles). Chips align under their originating panels.

- `src/components/MessageList.tsx`
  - Renders chat messages. User messages have compact bubbles; assistant messages render free‑form Markdown (no enclosing bubble), with code highlight and copy.
  - Shows inline cursor while streaming and “Regenerate/Continue” controls after.

- `src/components/Composer.tsx`
  - Expandable textarea; Cmd/Ctrl+Enter sends; Esc focuses composer (and stops if streaming).
  - Aligns perfectly with send/stop button; paperclip icon aligned center within input.

- `src/components/Markdown.tsx`
  - `react-markdown` with `remark-gfm`, `remark-math`, `rehype-highlight`, `rehype-katex`.
  - Adds copy button to code blocks. Supports inline selection for side‑thread creation (via callbacks).

- `src/components/SideThreadPanel.tsx`
  - Renders a side thread with its own message list/composer.
  - Header shows thread title; kebab menu (rename/delete); minimize button (no close X).
  - Minimizing passes title/position to the bottom dock, which renders solid rectangular chips (no overlap/gap). Chips restore or close threads.

- `src/hooks/useSSEStream.ts`
  - Manages EventSource lifecycle; accumulates streamed tokens; exposes `startStream`, `stopStream`, `streaming`, `content`, and the server‑returned `conversationId`.

- `src/store/useAuthStore.ts`
  - Supabase auth: sign in, sign up (immediate login), sign out, profile load, session change handling, persistence. Clears storage on sign out.

- `src/store/useChatStore.ts`
  - Conversations/messages state, theme, model (default: `gpt-4`). Helper actions to add/update/delete items.

- `src/lib/api.ts`
  - Typed helpers for backend routes (conversations/messages/chat stream).
  - Implements pagination helpers and new side‑thread creation endpoint.

## Backend – Key Modules

- `backend/main.py`
  - FastAPI app, CORS for local dev, router registration.

- `backend/routers/chat.py`
  - `POST /api/chat/stream`: SSE stream of tokens. Formats incoming messages array for the provider, loads full conversation history when `conversationId` is provided, and persists both user and assistant messages.
  - Sends keep‑alive comments to keep connections healthy.

- `backend/routers/conversations.py`
  - `GET /api/conversations`: Paginated fetch of a user’s conversations (excludes side threads).
  - `POST /api/conversations`: Create conversation.
  - `GET /api/conversations/{id}`: Fetch one conversation by id.
  - `PATCH /api/conversations/{id}`: Update conversation (expects JSON body `{ user_id, title? , model? , temperature? }`).
  - `DELETE /api/conversations/{id}`: Delete conversation (and cascade delete messages; child conversations also cascade if FK is set as described below).
  - `POST /api/conversations/side-thread`: Create a side thread from a selected text range; updates the parent message with an inline button index.

- `backend/routers/messages.py`
  - `GET /api/messages`: Paginated fetch of messages for a conversation.
  - `POST /api/messages`: Create a message.

- `backend/llm_providers/openai.py`
  - OpenAI‑style streaming generator (`async for chunk in client.chat.completions.create(..., stream=True)`). Easy to swap with another provider if needed.

- `backend/supabase_client.py`
  - Lazy initialization of the Supabase client using env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## Database (Supabase)

Tables (minimum):

- `conversations`
  - `conversation_id` (uuid, PK)
  - `user_id` (uuid, owner)
  - `title` (text)
  - `model` (text)
  - `temperature` (float)
  - `parent_message_id` (uuid, nullable) – message that spawned this side thread
  - `parent_conversation_id` (uuid, nullable) – parent conversation; add FK for cascade
  - `created_at`, `updated_at`

- `messages`
  - `message_id` (uuid, PK)
  - `conversation_id` (uuid, FK → conversations.conversation_id ON DELETE CASCADE)
  - `user_id` (uuid)
  - `role` (text: `user` | `assistant` | `system`)
  - `content` (text)
  - `indices_for_button` (jsonb, nullable) – array of `{ start, end, conversation_id }`
  - `created_at`

## API Endpoints (summary)

- `POST /api/chat/stream` → SSE stream of tokens; expects `{ userId, conversationId?, messages, model?, temperature? }`
- Conversations
  - `GET /api/conversations?user_id=...&page=1&page_size=20`
  - `POST /api/conversations` (body: `{ user_id, title, model, temperature, is_side_thread?, parent_*? }`)
  - `GET /api/conversations/{id}?user_id=...`
  - `PATCH /api/conversations/{id}` (JSON body: `{ user_id, title?, model?, temperature? }`)
  - `DELETE /api/conversations/{id}?user_id=...`
- Messages
  - `GET /api/messages?conversation_id=...&user_id=...&page=1&page_size=20`
  - `POST /api/messages` (body: `{ conversation_id, user_id, role, content }`)
- Side Threads
  - `POST /api/conversations/side-thread` (body: `{ user_id, parent_message_id, parent_conversation_id, selected_text, start_index, end_index }`)

## Environment Variables

Create `.env` files:

Backend (`backend/.env`):

```
SUPABASE_URL= https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY= <service-role-key>
OPENAI_API_KEY= <optional-if-using-openai-provider>
ALLOWED_ORIGINS=http://localhost:5173
```

Frontend (`frontend/.env`):

```
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

## Run Locally

1) Supabase: Create tables/policies (per schema above). Ensure service role key is set for the backend.

2) Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --log-level info
```

3) Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

Open `http://localhost:5173`.

## Run with Docker

```bash
docker compose up --build
```

Services:

- Frontend: http://localhost:5173
- Backend: http://localhost:8000

## Side Threads – How It Works

1) Select text in an assistant message → a floating “Open side thread” button appears.
2) Clicking creates a child conversation; the selected text becomes a clickable inline button in the parent message.
3) Child threads open as right‑docked panels (can be nested). Panels can be minimized to chips below the composer; chips display thread titles and can be restored or closed.

## Keyboard Shortcuts

- Cmd/Ctrl + Enter: Send
- Esc: Focus composer (and stop streaming if active)

## Troubleshooting

- “Failed to fetch” Supabase on frontend:
  - Ensure `VITE_SUPABASE_URL` is `https://<ref>.supabase.co` (not the dashboard URL).
- Backend 422 on PATCH update:
  - Send `Content-Type: application/json` and body `{ "user_id": "...", "title": "..." }`.
- CORS 400 on SSE preflight:
  - Backend includes explicit OPTIONS handler; confirm `ALLOWED_ORIGINS` includes your frontend origin.
- Streaming doesn’t persist message:
  - The frontend appends the final assistant message when streaming ends; ensure you don’t navigate away during stream.

## Roadmap / Spec Gaps

- Optional WebSocket streaming mode (SSE is default)
- Health check endpoint
- Collapsible long code blocks
- Provider‑generated auto‑titles (currently first user message heuristic)

---

If anything is unclear or you want me to wire up the remaining spec items (health endpoint, WS toggle, collapsible code), say the word and I’ll add them. 

A pixel-close clone of RohanGPT's core chat UX with real-time token-by-token streaming, built with React (Vite) + TypeScript frontend and Python (FastAPI) backend.

## Features

- ✨ **Real-time streaming**: Token-by-token streaming using Server-Sent Events (SSE)
- 💬 **Chat interface**: Left sidebar with conversation history + main conversation pane
- 💾 **Persistence**: SQLite database for conversations and messages
- 🎨 **Theming**: Light/Dark mode toggle with persistent preference
- 📝 **Markdown support**: Full markdown rendering with code highlighting, math (KaTeX), and copy buttons
- ⌨️ **Keyboard shortcuts**: Cmd/Ctrl+Enter to send, Esc to focus composer
- 🛑 **Stop generation**: Ability to stop streaming at any time
- 🔄 **Regenerate & Continue**: Regenerate responses or continue from where it left off

## Tech Stack

### Frontend
- React 18 + Vite + TypeScript
- TailwindCSS for styling
- Zustand for state management
- react-markdown with syntax highlighting (highlight.js) and math support (KaTeX)
- Lucide React for icons

### Backend
- Python 3.11 + FastAPI
- SQLModel for database ORM
- SQLite for persistence
- OpenAI API (abstracted for easy provider swapping)
- SSE (Server-Sent Events) for streaming

## Setup & Installation

### Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- OpenAI API key

### Quick Start

1. **Setup backend:**
   ```bash
   cd backend
   
   # Create virtual environment (Python 3.11+ required)
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Create .env file
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY:
   # OPENAI_API_KEY=sk-your-key-here
   ```

2. **Setup frontend:**
   ```bash
   cd frontend
   npm install --legacy-peer-deps
   ```
   
   Note: If you encounter dependency conflicts, use `--legacy-peer-deps` flag

3. **Run backend:**
   ```bash
   cd backend
   source venv/bin/activate  # Activate venv if not already active
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

4. **Run frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

5. **Open browser:**
   Navigate to `http://localhost:5173`

### Using Docker

1. **Setup environment:**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY
   ```

2. **Start services:**
   ```bash
   docker-compose up --build
   ```

   Backend will be at `http://localhost:8000`  
   Frontend will be at `http://localhost:5173`

## Project Structure

```
.
├── backend/
│   ├── main.py              # FastAPI app entry point
│   ├── models.py            # SQLModel database models
│   ├── db.py                # Database connection & session
│   ├── routers/
│   │   ├── chat.py          # SSE streaming endpoint
│   │   ├── conversations.py # Conversation CRUD
│   │   └── messages.py      # Message CRUD
│   ├── llm_providers/
│   │   └── openai.py        # OpenAI streaming implementation
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatLayout.tsx   # Main layout (sidebar + main)
│   │   │   ├── MessageList.tsx  # Message display
│   │   │   ├── Composer.tsx      # Input composer
│   │   │   └── Markdown.tsx      # Markdown renderer
│   │   ├── hooks/
│   │   │   └── useSSEStream.ts   # SSE streaming hook
│   │   ├── store/
│   │   │   └── useChatStore.ts   # Zustand store
│   │   ├── lib/
│   │   │   └── api.ts            # API client
│   │   └── App.tsx
│   └── package.json
├── docker-compose.yml
└── README.md
```

## API Endpoints

### Chat
- `POST /api/chat/stream` - Stream chat completion (SSE)
- `POST /api/chat` - Non-streaming fallback

### Conversations
- `GET /api/conversations` - List all conversations
- `POST /api/conversations` - Create conversation
- `GET /api/conversations/{id}` - Get conversation
- `PATCH /api/conversations/{id}` - Update conversation
- `DELETE /api/conversations/{id}` - Delete conversation

### Messages
- `GET /api/messages?conversationId={id}` - Get messages
- `POST /api/messages` - Create message

### Health
- `GET /api/health` - Health check

## Configuration

### Backend Environment Variables

Create `backend/.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
DATABASE_URL=sqlite:///./chat.db
ALLOWED_ORIGINS=http://localhost:5173
```

### Frontend Environment Variables

Create `frontend/.env` (optional):

```env
VITE_API_URL=http://localhost:8000
```

## Usage

1. **Start a new chat**: Click "New chat" button in sidebar
2. **Type a message**: Use the composer at the bottom
3. **Send**: Press Cmd/Ctrl+Enter or click Send
4. **Watch streaming**: Tokens appear in real-time
5. **Stop**: Click "Stop" button during streaming
6. **Regenerate**: Click "Regenerate" on any assistant message
7. **Continue**: Click "Continue" to extend the last response
8. **Switch conversations**: Click any conversation in sidebar
9. **Delete**: Hover over conversation and click X
10. **Settings**: Click Settings in footer to adjust model, temperature, or theme

## Keyboard Shortcuts

- `Cmd/Ctrl + Enter` - Send message
- `Shift + Enter` - New line in composer
- `Esc` - Focus composer (stops streaming if active)

## Customization

### Swapping LLM Providers

The backend uses an abstracted provider interface. To swap providers:

1. Create a new file in `backend/llm_providers/` (e.g., `anthropic.py`)
2. Implement the same `stream_chat()` async generator signature
3. Update imports in `routers/chat.py`

Example structure:
```python
async def stream_chat(messages, model, temperature, top_p) -> AsyncGenerator[str, None]:
    # Your provider's streaming implementation
    async for chunk in your_provider_stream(...):
        yield chunk.content
```

## Development

### Backend Development

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

### Frontend Development

```bash
cd frontend
npm run dev
```

## Production Build

### Frontend

```bash
cd frontend
npm run build
# Output in frontend/dist/
```

### Backend

```bash
cd backend
# Ensure .env is configured
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Troubleshooting

### Python/pip Issues
- **`pip: command not found`**: Use `pip3` instead of `pip`, or install pip:
  ```bash
  python3 -m ensurepip --upgrade
  ```
- **`uvicorn: command not found`**: Make sure you've activated the virtual environment:
  ```bash
  source venv/bin/activate  # macOS/Linux
  # or
  venv\Scripts\activate     # Windows
  ```
- **Virtual environment**: Always activate the venv before running uvicorn:
  ```bash
  cd backend
  source venv/bin/activate
  uvicorn main:app --reload
  ```

### Frontend Issues
- **Dependency conflicts**: If npm install fails, use:
  ```bash
  npm install --legacy-peer-deps
  ```
- **Module not found**: Make sure you ran `npm install` in the frontend directory

### Backend Issues
- **Streaming not working**: Check that `OPENAI_API_KEY` is set in backend `.env`
- **CORS errors**: Ensure `ALLOWED_ORIGINS` in backend `.env` includes your frontend URL
- **Database errors**: Delete `backend/chat.db` to reset (all data will be lost)
- **`.env.example: No such file or directory`**: The file should be created automatically. If missing, create it manually:
  ```bash
  cd backend
  echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
  echo "DATABASE_URL=sqlite:///./chat.db" >> .env
  echo "ALLOWED_ORIGINS=http://localhost:5173" >> .env
  ```
- **`TypeError: __init__() got an unexpected keyword argument 'proxies'`**: This is a version compatibility issue. Fixed by:
  - Upgrading `openai` to `>=1.12.0` (updated in requirements.txt)
  - Using lazy initialization for the OpenAI client
  - Reinstalling dependencies: `pip install --upgrade -r requirements.txt`
- **`TypeError: issubclass() arg 1 must be a class`**: Fixed by using `Enum` instead of `Literal` for SQLModel compatibility (already updated in models.py)

## License

MIT

