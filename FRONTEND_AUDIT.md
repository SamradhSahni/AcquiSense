# AcquiSense Frontend Architecture & UI/UX Audit
**Document Version:** 1.0.0  
**Target Audience:** Principal Frontend Architect, UI/UX Design Architect, Product Engineers  
**Scope:** Complete Client Application (`/client`)  
**Repository:** SamradhSahni/AcquiSense  

---

## 1. Project Overview & Core Domain

### Project Purpose & Niche
**AcquiSense** is an enterprise-grade, AI-orchestrated Forensic Due Diligence and M&A Intelligence Platform designed for Corporate Development teams, Private Equity (PE) sponsors, Venture Capital firms, and Investment Committees (IC). 

In institutional M&A, the preliminary due diligence phase typically requires 4–8 weeks of manual labor conducted by siloed third-party accounting, legal, technical, and regulatory advisory teams. This creates extreme information latency, exorbitant deal expenses, and fragmented cross-domain risk visibility. 

AcquiSense solves this bottleneck by ingesting unstructured virtual data room (VDR) documents (PDFs, DOCX, XLSX spreadsheets, PPTX decks, CSVs, and Markdown) and orchestrating an autonomous fleet of **13 specialized AI agents** across **9 discrete diligence domains**. It detects discrete risks, discovers hidden cross-domain compound liabilities (e.g., how an IP licensing defect in Legal triggers severe EBITDA recalculations in Finance), subjects every finding to 5 automated quality gates, and computes an IC-ready **Go / No-Go verdict** with granular citations in minutes instead of weeks.

### Target Audience & Vibe
* **Primary Personas:**
  * **Private Equity Partners & Investment Committee Members:** Require high-level executive summaries, definitive Go/No-Go recommendations, valuation adjustments, and quantified severity distributions.
  * **Corporate Development VPs & M&A Directors:** Require pipeline management, deal progress telemetry, and risk action tracking.
  * **Forensic Diligence Analysts & Associates:** Require line-item citations, direct source document cross-referencing, semantic document diffing, and AI-assisted interview question generation.
* **Emotional & Visual Tone:**
  * **Institutional Terminal Authority:** A modern synthesis of Bloomberg Terminal / Palantir Gotham / Linear, infused with ultra-refined Swiss typography and dark-mode precision.
  * **High Information Density with Cognitive Clarity:** Complex multi-dimensional data (heatmaps, dependency graphs, findings matrices) must feel intuitive, calm, and trustworthy under high-stakes deal pressure.
  * **Cryptographic & Forensic Trust:** Visual verification badges, SHA-256 report integrity indicators, explicit citation references, and source document quotations that signal unwavering accuracy.

### Core User Flows
1. **Landing & Identity Flow (`/` → `/login` or `/register`):**
   * Visitor explores the platform value proposition, dynamic agent fleet highlights, real-time counters, and 5-stage pipeline mechanics.
   * User logs in or registers an organization and admin credentials. JWT token and user profile are saved in `localStorage`.
2. **Deal Creation & Data Room Ingestion (`/new`):**
   * **Step 0 (Deal Info):** User inputs Deal Name, Target Company, Acquirer, and selects the AI Model Profile (`Economy`: GPT-4o-mini; `Standard`: GPT-4o-mini + GPT-4o synthesis; `Premium`: GPT-4o across all agents). Deal record is created in MongoDB via `POST /api/deals`.
   * **Step 1 (Upload Files):** Drag-and-drop file ingestion via `react-dropzone` with real-time percentage upload bar (`POST /api/upload?dealId=...`).
   * **Step 2 (Launch):** User reviews summary and confirms launch. `POST /api/jobs` triggers the Python FastAPI orchestrator. Client immediately navigates to `/deals/:id?jobId=...&pythonJobId=...`.
3. **Real-time Live Telemetry & Investigation (`/deals/:id`):**
   * Real-time WebSocket connection joins room `job:<pythonJobId>` to stream agent execution states (`queued`, `ingesting`, `analyzing`, `synthesizing`, `quality_check`, `generating_report`, `done`).
   * Dynamic progress banner and live `AgentGrid` display per-domain status, percentage completion, and finding count badges.
   * Auto-poll fallback every 3 seconds ensures resilient state synchronization.
4. **Post-Analysis Verdict & Deep-Dive Review (`/deals/:id` Tabs):**
   * Client performs client-side report hash verification against the stored SHA-256 seal.
   * **Verdict Tab:** Visual Go/No-Go badge, executive summary narrative, and P0–P3 severity distribution grid.
   * **Findings Tab:** Full searchable, filterable table of domain findings with expandable accordion items displaying exact file, page, and quoted evidence.
   * **Risk Heatmap Tab:** 9-domain by 4-severity interactive risk intensity matrix.
   * **Cross-References Tab:** D3 force-directed interactive node graph and compound risk connection cards.
   * **Analyst Questions Tab:** AI-generated management interview questions categorized by domain with linked findings.
   * **Risk Action Center Tab:** Remediation workflow management (Open, Assigned, Remediating, Verified, Closed) with Human-in-the-Loop (HITL) review states (Confirmed, Modified, Rejected).
   * **Document Comparator Tab:** Pairwise semantic diffing between two data room documents with risk trajectory indicators.
5. **Interactive Copilot Dialogue (Floating Action Button Drawer):**
   * Analyst clicks the floating lightning FAB (`#copilot-fab`) to summon `CopilotPanel`.
   * User queries findings across all 9 domains via contextual RAG.
   * Copilot returns streaming cited answers, confidence scores, searched domain pills, and clickable suggested follow-ups.
