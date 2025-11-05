# Little Hero Labs – Design System

This document provides the comprehensive design system for **Little Hero Labs**, consolidating visual styles into a unified system for web development.

---

## 🌈 Brand Overview

**Brand Name:** Little Hero Labs  
**Tagline:** "Become the hero of your own story."  
**Voice & Tone:** Whimsical, imaginative, empowering, with a balance of playful and educational tones.

---

## 🎨 Color System

We unify three palettes (Vibrant Adventure, Nature Explorer, Whimsical Watercolor) into one harmonious system.

### Primary Palette
- **Hero Coral:** `#FF6F61` - CTA buttons, highlights
- **Golden Yellow:** `#F9C74F` - Accent shapes, backgrounds
- **Sky Blue:** `#00B4D8` - Navigation elements
- **Forest Green:** `#52796F` - Icons, secondary highlights
- **Cream:** `#FFF8F0` - Backgrounds

### Secondary Palette (For Textures and Soft Backgrounds)
- **Sage Green:** `#C7D6B8` - Section backgrounds, hover states
- **Soft Teal:** `#A8DADC` - Light backgrounds
- **Dusty Peach:** `#F4A261` - Accent backgrounds
- **Warm Sand:** `#F1FAEE` - Subtle backgrounds

### Neutral Tones
- **Soft Charcoal:** `#333333` - Primary text
- **Storybook Beige:** `#FAF3E3` - Section backgrounds
- **Off-white:** `#FFFCF8` - Layout base
- **Navy Midnight:** `#2D3142` - Primary text, logo

### Additional Colors
- **Teal Explorer:** `#50E3C2` - Navigation, buttons, icons
- **Soft Cream:** `#FFF7EC` - Backgrounds, layout base

### CSS Variables Implementation
All colors are defined as CSS variables in `frontend/src/styles/global.css`:
- `--color-hero-coral`
- `--color-golden-yellow`
- `--color-forest-green`
- `--color-navy-midnight`
- And all other colors listed above

---

## ✍️ Typography

### Headings
- **Garamond** – Classic, storybook-inspired elegance (e.g., `h1`, `h2`)
- **Playfair Display** – Alternate for whimsical or vintage emphasis

### Body
- **Merriweather** – Readable and warm serif for paragraphs

### UI & Navigation
- **Poppins** – Clean sans-serif for UI labels, menus, and buttons

### Display / Hero Font
- **Comic Neue** / **Pequena** – Playful or heroic messages (e.g., banners, CTA buttons)

**Font Pairing Examples:**
- `h1: Garamond`, `body: Merriweather`
- `banner: Comic Neue`, `nav/menu: Poppins`

### CSS Variables
Font families are defined in `frontend/src/styles/global.css`:
- `--font-heading`
- `--font-body`
- `--font-ui`
- `--font-display`

### Google Fonts
All fonts are loaded via Google Fonts in the global CSS:
- Garamond, Merriweather, Poppins, Playfair Display, Comic Neue

---

## 🧱 Layout and Spacing

### Grid System
- **Grid:** 12-column responsive
- **Container Max Width:** 1280px
- **Gutter:** 24px on desktop, 16px mobile

### Spacing Scale
- **XS:** 0.25rem (4px)
- **SM:** 0.5rem (8px)
- **MD:** 1rem (16px)
- **LG:** 2rem (32px)
- **XL:** 4rem (64px)

### Section Padding
- **Desktop:** 80px top/bottom
- **Mobile:** 40px top/bottom

### CSS Variables
Spacing tokens are defined in `frontend/src/styles/global.css`:
- `--spacing-xs`, `--spacing-sm`, `--spacing-md`, `--spacing-lg`, `--spacing-xl`
- `--container-max-width`
- `--grid-gutter`

---

## 🔘 Buttons

### Primary CTA (e.g., Create Your Book)
- **Background:** Hero Coral `#FF6F61`
- **Text:** `#FFFFFF`
- **Border Radius:** 12px
- **Font:** Comic Neue (bold, playful)
- **Hover:** Slightly darker coral, translateY(-2px), shadow

### Secondary CTA (e.g., Learn More)
- **Background:** Golden Yellow `#F9C74F`
- **Text:** Forest Green
- **Border Radius:** 12px
- **Hover:** Slightly brighter yellow, translateY(-2px), shadow

**Implementation:** See `frontend/src/components/Button.astro`

---

## 🖼 Illustration & Icon Style

### Illustration Blend
The brand uses three illustration styles that can be blended:

- **Vibrant Adventure:** Rocket ships, superheroes, comic bursts, bold shadows
- **Nature Explorer:** Trees, magnifying glasses, starry skies, animals
- **Whimsical Watercolor:** Softly textured edges, hand-drawn magic wands, cozy indoor scenes

**Usage Guidelines:**
- Use different illustration tones per section (e.g., hero = bold, testimonial = soft, footer = earthy)
- Ensure shared visual motifs (stars, books, characters) across scenes

### Iconography
- **Style:** Rounded, simple icon shapes
- **Variations:** 3D-inspired or textured versions encouraged (to match illustration)
- **Consistency:** Consistent stroke weight
- **Icons Available:** rocket, book, star, wand, picture, and more
- **Location:** `frontend/public/assets/`

---

## 🔣 Logo & Favicon

**Logo:** "Little Hero Labs" in playful type with icon of a stylized rocket/book/star.

