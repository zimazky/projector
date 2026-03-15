# Projector — Context for AI Assistants

## Project Overview

**Projector** is a web application for planning events (tasks) and resources. It is built with **React**, **TypeScript**, and **MobX** for state management. The application integrates with **Google Drive** for document storage and **Google Calendar** for event synchronization.

**Live Demo:** https://zimazky.github.io/projector/

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend Framework** | React 18 |
| **Language** | TypeScript 5 |
| **State Management** | MobX 6 + mobx-react-lite |
| **Forms** | react-hook-form |
| **Icons** | @iconify/react |
| **Build Tool** | Webpack 5 |
| **Testing** | Jest + jsdom, Karma + Jasmine |
| **Linting** | ESLint 10 + Prettier |
| **CSS** | CSS Modules |

---

## Project Structure (Feature-Sliced Design)

The project follows **Feature-Sliced Design (FSD)** architecture with the following layers:

```
src/
├── 1-app/              # Application layer (entry point, providers, global stores)
│   ├── App/            # Root App component
│   ├── Providers/      # Context providers (e.g., StoreProvider)
│   ├── Stores/         # Store initialization and wiring
│   └── root.ts         # Store exports
├── 3-pages/            # Page-level components
│   ├── Calendar/       # Calendar page
│   ├── DayList/        # Day list page
│   └── Projects/       # Projects page
├── 4-widgets/          # Widgets (complex UI blocks)
├── 5-features/         # User-facing features
│   ├── DriveFileList/  # Google Drive file management
│   ├── EventSearch/    # Event search functionality
│   ├── FileConflictResolver/
│   └── Weather/        # Weather integration
├── 6-entities/         # Business entities
│   ├── Accounts/       # User accounts
│   ├── Document/       # Document entity
│   ├── Events/         # Event entities and models
│   ├── EventsCache/    # Event caching
│   └── Locations/      # Location entities
└── 7-shared/           # Shared code (UI, helpers, hooks, types)
    ├── adapters/
    ├── helpers/
    ├── hooks/
    ├── libs/
    ├── services/
    ├── types/
    └── ui/             # Reusable UI components (Button, Modal, Dialog, etc.)
```

---

## Building and Running

### Prerequisites

- **Node.js** 24.12.0+ (specified in CI)
- **npm** (comes with Node.js)

### Installation

```bash
npm install
```

### Development

```bash
# Start development server with hot reload
npm start
```

### Production Build

```bash
# Build for production (outputs to /dist)
npm run build
```

### Testing

```bash
# Run Jest tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Code Quality

```bash
# Format code with Prettier
npm run format

# Auto-fix ESLint issues
npm run lint

# Check ESLint without fixing
npm run lint-check
```

---

## Environment Variables

The application requires the following environment variables (configured via `.env` or GitHub Secrets):

| Variable | Description |
|----------|-------------|
| `CLIENT_ID` | Google OAuth Client ID for Drive/Calendar API |
| `OPEN_WEATHER_KEY` | OpenWeatherMap API key for weather integration |

---

## Key Architectural Patterns

### State Management

- **MobX** is used for reactive state management
- All stores are centralized and provided via `StoreProvider` context
- Store types include: `mainStore`, `eventsStore`, `projectsStore`, `calendarStore`, `uiStore`, etc.

### Google Integration

- **Google Drive**: Document storage, file picker, conflict resolution
- **Google Calendar**: Event synchronization
- **Google Accounts**: Multi-account support, OAuth authentication

### UI Component Library

The `7-shared/ui` folder contains reusable components:
- Form controls: `TextField`, `Select`, `TextArea`, `DatePicker`, `Time`, `ColorPicker`
- Layout: `Modal`, `Dialog`, `Drawer`, `Tabs`, `List`, `Breadcrumbs`
- Actions: `Button`, `IconButton`, `IconBar`
- Feedback: `Spinner`, `YesNoCancelConfirmation`, `YesCancelConfirmation`

---

## Development Conventions

### Code Style

- **No semicolons** (`semi: false`)
- **Single quotes** for strings
- **Tabs** for indentation (2 spaces)
- **No trailing commas**
- **Max line length**: 120 characters
- **Arrow function parens**: omitted when single parameter

### Code Documentation

- **Comments must be written in Russian** (русский язык)
- Add JSDoc comments for public functions, classes, and complex logic
- Use inline comments to explain non-obvious implementation decisions

### AI Agent Communication

- **Preferred language for user communication: Russian** (русский язык)
- AI assistant should respond to the user in Russian unless explicitly requested otherwise
- Technical artifacts (code, file paths, error messages) remain in their original language

### Documentation Language

- **All documents in `/docs` folder must be written in Russian** (русский язык)
- This includes architectural docs, analysis reports, refactoring plans, and guidelines

### TypeScript

- **Strict mode** enabled
- **JSX**: `react-jsx` (React 17+ transform)
- **Module**: CommonJS
- **Target**: ES2022
- **Path aliases**: `src/*` → `./src/*`

### Git Workflow

- **Default branch**: `master`
- **CI/CD**: GitHub Actions (build + deploy to GitHub Pages on push)

---

## Important Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `webpack.config.cjs` | Webpack build configuration |
| `jest.config.cjs` | Jest test configuration |
| `karma.conf.js` | Karma test runner config |
| `.eslintrc.json` | ESLint rules |
| `.prettierrc` | Prettier formatting rules |
| `index.html` | HTML entry point |
| `src/1-app/root.ts` | Store initialization and exports |
| `src/1-app/index.tsx` | Application entry point |

---

## Documentation

Extensive architectural documentation is available in the `/docs` folder, covering:
- FSD architecture assessment
- Event system design
- Google Drive/Calendar integration
- Store management patterns
- UI/UX recommendations
- Code quality guidelines

---

## Common Tasks

### Adding a New Feature

1. Create feature folder in `5-features/`
2. Implement UI components in `7-shared/ui/` if needed
3. Add entity types to `6-entities/` if needed
4. Wire up stores in `1-app/Stores/`
5. Add page route in `3-pages/` if needed

### Adding a New Store

1. Create store class in appropriate entity folder
2. Initialize in `1-app/Stores/`
3. Export from `1-app/root.ts`
4. Add to `StoreProvider` in `1-app/index.tsx`

### Running Locally with API

Create a `.env` file in the project root:

```env
CLIENT_ID=your_google_client_id
OPEN_WEATHER_KEY=your_openweather_api_key
```

Then run `npm start`.