6. **Pipeline Management (`/dashboard` & `/reports`):**
   * Overview of all active and historical deals with status filter pills, risk score meters, and quick navigation.
   * Report library (`/reports`) displaying archived IC packages and findings metrics.

---

## 2. Frontend Tech Stack & Architecture

### Framework, Build & Routing
* **Runtime & Framework:** React `18.3.1` with `react-dom` `18.3.1`.
* **Build Tool:** Vite `5.3.1` using `@vitejs/plugin-react` `4.3.1`.
* **Routing:** `react-router-dom` `6.23.1` configured in `src/App.jsx` with React Router v7 preparation future flags (`v7_startTransition: true`, `v7_relativeSplatPath: true`).
* **Dev Server & Proxy:** Vite dev server listening on `0.0.0.0:3000` with containerized reverse-proxy routes:
  * `/api` → `http://server:4000`
  * `/health` → `http://server:4000`
  * `/socket.io` (WebSocket) → `http://server:4000`

### Dependencies & Third-Party Libraries
| Package | Version | Usage |
|---|---|---|
| `react` | `^18.3.1` | Core UI engine |
| `react-dom` | `^18.3.1` | DOM renderer |
| `react-router-dom` | `^6.23.1` | Client-side routing & private routes |
| `axios` | `^1.7.2` | REST client with interceptors for JWT injection & 401 handling |
| `socket.io-client` | `^4.7.5` | Live WebSocket progress subscription (`job:<pythonJobId>`) |
| `d3` | `^7.9.0` | Force-directed graph simulation & SVG rendering in CrossRefGraph |
| `recharts` | `^2.12.7` | Installed chart primitives (ready for telemetry extension) |
| `react-dropzone` | `^14.2.3` | Drag-and-drop document upload handler in NewDeal |
| `react-hot-toast` | `^2.4.1` | Toaster alerts for notifications and errors |
| `lucide-react` | `^0.395.0` | SVG icons |

### Directory Structure
```
client/
├── Dockerfile                  # Production container definition
├── index.html                  # HTML entry point (Google Fonts: Inter & JetBrains Mono)
├── nginx.conf                  # Nginx deployment reverse proxy configuration
├── package.json                # Project dependencies and script declarations
├── vite.config.js              # Vite bundler, proxy and env definitions
└── src/
    ├── main.jsx                # React root mount into #root
    ├── App.jsx                 # Global routing, Header Nav, and Status Bar
    ├── App.css                 # Navigation, status indicators, and main layout styles
    ├── index.css               # Global design tokens, typography, utilities, and reset
    ├── services/
    │   ├── api.js              # Axios instance, endpoints (Deals, Uploads, Jobs, Reports, Health, Auth)
    │   ├── auth.js             # Token and user local storage handlers
    │   └── socket.js           # Socket.IO client instance and job room subscription helpers
    ├── pages/
    │   ├── LandingPage/
    │   │   ├── LandingPage.jsx  # Hero, animated stats counter, domains grid, 5-stage pipeline
    │   │   └── LandingPage.css  # Landing page typography, keyframes, floating cards
    │   ├── Login/
    │   │   ├── Login.jsx        # Email/password authentication form
    │   │   └── Login.css        # Login card and form styling
    │   ├── Register/
    │   │   ├── Register.jsx     # Company & admin user registration form
    │   │   └── Register.css     # Registration card styling
    │   ├── Dashboard/
    │   │   ├── Dashboard.jsx    # Deal pipeline view, status filter pills, deal cards
    │   │   └── Dashboard.css    # Dashboard grid and deal card styles
    │   ├── NewDeal/
    │   │   ├── NewDeal.jsx      # 3-step wizard (Deal info, Dropzone upload, Launch confirmation)
    │   │   └── NewDeal.css      # Wizard stepper, profile cards, dropzone, upload progress
    │   ├── DealView/
    │   │   ├── DealView.jsx     # Deal command center, live progress banner, tab switching
    │   │   └── DealView.css     # Deal header, status badges, severity cards, tab styling
    │   └── Reports/
    │       ├── Reports.jsx      # Archive of completed deal audits with executive summaries
    │       └── Reports.css      # Report card list styles
    └── components/
        ├── AgentGrid/
        │   ├── AgentGrid.jsx    # 9-domain agent status cards with progress bars
        │   └── AgentGrid.css    # Agent card pulse dots, shimmer animations, badges
        ├── RiskHeatmap/
        │   ├── RiskHeatmap.jsx  # 9x4 domain-by-severity matrix with dynamic intensity
        │   └── RiskHeatmap.css  # Heatmap grid, cells, hover zoom, and color dots
        ├── FindingsTable/
        │   ├── FindingsTable.jsx # Searchable, filterable findings table with expandable citations
        │   └── FindingsTable.css # Table, row expansion, file citations, quotes, pagination
        ├── GoNoGo/
        │   ├── GoNoGo.jsx       # IC Go/Caution/No-Go verdict card with domain risk bars
        │   └── GoNoGo.css       # Pulsing circular verdict badge, domain score tracks
        ├── CrossRefGraph/
        │   ├── CrossRefGraph.jsx # D3 force-directed graph connecting compound risks across domains
        │   └── CrossRefGraph.css # SVG container, dynamic tooltip, and domain color legend
        ├── RiskActionCenter/
        │   ├── RiskActionCenter.jsx # Workflow remediation tracker & HITL validation panel
        │   └── RiskActionCenter.css # Workflow badges, slide-in action panel, split-screen layout
        ├── DocumentComparator/
        │   ├── DocumentComparator.jsx # Side-by-side semantic document diffing tool
        │   └── DocumentComparator.css # Document select columns, change cards, risk trajectory
        ├── AnalystQuestions/
        │   ├── AnalystQuestions.jsx # AI-generated management interview questions
        │   └── AnalystQuestions.css # Question cards, domain tabs, rationale and look-for boxes
        └── Copilot/
            ├── CopilotPanel.jsx # Sliding drawer conversational RAG copilot with grounded citations
            └── CopilotPanel.css # Glassmorphism panel, message bubbles, citation cards, input
```

