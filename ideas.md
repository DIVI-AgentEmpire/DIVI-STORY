# DIVI STORY - Design Direction

## Chosen Design Approach: **Modern Data Narrative**

### Design Movement
Contemporary SaaS minimalism with subtle depth—inspired by premium data visualization platforms (Tableau, Figma) and narrative-driven design. The interface treats data transformation as a storytelling act, not a mechanical process.

### Core Principles
1. **Data as Story**: Visual hierarchy emphasizes narrative flow—input → processing → insight. Each section feels like a chapter.
2. **Minimal Friction**: Clean, spacious layouts with zero visual noise. Every element serves the transformation story.
3. **Depth Through Subtlety**: Soft shadows, gentle gradients, and refined borders create dimension without clutter.
4. **Intentional Motion**: Smooth transitions and loading states that reinforce the "transformation" metaphor.

### Color Philosophy
- **Primary**: Deep indigo (`oklch(0.45 0.2 265)`) — trust, intelligence, transformation
- **Accent**: Vibrant teal (`oklch(0.65 0.2 180)`) — insight, clarity, action
- **Background**: Near-black (`oklch(0.08 0.01 265)`) — focus, premium feel
- **Card Surface**: Subtle blue-gray (`oklch(0.15 0.02 265)`) — depth without distraction
- **Text**: Crisp white/light gray — maximum readability against dark
- **Reasoning**: Dark theme positions this as a premium, focused tool for serious data work. Indigo conveys intelligence; teal highlights insights.

### Layout Paradigm
**Asymmetric two-column flow:**
- Left: Input area (large text zone) — primary action
- Right: Results dashboard (stacked insight cards) — secondary consumption
- On mobile: Stacked vertically with full-width sections
- Hero section: Minimal—just logo, title, and one-liner value prop
- No centered layouts; asymmetry creates visual interest and guides attention

### Signature Elements
1. **Gradient Divider**: Subtle indigo-to-teal gradient separating sections—reinforces transformation theme
2. **Insight Cards**: Each result type (Story, Insights, Risks, etc.) in a distinct card with left-border accent (teal for positive, orange for risks)
3. **Loading Pulse**: Smooth breathing animation on the generate button and result cards during processing

### Interaction Philosophy
- **Button States**: Generate button scales slightly on hover (0.98), pulses during loading
- **Card Reveals**: Results fade in with subtle upward motion (100ms stagger per card)
- **Copy Action**: Toast confirmation on successful copy, icon feedback
- **Empty State**: Friendly message guiding users to paste data

### Animation
- **Button Press**: 100ms scale(0.97) on active
- **Loading State**: Smooth pulse on generate button (1.5s cycle)
- **Result Cards**: Fade + slide-up on entry (250ms ease-out, 50ms stagger)
- **Hover Effects**: Subtle lift on cards (2px shadow increase, 150ms transition)
- **Respect Motion**: All animations gated behind `prefers-reduced-motion`

### Typography System
- **Display Font**: `Sohne` or `Outfit` (bold, geometric) — headlines, logo
- **Body Font**: `Inter` (clean, neutral) — body text, UI labels
- **Hierarchy**:
  - H1: 2.5rem / 700 weight — main title
  - H2: 1.875rem / 600 weight — section headers
  - H3: 1.25rem / 600 weight — card titles
  - Body: 0.95rem / 400 weight — descriptions, results
  - Caption: 0.85rem / 400 weight — labels, metadata

### Brand Essence
**One-liner**: *Transform raw business data into compelling narratives that drive decisions.*
**Personality**: Intelligent, focused, trustworthy, forward-thinking.

### Brand Voice
- **Headlines**: Action-oriented, clear, no fluff
  - ✅ "Paste your data. Get your story."
  - ✅ "AI-powered business narratives in seconds"
  - ❌ "Welcome to DIVI STORY"
- **CTAs**: Direct, confident
  - ✅ "Generate Story"
  - ✅ "Copy Insights"
  - ❌ "Click Here"
- **Microcopy**: Conversational but professional
  - ✅ "Paste your business data here—sales figures, metrics, updates, anything."
  - ✅ "Generating your story..."

### Wordmark & Logo
**Logo Concept**: Geometric mark combining a data point (circle) and a narrative arc (curved line flowing upward-right). Suggests both data and story. Rendered in teal on transparent background. No text in mark—wordmark is separate.

### Signature Brand Color
**Teal** (`oklch(0.65 0.2 180)`) — unmistakably DIVI STORY. Used for:
- Accent borders on insight cards
- Generate button
- Loading indicators
- Icon highlights

---

## Implementation Notes
- Dark theme is default (no theme toggle needed per requirements)
- Responsive breakpoints: mobile (< 768px), tablet (768–1024px), desktop (> 1024px)
- No file uploads, no auth, no payments—focus on the core transformation flow
- OpenRouter API key will be required from user (stored in frontend env or user input)