**Logo Files:**
- `frontend/public/assets/logo.png`
- `frontend/public/assets/logo-full.png`

**Favicon:** Rounded corner square featuring star or rocket emblem, warm yellow or coral background.

**Location:** `frontend/public/favicon.svg`

---

## 📄 Pages

### Homepage
- **Hero Image:** Mixed-style banner with text overlay in whitespace
- **Sections:** Hero → About → Features → Latest Book → How It Works Preview → Footer
- **Hero Text:** "Bring your child's imagination to life!"
- **CTA:** "Create Your Book"

### How It Works
- **Hero Image:** Illustrated banner with text overlay
- **Sections:** Hero → 3-Step Process → CTA
- **Hero Text:** "How It Works"
- **CTA:** "Get Started"

### Our Books
- **Hero Image:** Illustrated banner with text overlay
- **Sections:** Hero → Featured Books Grid → Why Choose Section
- **Hero Text:** "Our Books"
- **CTA:** "Create Your Book"

**Hero Images Location:** `frontend/public/` (homepage-hero.png, how-it-works-hero.png, our-books-hero.png)

---

## 🔧 Component Guidelines

### Header
- **Location:** `frontend/src/components/Header.astro`
- **Features:** Hide-on-scroll functionality, fixed positioning
- **Styling:** Semi-transparent background with backdrop blur

### Footer
- **Location:** `frontend/src/components/Footer.astro`
- **Styling:** Dark background (navy midnight) with light text

### Hero Component
- **Location:** `frontend/src/components/Hero.astro`
- **Features:** Supports optional title, subtitle, and CTA button
- **Text Positioning:** Centered in whitespace, constrained to max-width to avoid overlapping illustrations

### Button Component
- **Location:** `frontend/src/components/Button.astro`
- **Variants:** Primary (coral), Secondary (yellow)
- **Sizes:** sm, md, lg

---

## 🧠 Developer Guidelines

### CSS Best Practices
- Use `rem` for all font sizes
- Use CSS variables for colors (defined in global.css)
- Use Tailwind utility classes where applicable
- Support for dark mode not required initially

### Asset Guidelines
- All illustrations exported as optimized `.png` or `.webp` for performance
- Icons as `.png` or `.svg` in `frontend/public/assets/`
- Hero images as optimized `.png` files

### Responsive Design
- Mobile-first approach
- Breakpoints: 768px (tablet), 1200px (desktop)
- All layouts should be responsive

### Accessibility
- Color contrast: WCAG AA minimum
- Alt text for all images
- Keyboard navigation support
- Semantic HTML structure

---

## ✨ Animations (Consolidated)

### Star Assets
- Format: PNG with transparent background
- Style: Soft, whimsical, watercolor; gentle glow
- Color: Use CSS var `var(--color-golden-yellow)` (replace any hardcoded gold like `#FFD700`)
- Variations: 3–4 designs (approx. 20–30px, 40–50px, 60–80px; optional sparkle/trail)
- Location: `frontend/public/assets/animations/`
  - `star-small.png`, `star-medium.png`, `star-large.png`, `star-sparkle.png` (optional)

Animation usage in code:
- Twinkle = opacity + scale keyframes with slight desynchronization per element
- Optional subtle drift = small translate changes to avoid synchronized look

### Cloud Assets
- Format: PNG with transparent background
- Style: Soft, fluffy watercolor, subtle shadows
- Variations: small (100–120px), medium (150–180px), large (200–250px), optional wispy
- Location: `frontend/public/assets/animations/`
  - `cloud-small.png`, `cloud-medium.png`, `cloud-large.png`, `cloud-wispy.png` (optional)

Animation usage in code:
- Horizontal float (left↔right), gentle vertical drift, optional fade in/out

### Technical Notes
- Optimize all assets for web (file size)
- Transparent backgrounds required
- Should work on both light and darker hero backgrounds

---

## ✍️ Typography Strategy (Consolidated)

This consolidates prior notes into the source of truth used in code variables.

- Headings: `Garamond` via `var(--font-heading)`
- Body: `Merriweather` via `var(--font-body)`
- UI/Navigation: `Poppins` via `var(--font-ui)`
- Display/Hero accents: `Comic Neue` via `var(--font-display)`

Guidelines:
- Use CSS variables for all font-family references
- Limit to these roles to preserve hierarchy and performance
- Load only necessary weights; fonts via Google Fonts with `display=swap`

Note: Older references to different primary UI/body fonts (e.g., Nunito Sans) are superseded by the variables above.

---

## 🎨 Color Audit Notes (Consolidated)

- Primary palette in this document remains source of truth; ensure code uses CSS variables
- Replace any hardcoded hover colors with variables or computed variants (e.g., using `color-mix()`)
- Replace hardcoded golds in animations with `var(--color-golden-yellow)`

---

## 📦 Assets Location

All design assets have been moved to:
- **Hero Images:** `frontend/public/`
- **Icons & Logos:** `frontend/public/assets/`
- **Design System:** Implemented in `frontend/src/styles/global.css`

---

## 🛠 Implementation Status

✅ Color system implemented in CSS variables  
✅ Typography system implemented with Google Fonts  
✅ Spacing system implemented in CSS variables  
✅ Button components created  
✅ Header/Footer components created  
✅ Hero component created  
✅ All three pages (Homepage, How It Works, Our Books) implemented  
✅ Assets moved to frontend/public  

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Status:** Complete and implemented in frontend codebase