---

## 3. Current Design System & Styling Tokens

### Color Palette & Token Definitions
The application uses CSS Custom Properties defined in `src/index.css` under `:root`, complemented by per-component color definitions:

#### Global Surface & Structural Colors (`src/index.css`)
```css
--color-bg-primary: #000000;        /* Deep true black background */
--color-bg-secondary: #0A0A0A;      /* Near-black surface for nav and headers */
--color-bg-surface: #111111;        /* Dark charcoal card & element surface */
--color-bg-elevated: #1A1A1A;       /* Elevated layer for active states and popovers */
--color-bg-muted: rgba(255, 255, 255, 0.03); /* Subtle borders and track backgrounds */
```

#### Monochromatic Brand Accents (`src/index.css`)
```css
--color-accent: #E5E5E5;            /* Platinum / Silver primary accent */
--color-accent-hover: #F0F0F0;      /* Elevated platinum highlight */
--color-accent-muted: rgba(229, 229, 229, 0.1);
--color-accent-dim: rgba(229, 229, 229, 0.05);
```

#### Typography Contrast Tokens (`src/index.css`)
```css
--color-text-primary: #FFFFFF;      /* High-emphasis white */
--color-text-secondary: #E0E0E0;    /* Medium-emphasis off-white */
--color-text-tertiary: #B0B0B0;     /* Low-emphasis muted white */
--color-text-muted: #808080;        /* Inactive / disabled medium gray */
```

#### Risk Severity Palette (Used across DealView, Heatmap, Findings, Copilot)
* **P0 — Critical / Fatal Risk:** `#ef4444` (`rgba(239, 68, 68, 0.15)` muted bg)
* **P1 — High Severity:** `#f97316` (`rgba(249, 115, 22, 0.15)` muted bg)
* **P2 — Medium Severity / Caution:** `#eab308` (`rgba(234, 179, 8, 0.15)` muted bg)
* **P3 — Low Severity / Clean / Go:** `#22c55e` (`rgba(34, 197, 94, 0.15)` muted bg)

#### Diligence Domain Color Palette (D3 Graph, Copilot, Action Center, Analyst Questions)
* ⚖️ **Legal:** `#818cf8` / `#8b5cf6` (Indigo/Purple)
* 💰 **Finance:** `#34d399` / `#6366f1` (Emerald/Indigo)
* 📊 **Commercial:** `#60a5fa` / `#06b6d4` (Sky/Cyan)
* 💻 **Technology:** `#a78bfa` / `#3b82f6` (Violet/Blue)
* 🔒 **Cybersecurity:** `#f87171` / `#ef4444` (Rose/Red)
* 👥 **Human Resources:** `#fb923c` / `#ec4899` (Orange/Pink)
* 📋 **Tax:** `#facc15` / `#f59e0b` (Amber/Yellow)
* 🏛️ **Regulatory:** `#4ade80` / `#14b8a6` (Green/Teal)
* 🌱 **ESG:** `#2dd4bf` / `#22c55e` (Teal/Emerald)

### Typography System
* **Headings & Badges:** `'Space Grotesk var', 'Space Grotesk', system-ui, sans-serif` (`--font-display`).
* **Body, Controls & Forms:** `'Inter var', 'Inter', system-ui, -apple-system, sans-serif` (`--font-sans`).
* **Code, Hashes, Citations & Numerical Data:** `'JetBrains Mono var', 'JetBrains Mono', 'Fira Code', monospace` (`--font-mono`).
* **Scale:**
  * Hero Display: `clamp(2.25rem, 6vw, 3.5rem)` with `-0.02em` tracking.
  * Section Headers: `clamp(1.75rem, 4vw, 2.5rem)`.
  * Card Titles & Modals: `1.125rem` to `1.5rem` (`font-weight: 700`).
  * Body Text: `1rem` (16px), `line-height: 1.65`.
  * Secondary Meta / Labels: `0.875rem` (14px) and `0.75rem` (12px).
  * Micro Badges & Tags: `9px` – `11px` (`font-weight: 700`, uppercase, tabular figures).

### Layout, Elevation & Spacing
* **Spacing Scale:** Modular progression from `--space-0` (0px) through `--space-32` (128px) with core 4px/8px increments.
* **Layout Geometry:**
  * Header Height: `72px` (`--header-height`).
  * Max Content Width: `1600px` (`--max-content-width`).
  * Grid System: Responsive CSS Grids (`.grid-2`, `.grid-3`, `.grid-4`, `.grid-5`) collapsing from 1400px, 1024px, and 640px.
* **Border Radii:** Granular curve scale (`--radius-2` to `--radius-32`, with pills at `--radius-full: 9999px`).
* **Shadows & Glassmorphism:**
  * Shadows range from micro elevation `--shadow-1` (`0 1px 2px rgba(0,0,0,0.05)`) to high-elevation `--shadow-8` (`0 12px 32px rgba(0,0,0,0.15)`).
  * Ambient glow effects: `--shadow-accent: 0 0 12px rgba(229, 229, 229, 0.25)`.
  * Glass blur: `backdrop-filter: blur(20px)` on sticky headers and copilot overlay.

