# Study Pond

Study Pond is a calming, student-focused productivity dashboard (Pomodoro timer, to-do list, sticky notes, affirmations, lo-fi music, and more) with a soothing pond aesthetic.

This repository contains a frontend prototype built with TypeScript and Vite. The app uses simple templates and a tiny hash router for navigation.

Getting started

1. Install dependencies

```bash
npm install
```

2. Run the dev server

```bash
npm run dev
```

3. Open the URL printed by Vite (usually http://localhost:5173).

Project structure (frontend-focused)

- index.html — main page and nav
- src/
  - components/ — HTML templates (home, pomodoro, views)
  - styles/ — global and component CSS
  - scripts/ — TypeScript logic (Pomodoro timer)
  - assets/ — images and icons

Notes
- The project uses a small runtime template loader to fetch `.html` templates. This avoids the need for a Vite HTML plugin.
