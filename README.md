# VortexAI — Gemini AI Chatbot

VortexAI is a premium, full-stack AI Chatbot application built with an **Ionic Angular Capacitor** frontend and a **Node.js Express** backend. The workspace is set up as a monorepo, allowing you to run both the frontend application and the backend API server concurrently with a single command.

---

## Key Features

- 🖥️ **Glassmorphism Chat UI**: Modern web and mobile dashboard design with responsive layouts and fluid transitions.
- ⚡ **Real-time SSE Streaming**: Server-Sent Events (SSE) stream responses token-by-token for responsive Gemini generation.
- 🤖 **Google Gemini Integration**: Standardized query mapping supporting the latest Gemini models (e.g., `gemini-2.5-flash`).
- 💾 **Persistent Chat History**: Saves conversations automatically to local JSON files on the backend database folder.
- 📝 **Markdown & Code Highlight**: Rich text rendering with code syntax highlighting and a built-in copy-to-clipboard button.
- 🌓 **Dynamic Dark Mode**: Tactile theme toggle utilizing custom CSS variables.
- 📱 **Mobile Ready**: Configured with Capacitor, ready to compile to native iOS and Android apps.
- 🛠️ **Smart Demo Mode**: Interactive sandbox mode starts automatically if no API keys are configured, allowing for instant offline testing.

---

## Project Structure

```
d:\Learning-Claude\Phase 1\
├── package.json          # Root workspace config (monorepo concurrent runner)
├── .gitignore            # Root-level ignore rules for workspace files
├── README.md             # This documentation
├── backend/              # Node.js Express server running on port 7377
│   ├── package.json      # Backend SDK dependencies (Gemini, OpenAI, Claude)
│   ├── server.js         # API controllers, session IO, SSE streaming routes
│   ├── .env              # Backend configuration (PORT=7377, API Keys)
│   └── data/             # Local database directory (JSON files per session)
└── frontend/             # Ionic Angular Capacitor mobile-ready app
    ├── src/
    │   ├── app/
    │   │   ├── app.module.ts # Core module with HttpClientModule loaded
    │   │   ├── services/
    │   │   │   └── chat.service.ts # History CRUD and fetch-based SSE reader
    │   │   └── home/
    │   │       ├── home.page.html # Sidebar drawer and custom message panels
    │   │       ├── home.page.ts   # Marked parser setup, theme toggle, and UI states
    │   │       └── home.page.scss # Glassmorphic UI colors, variables, animations
    │   └── index.html    # Layout base (Google Fonts loaded)
    ├── capacitor.config.ts # Mobile configurations
    └── angular.json      # Build variables (increased stylesheet size budget)
```

---

## Quick Start (How to Run)

To run the entire project, run these commands from the **root workspace directory** (`d:\Learning-Claude\Phase 1`):

### 1. Install All Dependencies
Install the package managers and SDKs for the root runner, backend, and frontend directories in one go:
```bash
npm run install:all
```

### 2. Configure Your API Key
Open the environment file at `backend/.env` and insert your credentials:
```env
PORT=7377
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```
*(Note: If the key is not specified, the app falls back to a simulated interactive **Demo Mode** automatically.)*

### 3. Start Frontend & Backend Concurrently
Run this single command in your terminal:
```bash
npm start
```
This runs both the backend and frontend simultaneously:
- **Backend API Server**: Runs on [http://localhost:7377](http://localhost:7377)
- **Frontend Ionic App**: Serves automatically and opens a browser tab on [http://localhost:8100](http://localhost:8100) (or next available port)

---

## How It Works Under the Hood

### Backend Flow (`backend/server.js`)
1. **API Server**: Serves static history API endpoints (`GET /api/history`, `POST /api/history`, `DELETE /api/history/:id`).
2. **SSE Streaming**: The `/api/chat` route processes the conversation history and Normalizes roles (`user`, `assistant`/`model`) for the selected provider SDK.
3. **Response Buffer**: Streams the response text directly using the `text/event-stream` response headers.

### Frontend Flow (`frontend/src/app/...`)
1. **Streaming Consumer (`chat.service.ts`)**: Uses standard browser `fetch` and reads from `response.body.getReader()`. It decodes the text buffer, parses lines starting with `data: `, and passes chunks to page hooks.
2. **Markdown Compiler (`home.page.ts`)**: Integrates `marked` with `prismjs`. A custom renderer formats code blocks inside header containers, embedding a URI-decoded `Copy` script.
3. **Responsive Menu**: An `ion-menu` acts as a slide-out drawer on small mobile viewports and pins itself as a fixed sidebar panel on desktop monitors.

---

## Building for Mobile (Capacitor)

To compile the frontend and prepare native platform packages:

1. **Build the Web Assets**:
   ```bash
   cd frontend
   npm run build
   ```
2. **Add Your Platforms**:
   ```bash
   npx cap add android
   # or
   npx cap add ios
   ```
3. **Synchronize Code**:
   ```bash
   npx cap sync
   ```
4. **Open in Native IDE (Android Studio or Xcode)**:
   ```bash
   npx cap open android
   # or
   npx cap open ios
   ```