### Theme Support
* **Current Implementation:** Pure dark-mode baseline. There is no active light mode or dynamic theme toggle (`body` defaults to `--color-bg-primary: #000000`).

---

## 4. Exhaustive Page-by-Page & Route Breakdown

### 1. Landing Page (`/`)
* **File Path:** `src/pages/LandingPage/LandingPage.jsx` (Styles: `src/pages/LandingPage/LandingPage.css`)
* **Route Path:** `/`
* **Purpose:** Public front door to educate prospective M&A practitioners, showcase platform speed and coverage, and funnel users into running their first analysis.
* **Layout & Visual Structure:**
  * Background subtle animated repeating diagonal line grid (`bg-pattern-shift`).
  * **Hero Section:** Split 2-column layout (headline, badge, CTA buttons on the left; staggered vertical stack of floating agent cards on the right).
  * **Stats Bar:** 4-column container with live counting numbers (`useCounter` hook from 0 to target).
  * **Domain Grid Section:** 9-card interactive grid representing each specialist agent with hover shine keyframes.
  * **How It Works Section:** 5-step vertical connected timeline with numbered step markers (`01` through `05`) and vertical connecting lines.
  * **Bottom CTA Card:** Ambient glowing box with a launch button.
* **Interactive & Dynamic Elements:**
  * Number increment animation (`StatCounter` using custom step interval).
  * Hover translation and pseudo-element shine sweeps on agent cards and domain cards.
  * "Start New Analysis" and "View Dashboard" links.
* **Data & Props Dependencies:**
  * Static constant collections `DOMAINS` and `STATS`.
  * No external API calls on mount.

### 2. Login Page (`/login`)
* **File Path:** `src/pages/Login/Login.jsx` (Styles: `src/pages/Login/Login.css`)
* **Route Path:** `/login`
* **Purpose:** Authenticate registered users to grant access to private deal rooms and dashboards.
* **Layout & Visual Structure:**
  * Full-screen centered card layout on dark background.
  * Card with centered brand title, form group inputs for Email and Password, submission button, and footer link to register.
* **Interactive & Dynamic Elements:**
  * Form submission with loading button state ("Signing in...").
  * Inline error alert display on 401 or network rejection.
* **Data & Props Dependencies:**
  * Local state: `email`, `password`, `loading`, `error`.
  * Service: `login({ email, password })` from `src/services/api.js`.
  * Auth: `setToken(token)` and `setUser(user)` from `src/services/auth.js`.
  * Redirects to `/dashboard` upon success.

### 3. Register Page (`/register`)
* **File Path:** `src/pages/Register/Register.jsx` (Styles: `src/pages/Register/Register.css`)
* **Route Path:** `/register`
* **Purpose:** Onboard new enterprise accounts with company metadata and initial admin credentials.
* **Layout & Visual Structure:**
  * Centered card container (max-width: 500px) with explanatory subtitle.
  * Form inputs for Company Name, Admin Full Name, Admin Email, and Password (min length 8).
  * Action button and footer link to `/login`.
* **Interactive & Dynamic Elements:**
  * Form validation, error messaging banner, and green success banner with 1200ms timed auto-redirect.
* **Data & Props Dependencies:**
  * Local state: `companyName`, `adminEmail`, `adminPassword`, `adminName`, `loading`, `error`, `success`.
  * Service: `register(...)` from `src/services/api.js`.

### 4. Deal Dashboard (`/dashboard`)
* **File Path:** `src/pages/Dashboard/Dashboard.jsx` (Styles: `src/pages/Dashboard/Dashboard.css`)
* **Route Path:** `/dashboard` (Guarded by `PrivateRoute`)
* **Purpose:** Main hub for M&A deal teams to monitor their active portfolio, check analysis statuses, and jump into individual deal rooms.
* **Layout & Visual Structure:**
  * **Header:** Page title, deal count subtitle, and "+ New Deal" call-to-action button.
  * **Filter Bar:** Horizontal scrollable/wrap tab row (`All`, `Queued`, `Analyzing`, `Done`, `Draft`, `Failed`) with badge counters.
  * **Deal Card Grid:** Responsive auto-fill grid (`minmax(300px, 1fr)`).
  * **Deal Card:** Displays Deal Name, Target Company, Go/No-Go badge pill, status indicator, finding count, file count, overall risk score meter (0–10 with colored fill bar), and formatted date.
  * **Empty State:** Centered graphic, descriptive prompt, and button to start analysis.
* **Interactive & Dynamic Elements:**
  * Instant filter tab switching without page reload.
  * Animated staggered entrance for cards (`deal-card-fade`).
  * Skeleton pulse loading indicator while `getDeals()` resolves.
* **Data & Props Dependencies:**
  * Service: `getDeals()` from `src/services/api.js`.
  * Local state: `deals`, `loading`, `filter`.
  * Route links to `/deals/${deal._id}` and `/new`.

