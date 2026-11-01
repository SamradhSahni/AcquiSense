# AcquiSense Ultra-Premium Frontend Redesign Specification (`PREMIUM_FRONTEND_DESIGN.md`)
**Version:** 2.0.0 ("Obsidian Sovereign" Edition)  
**Target Codebase:** `/client` (React 18.3.1 + Vite 5.3.1)  
**Aesthetic Direction:** Palantir Foundry × Linear × Bloomberg Institutional Terminal  
**Design Paradigm:** Multi-Layered Refractive Glassmorphism, Specular Micro-Borders, Physics-Based Choreography & High-Contrast Forensic Telemetry  

---

## 1. Architectural Summary: Add, Edit & Delete Manifest

To transform AcquiSense from a fragmented dark baseline into a cohesive, institutional-grade M&A intelligence cockpit, execute the following structural operations across `/client` without altering any API service contracts (`src/services/api.js`, `src/services/auth.js`, `src/services/socket.js`):

### 🗑️ DELETE (Legacy Debt & Visual Anti-Patterns)
1. **Delete Redundant `@import` Font Calls:** Remove all standalone Google Fonts `@import` statements inside `RiskActionCenter.css`, `AnalystQuestions.css`, `CopilotPanel.css`, and `DocumentComparator.css`. Centralize all font loading in `index.html`.
2. **Delete Raw Unicode Emojis Across All JSX Files:** Strip out every raw OS-dependent emoji (`🔍`, `🤖`, `📁`, `🚀`, `⚡`, `⚖️`, `💰`, `📊`, `💻`, `🔒`, `👥`, `📋`, `🏛️`, `🌱`, `🔏`, `⚠️`) in `LandingPage.jsx`, `DealView.jsx`, `NewDeal.jsx`, `AgentGrid.jsx`, `CopilotPanel.jsx`, and `DocumentComparator.jsx`. Replace 1-to-1 with `lucide-react` vector icons inside glowing glassmorphic icon wells.
3. **Delete Uncoordinated Hardcoded Hex Values:** Purge ad-hoc `#475569`, `#6366f1`, `#8b5cf6`, and `#111111` overrides scattered across component stylesheets in favor of semantic CSS custom properties in `src/index.css`.
4. **Delete Hardcoded Port `3001` Reference:** Replace the broken `http://localhost:3001` Grafana link in `src/App.jsx` with `import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3200'` to match the Docker Compose observability mapping.

### ➕ ADD (New Dependencies & Dynamic Primitives)
1. **Install Motion & Command Palette Packages:**
   * Run `npm install motion cmdk clsx` in `/client` (using `motion/react` for hardware-accelerated spring transitions, `AnimatePresence` exit animations, and `layoutId` shared tab indicators).
2. **Add Global `Cmd + K` Forensic Command Palette (`src/components/CommandPalette/CommandPalette.jsx` & `.css`):**
   * Accessible from anywhere via `Cmd+K` / `Ctrl+K` or the top navbar trigger.
   * Allows instant jumping to active deals, switching `DealView` tabs (`Verdict`, `Findings`, `Risk Heatmap`, `Cross-References`, `Action Center`), triggering `CopilotPanel`, or starting a `+ New Deal`.
3. **Add Interactive Cursor Spotlight Tracking:**
   * Add a lightweight CSS custom property updater (`--mouse-x`, `--mouse-y`) on cards (`.glass-card--interactive`) so hovering over Deal Cards, Agent Cards, and Domain Cards illuminates a radial specular border glow that follows the cursor.

### ✏️ EDIT (Global Token Unification & Component Overhaul)
1. **Repair Broken CSS Variables:** Define `--color-p0` through `--color-p3`, `--color-bg`, and `--color-bg-border` as aliases in `src/index.css` so no existing style rule ever falls back to transparent.
2. **Upgrade All 7 Pages & 11 Components:** Apply the new **Obsidian Sovereign** color palette, refractive glassmorphic surfaces, WCAG AAA contrast typography, and smooth layout animations detailed file-by-file in Sections 4 and 5.

