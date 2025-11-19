# Little Hero Labs - Client-Facing Website

This is the client-facing website for Little Hero Labs, built with Astro for optimal SEO and performance.

## Features

- **Homepage** - Landing page with hero image, features, and call-to-action sections
- **How It Works** - Step-by-step guide for creating personalized books
- **Our Books** - Showcase of available personalized book options
- **Responsive Design** - Mobile-first approach with breakpoints
- **SEO Optimized** - Meta tags, structured content, and semantic HTML
- **Hide-on-Scroll Header** - Header automatically hides when scrolling down
- **Reusable Components** - Modular component architecture

## Design System

The site uses a comprehensive design system based on the Little Hero Labs brand guidelines:

### Colors
- **Primary**: Hero Coral (#FF6F61), Golden Yellow (#F9C74F), Sky Blue (#00B4D8)
- **Secondary**: Sage Green (#C7D6B8), Soft Teal (#A8DADC), Dusty Peach (#F4A261)
- **Neutrals**: Soft Charcoal (#333333), Storybook Beige (#FAF3E3), Off-white (#FFFCF8)

### Typography
- **Headings**: Garamond (serif, elegant)
- **Body**: Merriweather (serif, warm and readable)
- **UI/Buttons**: Poppins (sans-serif, clean)
- **Display**: Comic Neue/Pequena (playful, for CTAs)

### Components
- `Header.astro` - Navigation with hide-on-scroll functionality
- `Footer.astro` - Site footer with links and branding
- `Button.astro` - Reusable button component (primary/secondary variants)
- `Hero.astro` - Hero section with image and optional content overlay

## Development

### Install Dependencies
```bash
npm install
```

### Run Development Server
```bash
npm run dev
```

The site will be available at `http://localhost:4321`

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

## Project Structure

```
frontend/
├── public/
│   ├── assets/          # Images, icons, logos
│   ├── homepage-hero.png
│   ├── how-it-works-hero.png
│   └── our-books-hero.png
├── src/
│   ├── components/      # Reusable Astro components
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── Button.astro
│   │   └── Hero.astro
│   ├── layouts/         # Page layouts
│   │   └── Layout.astro
│   ├── pages/           # Route pages
│   │   ├── index.astro
│   │   ├── how-it-works.astro
│   │   └── our-books.astro
│   └── styles/          # Global styles
│       └── global.css
```

## Notes

- This is a client-facing site only. Admin functionality is separate at admin.littleherolabs.com
- All pages are optimized for SEO with proper meta tags
- Analytics can be added in the Layout component's head slot
- The site is designed to be deployed separately from the admin system

## Customer Approval Page

The customer approval flow (`src/pages/approve/[token].astro`) uses a React island for the book preview viewer.

- **Component**: `src/components/BookSpreadViewer.tsx`
- **Hydration**: Rendered via `<BookSpreadViewer client:load />` and updated through the custom browser event `lhb:book-spreads`
- **Data Flow**: The Astro page validates tokens, fetches manifests, builds `spreads`, and dispatches them to the React viewer
- **Navigation**: Previous/Next buttons and global `ArrowLeft`/`ArrowRight` keyboard shortcuts are handled by the React component
- **Styling**: Viewer styles live inside the React component; the Astro page only toggles the wrapper visibility