### 5. New Deal Creation Wizard (`/new`)
* **File Path:** `src/pages/NewDeal/NewDeal.jsx` (Styles: `src/pages/NewDeal/NewDeal.css`)
* **Route Path:** `/new` (Guarded by `PrivateRoute`)
* **Purpose:** 3-stage guided workflow for initializing a deal, uploading confidential VDR documents, and selecting AI reasoning depth.
* **Layout & Visual Structure:**
  * **Wizard Stepper:** Numbered circle indicators (`Deal Info` → `Upload Files` → `Launch`) connected by animated progress lines.
  * **Step 0 (Deal Info):** Form fields for Deal Name (required), Target Company, Acquirer, and Model Profile selection cards (`Economy`, `Standard`, `Premium`).
  * **Step 1 (Upload Files):** Drag-and-drop dropzone border with mime-type restrictions and 50MB per-file limit; scrollable list of selected files with remove buttons; animated upload progress bar.
  * **Step 2 (Launch):** Large rocket graphic, summary table (Deal Name, Target, File Count, Model), explanatory copy, and "Launch Analysis" button.
* **Interactive & Dynamic Elements:**
  * `react-dropzone` dragover highlight effects.
  * File list removal (`×`).
  * Upload percentage progress calculation from Axios `onUploadProgress`.
  * Launch button with loading spinner and programmatic navigation.
* **Data & Props Dependencies:**
  * Local state: `step`, `deal` object, `files`, `dealId`, `savedNames`, `uploading`, `uploadPct`, `launching`.
  * Services: `createDeal(deal)`, `uploadFiles(files, dealId, onProgress)`, `startJob(dealId, fileNames, modelProfile)`.
  * Router: `useNavigate()` directing to `/deals/:dealId?jobId=...&pythonJobId=...`.

### 6. Deal Room Command Center (`/deals/:id`)
* **File Path:** `src/pages/DealView/DealView.jsx` (Styles: `src/pages/DealView/DealView.css`)
* **Route Path:** `/deals/:id` (Guarded by `PrivateRoute`)
* **Purpose:** The core forensic cockpit of the entire platform. Displays live streaming analysis during execution and comprehensive analytical reports upon completion.
* **Layout & Visual Structure:**
  * **Header:** Breadcrumb navigation, Deal Title, Target/Acquirer subtitle, SHA-256 Report Integrity badge (`🔏 Report Verified` vs `⚠️ Integrity Check Failed`), Go/No-Go verdict pill, and pulse dot status indicator.
  * **Progress Banner (Active during analysis):** Live banner showing current phase label, active agent domain badges, and glowing indeterminate scan bar.
  * **Tab Navigation Bar:** 8 switchable tabs:
    1. `⚖️ Verdict`
    2. `🔍 Findings`
    3. `📊 Risk Heatmap`
    4. `🔗 Cross-References`
    5. `📋 Questions`
    6. `⚡ Action Center`
    7. `📑 Compare Docs`
    8. `🤖 Agent Grid`
  * **Active Tab Content Container:** Mounts the corresponding sub-component.
  * **Floating Copilot FAB:** Persistent rounded button (`#copilot-fab`) anchored at bottom-right when analysis is complete.
  * **Copilot Slide-in Drawer:** Glassmorphic overlay drawer mounting `CopilotPanel`.
* **Interactive & Dynamic Elements:**
  * Real-time WebSocket event ingestion via `subscribeToJob(pythonJobId, handler)` updating agent progress pills and job status.
  * 3000ms polling fallback until analysis finishes.
  * Client-side SHA-256 integrity hash verification comparing `report.report_hash` with job metadata.
  * Tab click tracking (`userInteractedRef`) preventing auto-switch overrides.
* **Data & Props Dependencies:**
  * URL param: `id` (deal ID).
  * Services: `getDeal(id)`, `getJobResults(jobId)`.
  * WebSocket: `subscribeToJob(pythonJobId, callback)` from `src/services/socket.js`.
  * Local state: `deal`, `job`, `report`, `agentProgress`, `loading`, `activeTab`, `copilotOpen`, `reportIntegrity`.

### 7. Reports Library (`/reports`)
* **File Path:** `src/pages/Reports/Reports.jsx` (Styles: `src/pages/Reports/Reports.css`)
* **Route Path:** `/reports` (Guarded by `PrivateRoute`)
* **Purpose:** Archival repository of completed due diligence IC reports for institutional memory and audit review.
* **Layout & Visual Structure:**
  * Header with title and subtitle.
  * Vertical list of report cards.
  * Report card: Deal name, target company, truncated executive summary (160 chars), creation timestamp, total findings, Go/No-Go verdict pill, mini severity count badges, and "View Report →" direct link.
  * Empty state with shortcut button to launch new analysis.
* **Interactive & Dynamic Elements:**
  * Card hover translateX animation and border color shift.
* **Data & Props Dependencies:**
  * Service: `getReports()` from `src/services/api.js`.
  * Local state: `reports`, `loading`.

### 8. Not Found / 404 Route (`*`)
* **File Path:** Inline in `src/App.jsx`
* **Route Path:** `*` (Catch-all)
* **Purpose:** Graceful fallback for non-existent URLs with link returning to root.
* **Layout:** Centered 64px font graphic with return link.

---

## 5. Reusable Components Inventory

### 1. Header Navigation (`Nav`)
* **File Path:** `src/App.jsx` (Styles: `src/App.css`)
* **Where It Is Used:** Global header rendered across all routes.
* **Current Styling & Interactive States:**
  * Sticky `72px` height bar with `backdrop-filter: blur(20px)`, top 2px silver border.
  * Logo with search icon and high-contrast "AI" pill badge.
  * Nav links (`Dashboard`, `New Deal`, `Reports`) with active state background pills (`.nav__link--active`).
  * Right status section: Database (`DB`) and AI engine (`AI`) health status dots; external link to Grafana observability (`http://localhost:3001`).
  * Authentication controls: Displays User icon + "Logout" when authenticated; "Login" / "Register" when guest.