---

## 2. The "Obsidian Sovereign" Color System & Glassmorphism Tokens

Replace the token block in `src/index.css` with this unified, high-contrast system. It bridges deep obsidian surfaces with **Champagne Gold** (institutional authority), **Electric Cobalt/Cyan** (autonomous AI telemetry), and **Laser-Calibrated Forensic Severity Tokens**.

### Complete `src/index.css` Root Token Specification

```css
:root {
  /* =========================================================================
     1. OBSIDIAN CANVAS & ELEVATION HIERARCHY (Depth-Layered Dark Surfaces)
     ========================================================================= */
  --bg-canvas: #030508;                     /* Abyssal obsidian base canvas */
  --bg-obsidian: #070A10;                   /* Secondary structural shell / nav */
  --bg-surface-1: #0B101B;                  /* Base card & panel surface */
  --bg-surface-2: #111827;                  /* Raised interactive surface / hover */
  --bg-surface-3: #1A2336;                  /* Floating popovers, dropdowns & tooltips */

  /* Refractive Glassmorphism Layers */
  --glass-surface-thin: rgba(11, 16, 27, 0.55);
  --glass-surface-medium: rgba(14, 20, 34, 0.72);
  --glass-surface-heavy: rgba(9, 13, 22, 0.88);
  --glass-surface-elevated: rgba(23, 32, 53, 0.65);

  /* Backdrop Blur & Saturation Filters */
  --blur-sm: blur(10px) saturate(150%);
  --blur-md: blur(20px) saturate(180%);
  --blur-lg: blur(32px) saturate(200%);

  /* Specular Borders & Inner Hairlines */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.10);
  --border-strong: rgba(255, 255, 255, 0.18);
  --border-specular-top: rgba(255, 255, 255, 0.22); /* Top edge light catch */
  --border-focus: rgba(56, 189, 248, 0.55);

  /* =========================================================================
     2. BRAND & AI TELEMETRY ACCENTS
     ========================================================================= */
  /* Institutional Sovereign Accent (Titanium & Champagne Gold) */
  --brand-primary: #F8FAFC;
  --brand-gold: #F59E0B;
  --brand-gold-soft: rgba(245, 158, 11, 0.14);

  /* AI Engine & Telemetry Accent (Electric Cobalt -> Cyan Gradient) */
  --ai-primary: #38BDF8;                    /* Electric Sky Cyan */
  --ai-secondary: #6366F1;                  /* Deep Neural Indigo */
  --ai-tertiary: #A855F7;                   /* Quantum Violet */
  --ai-gradient: linear-gradient(135deg, #38BDF8 0%, #6366F1 55%, #A855F7 100%);
  --ai-gradient-subtle: linear-gradient(135deg, rgba(56, 189, 248, 0.15) 0%, rgba(99, 102, 241, 0.15) 100%);
  --ai-glow: 0 0 24px rgba(56, 189, 248, 0.28), 0 0 8px rgba(99, 102, 241, 0.4);

  /* =========================================================================
     3. WCAG AAA/AA HIGH-CONTRAST TYPOGRAPHY TOKENS
     ========================================================================= */
  --text-primary: #F8FAFC;                  /* Crisp Alabaster White (19.2:1 contrast) */
  --text-secondary: #CBD5E1;                /* Cool Platinum Slate (13.4:1 contrast) */
  --text-tertiary: #94A3B8;                 /* Muted Architectural Slate (7.3:1 AAA contrast) */
  --text-muted: #64748B;                    /* Secondary Meta / Disabled (4.6:1 AA contrast) */
  --text-inverse: #030508;

  /* =========================================================================
     4. FORENSIC SEVERITY PALETTE (P0 – P3) & VERDICT TOKENS
     ========================================================================= */
  /* P0 — Critical / Deal-Breaker / NO-GO */
  --risk-p0: #F43F5E;                       /* Crimson Rose Neon */
  --risk-p0-bg: rgba(244, 63, 94, 0.14);
  --risk-p0-border: rgba(244, 63, 94, 0.38);
  --risk-p0-glow: 0 0 20px rgba(244, 63, 94, 0.35);

  /* P1 — High Material Risk */
  --risk-p1: #FB923C;                       /* Solar Amber-Orange */
  --risk-p1-bg: rgba(251, 146, 60, 0.14);
  --risk-p1-border: rgba(251, 146, 60, 0.38);
  --risk-p1-glow: 0 0 20px rgba(251, 146, 60, 0.30);

  /* P2 — Medium Risk / CAUTION */
  --risk-p2: #FACC15;                       /* Citrine Signal Yellow */
  --risk-p2-bg: rgba(250, 204, 21, 0.14);
  --risk-p2-border: rgba(250, 204, 21, 0.38);
  --risk-p2-glow: 0 0 20px rgba(250, 204, 21, 0.28);

  /* P3 — Low Risk / Clean / GO Verdict */
  --risk-p3: #10B981;                       /* Emerald Mint Neon */
  --risk-p3-bg: rgba(16, 185, 129, 0.14);
  --risk-p3-border: rgba(16, 185, 129, 0.38);
  --risk-p3-glow: 0 0 20px rgba(16, 185, 129, 0.32);

  /* =========================================================================
     5. 9 DILIGENCE DOMAIN SIGNATURE ACCENTS
     ========================================================================= */
  --domain-legal: #818CF8;                  /* Indigo */
  --domain-finance: #34D399;                /* Emerald */
  --domain-commercial: #38BDF8;             /* Sky Cyan */
  --domain-tech: #A78BFA;                   /* Violet */
  --domain-cyber: #FB7185;                  /* Coral Crimson */
  --domain-hr: #F472B6;                     /* Magenta Rose */
  --domain-tax: #FBBF24;                    /* Warm Amber */
  --domain-regulatory: #2DD4BF;             /* Teal */
  --domain-esg: #4ADE80;                    /* Mint Green */

  /* =========================================================================
     6. BACKWARD-COMPATIBLE ALIASES (Fixes Audit Section 6.1 Broken Vars)
     ========================================================================= */
  --color-bg-primary: var(--bg-canvas);
  --color-bg-secondary: var(--bg-obsidian);
  --color-bg-surface: var(--bg-surface-1);
  --color-bg-elevated: var(--bg-surface-2);
  --color-bg-muted: rgba(255, 255, 255, 0.04);
  --color-bg: var(--bg-surface-1);
  --color-bg-border: var(--border-default);

  --color-accent: var(--ai-primary);
  --color-accent-hover: #7DD3FC;
  --color-accent-muted: rgba(56, 189, 248, 0.14);
  --color-accent-dim: rgba(56, 189, 248, 0.07);

  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-tertiary: var(--text-tertiary);
  --color-text-muted: var(--text-muted);

  --color-p0: var(--risk-p0);
  --color-p1: var(--risk-p1);
  --color-p2: var(--risk-p2);
  --color-p3: var(--risk-p3);

  /* =========================================================================
     7. TYPOGRAPHY, SPACING & ELEVATION SHADOWS
     ========================================================================= */
  --font-display: 'Space Grotesk', system-ui, -apple-system, sans-serif;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --header-height: 68px;
  --max-content-width: 1600px;

  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-full: 9999px;

  --shadow-glass: 0 16px 40px -8px rgba(0, 0, 0, 0.65), inset 0 1px 0 0 var(--border-specular-top);
  --shadow-glass-hover: 0 24px 48px -12px rgba(0, 0, 0, 0.8), 0 0 24px -4px rgba(56, 189, 248, 0.18), inset 0 1px 0 0 rgba(255, 255, 255, 0.35);
}