* **Props & State Contract:** Self-contained; pulls route context from `useLocation()`, auth from `getToken()`, and health from `getHealth()` on a 30s polling cycle.

### 2. Status Dot (`StatusDot`)
* **File Path:** `src/App.jsx` (Styles: `src/App.css`)
* **Where It Is Used:** Inside `Nav` for database, AI engine, and API health monitoring.
* **Current Styling:** Flex pill containing an 8px circular indicator with glow boxShadow (`0 0 6px ...`) and text label.
* **Props Contract:**
  * `ok` (`boolean`): If true, renders green/success; if false, red/down.
  * `label` (`string`): Service name (e.g., `'DB'`, `'AI'`, `'API'`).

### 3. Agent Grid (`AgentGrid`)
* **File Path:** `src/components/AgentGrid/AgentGrid.jsx` (Styles: `src/components/AgentGrid/AgentGrid.css`)
* **Where It Is Used:** DealView "Agent Grid" tab, and as live progress visualizer during active deal analysis.
* **Current Styling & Interactive States:**
  * 3-column responsive CSS grid (`repeat(3, 1fr)`).
  * 9 discrete cards: Legal, Finance, Commercial, Tech, Cyber, HR, Tax, Regulatory, ESG.
  * State variants: `.agent-card--idle`, `.agent-card--running` (active blue glow and shimmer bar), `.agent-card--done` (green accent line), `.agent-card--failed`.
  * Animated pulsing dot (`.pulse-dot`) during execution.
  * Findings count badge (`.agent-card__badge`) in high-contrast orange.
* **Props Contract:**
  * `agentProgress`: Object keyed by domain: `{ [domainKey]: { domain, status, pct, findingsCount, error } }`.

### 4. Risk Heatmap (`RiskHeatmap`)
* **File Path:** `src/components/RiskHeatmap/RiskHeatmap.jsx` (Styles: `src/components/RiskHeatmap/RiskHeatmap.css`)
* **Where It Is Used:** DealView "Risk Heatmap" tab.
* **Current Styling & Interactive States:**
  * Custom CSS grid: 100px domain label column + 4 equal severity columns (`P0`, `P1`, `P2`, `P3`).
  * Dynamic alpha shading: Background opacity scales from 0.15 to 0.85 based on finding density relative to `maxCount`.
  * Interactive hover zoom: `transform: scale(1.05)` with elevated z-index and shadow on individual data cells.
  * Legend bar at bottom with colored severity dots.
* **Props Contract:**
  * `domainFindings`: Dictionary of domain finding arrays `{ [domain]: { findings: [...], risk_score: number } }`.

### 5. Findings Table (`FindingsTable`)
* **File Path:** `src/components/FindingsTable/FindingsTable.jsx` (Styles: `src/components/FindingsTable/FindingsTable.css`)
* **Where It Is Used:** DealView "Findings" tab.
* **Current Styling & Interactive States:**
  * Top filter toolbar: Text search input, domain dropdown selector, severity dropdown selector, and finding counter.
  * Tabular display with Severity badge, Domain, Finding Title, and Citation count pill.
  * Expandable accordion rows on click: Reveals Description, Evidence & Analysis narrative, Citation cards (file name, page number, italicized quoted blockquote), and tag chips.
  * Pagination footer with Prev / Next controls (10 items per page).
* **Props Contract:**
  * `domainFindings`: Dictionary of domain results containing arrays of finding objects.

### 6. Go / No-Go Verdict Card (`GoNoGoVerdict`)
* **File Path:** `src/components/GoNoGo/GoNoGo.jsx` (Styles: `src/components/GoNoGo/GoNoGo.css`)
* **Where It Is Used:** DealView "Verdict" tab.
* **Current Styling & Interactive States:**
  * Outer card with dynamic CSS custom property glow: `--gng-color` and `--gng-glow` (`#22c55e` for GO, `#eab308` for CAUTION, `#ef4444` for NO-GO).
  * 72px circular icon badge with pulsating ambient shadow keyframe (`gng-pulse`).
  * Executive Summary narrative section with uppercase header.
  * Domain risk score meters: Ranked vertical list of domain progress bars with numeric scores (0.0 to 10.0) color-graded by risk threshold.
* **Props Contract:**
  * `verdict` (`'GO' | 'CAUTION' | 'NO-GO'`): Overall deal verdict.
  * `executiveSummary` (`string`): Comprehensive synthesis narrative.
  * `domainScores` (`{ [domain]: number }`): Numerical risk scores.

### 7. Cross-Reference Graph (`CrossRefGraph`)
* **File Path:** `src/components/CrossRefGraph/CrossRefGraph.jsx` (Styles: `src/components/CrossRefGraph/CrossRefGraph.css`)
* **Where It Is Used:** DealView "Cross-References" tab.
* **Current Styling & Interactive States:**
  * Interactive D3-rendered SVG canvas (`W x 400px`).
  * Force simulation physics: link distance (120px), charge repulsion (-300), center pull, and collision avoidance (30px).
  * Draggable circular nodes colored by domain with severity text centers and colored outer stroke rings.
  * SVG arrow marker definitions indicating directed compound risk relationships.
  * Custom absolute-positioned HTML tooltip on node hover.
  * Domain color legend below canvas.
* **Props Contract:**
  * `crossReferences`: Array of cross-reference items (`{ id, finding1_id, finding2_id, combined_severity, narrative, domains }`).
  * `domainFindings`: Dictionary of domain findings used to look up node titles and domains.

### 8. Risk Action Center (`RiskActionCenter`)
* **File Path:** `src/components/RiskActionCenter/RiskActionCenter.jsx` (Styles: `src/components/RiskActionCenter/RiskActionCenter.css`)
* **Where It Is Used:** DealView "Action Center" tab.
* **Current Styling & Interactive States:**
  * Split-screen layout: Interactive finding list on the left, sticky sliding action panel on the right.
  * Top summary cards for workflow states (`Open`, `Assigned`, `Remediating`, `Verified`, `Closed`) and review states (`Needs Review`).
  * Multi-dimensional filter toolbar (Domain, Severity, Workflow State, Review Status).
  * Action panel allows: Assigning finding to email, setting due date, appending conditions/dependencies, marking state transitions, or performing HITL reviews (Confirm, Modify title/desc/severity, or Reject with reason).
  * Role-based permission checks via `hasPermission(user, ...)`.
* **Props Contract:**
  * `dealId` (`string`): ID of current deal.
  * `jobId` (`string`): Active analysis job ID.
  * `report` (`object`): Full generated report object.

### 9. Document Comparator (`DocumentComparator`)
* **File Path:** `src/components/DocumentComparator/DocumentComparator.jsx` (Styles: `src/components/DocumentComparator/DocumentComparator.css`)
* **Where It Is Used:** DealView "Compare Docs" tab.
* **Current Styling & Interactive States:**
  * Pairwise document selector: Baseline (Doc A) vs Comparison (Doc B) dropdowns with optional custom labeling inputs.
  * Gradient action button ("⚡ Compare Documents") with loading spinner.
  * Results dashboard: Stat counters for total changes, changed count, new clauses, and removed sections.
  * Risk direction badge (`↗ Deteriorating`, `↘ Improving`, `→ Stable`).
  * Side-by-side executive document summaries with color-coded top borders.
  * Expandable change cards (`ChangeCard`) detailing baseline text, comparison text, and quantified business impact.
* **Props Contract:**
  * `jobId` (`string`): Python job identifier.
  * `dealFiles` (`Array<{ savedName, originalName }>`): Uploaded files in data room.

### 10. Analyst Interview Questions (`AnalystQuestions`)
* **File Path:** `src/components/AnalystQuestions/AnalystQuestions.jsx` (Styles: `src/components/AnalystQuestions/AnalystQuestions.css`)
* **Where It Is Used:** DealView "Questions" tab.
* **Current Styling & Interactive States:**
  * Header with total question counter and domain coverage count.
  * Domain filter pill tabs with per-domain item counters.
  * Question cards categorized by severity accent border (P0–P3).
  * Expandable accordion reveals: Rationale breakdown, "What to look for in the answer" guidance box, and linked finding ID pills.
  * Empty state with on-demand "Generate Questions" trigger button.
* **Props Contract:**
  * `jobId` (`string`): Python job ID used to fetch questions via `GET /api/python/results/${jobId}/questions`.

### 11. Conversational Deal Copilot (`CopilotPanel`)
* **File Path:** `src/components/Copilot/CopilotPanel.jsx` (Styles: `src/components/Copilot/CopilotPanel.css`)
* **Where It Is Used:** DealView floating drawer (triggered via `#copilot-fab`).
* **Current Styling & Interactive States:**
  * Full-height slide-in right drawer (width: 520px, max 100vw) with dark glassmorphic gradient and ambient border glow.
  * Welcome screen with quick-prompt chips ("Why is this deal high risk?", "Show all P0/P1 findings", etc.).
  * Chat stream with distinct user bubbles (indigo gradient) and assistant bubbles (frosted translucent charcoal).
  * Confidence score badges (`high`, `medium`, `low`).
  * Grounded source citation cards with expandable file paths, page numbers, and italicized blockquotes.
  * Interactive follow-up suggestion chips generated dynamically by LLM.
  * Expanding text area with character counter (max 600) and keyboard shortcuts (Enter to send, Shift+Enter for new line).
* **Props Contract:**
  * `dealId` (`string`): Deal identifier.
  * `jobId` (`string`): Python job ID for RAG context.
  * `onClose` (`() => void`): Dismiss handler for drawer overlay and close button.

---

## 6. Visual Gaps & Redesign Opportunities

To elevate AcquiSense into an ultra-premium, world-class interface that rivals Linear, Vercel, and Stripe, the following architectural and visual gaps must be addressed in the redesign:

### 1. Design Token Inconsistencies & Fragmented Palettes
* **Color System Disconnect:** 
  * `src/index.css` defines a strict, monochromatic platinum/silver palette (`--color-accent: #E5E5E5`), whereas newer feature components (`CopilotPanel`, `RiskActionCenter`, `DocumentComparator`, `AnalystQuestions`) import Google Fonts directly and introduce an uncoordinated indigo/violet palette (`#6366f1`, `#8b5cf6`, `#7c3aed`).
  * Several components reference CSS variables that are never declared in `src/index.css`:
    * `var(--color-p0)` through `var(--color-p3)` (referenced in `App.jsx`, `Dashboard.jsx`, and `Reports.jsx`).
    * `var(--color-bg)` and `var(--color-bg-border)` (referenced in `Login.css`, `Register.css`, `Reports.css`, and `FindingsTable.css`).
    * These fallback silently to transparent or browser defaults, causing broken border lines and inconsistent badge backgrounds.
* **Opportunity:** Establish a single, authoritative Design System token hierarchy with semantic tokens (e.g., `--surface-base`, `--surface-raised`, `--surface-overlay`, `--brand-primary`, `--brand-glow`, `--risk-p0` to `--risk-p3`) shared uniformly across all pages.

### 2. Typography Hierarchy & Contrast Deficits
* **Inconsistent Font Loading:** `index.html` loads Inter and JetBrains Mono, `index.css` references Space Grotesk, while individual CSS files (`RiskActionCenter.css`, `AnalystQuestions.css`, `CopilotPanel.css`) make redundant `@import` network calls to Google Fonts for Inter.
* **Low Contrast Meta Text:** In several places (`.nav__link`, `.deal-card__date`, `.findings-table__expand-icon`, `.dc-subtitle`), colors like `#475569` or `var(--color-text-muted)` fall below WCAG AAA contrast guidelines on `#000000` backgrounds.
* **Opportunity:** Centralize typography in `index.html` or a font module, standardize on a high-contrast tabular font for financial numbers, and raise contrast on tertiary and muted labels to ensure readability during critical due diligence reviews.

### 3. Navigation & Shell Polish
* **Hardcoded External URLs:** The Grafana monitoring link in `Nav` points to `http://localhost:3001`, whereas the Docker compose stack maps Grafana to port `3200`.
* **Missing Navigation States:** The top navbar lacks mobile responsiveness (collapses awkwardly on small screens), lacks a user profile dropdown/avatar modal, and does not show active deal context when navigated deep into `/deals/:id`.
* **Opportunity:** Build a sleek, collapsible sidebar or compact command ribbon with quick breadcrumbs, command palette (`Cmd + K`) trigger, dynamic environment indicators, and unified user menu.

### 4. Layout Transitions & Animation Choreography
* **Static Tab Swapping:** Switching tabs in `DealView.jsx` causes an instantaneous, jarring layout shift. There are no smooth exit/enter transition animations, staggered mount states, or preserved scroll positions.
* **Basic CSS Keyframes vs Physics-Based Motion:** Animations currently rely on disconnected CSS keyframes (`fade-up`, `deal-card-fade`, `pulse-glow`) without unified easing curves or spring physics.
* **Opportunity:** Introduce physics-based micro-interactions (e.g. via modern CSS view transitions or motion primitives), smooth tab slide transitions, polished shimmer skeletons for loading states, and card hover physics with directional glow tracking.

### 5. Table & Data Density Modernization
* **Findings Table Presentation:** `FindingsTable` uses standard HTML `<table>` elements with basic borders. The expand/collapse accordion has minimal visual feedback, and pagination is a primitive numeric counter with text buttons.
* **Opportunity:** Redesign `FindingsTable` into a high-density, high-contrast forensic inspection grid with sticky column headers, virtual scrolling for large document rooms (1,000+ findings), inline severity filter pills, quick-preview citation tooltips, and one-click copyable citations.

### 6. Empty States & Error Resilience
* **Generic Emojis:** Many components use raw Unicode emojis (`🔍`, `🤖`, `📁`, `🚀`, `⚡`, `⚖️`) for key iconography. While functional, they render inconsistently across Windows, macOS, and Linux browsers and detract from an ultra-institutional aesthetic.
* **Opportunity:** Replace all raw unicode emojis with curated SVG icons (such as high-contrast Lucide icons or custom SVG duotone icons) with dedicated accent glow backdrops.

### 7. Form Controls & Dropzone Experience
* **Form Inconsistencies:** Inputs across Login, Register, NewDeal, and ActionCenter have disparate padding, border-radius, and focus rings. 
* **Dropzone Polish:** The file upload dropzone in `NewDeal` lacks individual file upload progress meters, file type icon differentiation (e.g., distinguishing PDF from XLSX), and upload cancel triggers.
* **Opportunity:** Standardize all form inputs, switches, selects, and dropzones with a cohesive glassmorphic styling, explicit validation states, and rich drag-and-drop feedback.

---

## 7. Complete File-to-Route Mapping Reference

| Route Path | Route Type | Page Component | Primary Stylesheet | Key Subcomponents Rendered |
|---|---|---|---|---|
| `/` | Public | `LandingPage` (`src/pages/LandingPage/LandingPage.jsx`) | `LandingPage.css` | `StatCounter`, `DOMAINS` cards, timeline |
| `/login` | Public | `Login` (`src/pages/Login/Login.jsx`) | `Login.css` | Auth form, submit button |
| `/register` | Public | `Register` (`src/pages/Register/Register.jsx`) | `Register.css` | Registration form, auto-redirect banner |
| `/dashboard` | Protected | `Dashboard` (`src/pages/Dashboard/Dashboard.jsx`) | `Dashboard.css` | `DealCard`, Filter tabs, Empty state |
| `/new` | Protected | `NewDeal` (`src/pages/NewDeal/NewDeal.jsx`) | `NewDeal.css` | `StepIndicator`, Dropzone, Profile cards |
| `/deals/:id` | Protected | `DealView` (`src/pages/DealView/DealView.jsx`) | `DealView.css` | `GoNoGoVerdict`, `FindingsTable`, `RiskHeatmap`, `CrossRefGraph`, `AnalystQuestions`, `RiskActionCenter`, `DocumentComparator`, `AgentGrid`, `CopilotPanel` |
| `/reports` | Protected | `Reports` (`src/pages/Reports/Reports.jsx`) | `Reports.css` | `report-card` list, verdict badges |
| `*` | Fallback | Inline Catch-all (`src/App.jsx`) | `App.css` | 404 message, home redirect link |

---
*Audit compiled autonomously by Principal Frontend Architect & UI/UX Auditor.*
