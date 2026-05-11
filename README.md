# Pickleball Queue

A real-time mobile app for managing pickleball court queues. Built with React Native, Expo, and Firebase. Players join a shared queue from their own phones, and the app automatically assigns them to courts when a game is ready.

## Features

- **Real-time sync** — all phones see the same queue and court state instantly via Firebase Firestore
- **Auto court assignment** — when 4 players are in the queue and a court is open, they're automatically assigned to teams
- **Smart team balancing** — tracks teammate history to avoid pairing the same players together repeatedly
- **"You're up" banner** — the first player in the queue gets a prompt to accept their spot or let the next person go
- **Manual override** — any player can enable override mode to manually add/remove players
- **Match history** — every game is logged with teams, court, and time
- **Name entry** — first-time users set their name once; it's remembered across sessions

## Tech Stack

- [Expo](https://expo.dev) (SDK 54) with file-based routing via expo-router
- [React Native](https://reactnative.dev)
- [Firebase Firestore](https://firebase.google.com/docs/firestore) for real-time shared state
- [AsyncStorage](https://react-native-async-storage.github.io/3.0/) for local player name persistence
- TypeScript

## Project Structure

```
app/
  _layout.tsx         # Root layout — name entry screen on first launch
  (tabs)/
    index.tsx         # Courts screen — main view, banner, override mode
    queue.tsx         # Queue screen — join, leave, skip
    history.tsx       # Match history
hooks/
  usePickleballState.ts   # All game logic and Firebase sync
  use-player-name.ts      # AsyncStorage name persistence
firebase.ts               # Firebase init
```

## Getting Started

### Prerequisites

- Node.js 18+
- Expo Go installed on your phone ([Android](https://play.google.com/store/apps/details?id=host.exp.exponent) / [iOS](https://apps.apple.com/app/expo-go/id982107779))
- A Firebase project with Firestore enabled

### Installation

1. Clone the repo:
   ```bash
   git clone https://github.com/GittingProjectsDone/PickleBall.git
   cd PickleBall
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up Firebase — create a `firebase.ts` file in the root with your project config:
   ```ts
   import { initializeApp } from 'firebase/app';
   import { getFirestore } from 'firebase/firestore';

   const firebaseConfig = {
     apiKey: '...',
     authDomain: '...',
     projectId: '...',
     storageBucket: '...',
     messagingSenderId: '...',
     appId: '...',
   };

   const app = initializeApp(firebaseConfig);
   export const db = getFirestore(app);
   ```

4. Start the development server:
   ```bash
   npx expo start
   ```

5. Scan the QR code with Expo Go on your phone.

### Firestore Setup

The app automatically creates an `app/state` document in Firestore on first run. No manual setup needed. Make sure your Firestore rules allow read/write during development:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

## How It Works

All players share a single Firestore document (`app/state`). Every phone listens to this document in real time. When any player joins the queue, skips their turn, or gets placed on a court, the change is written to Firestore and all phones update simultaneously — no server required.

Courts only auto-fill when all 4 slots are empty and at least 4 non-skipped players are in the queue. The team assignment algorithm shuffles candidates and picks the pairing that minimises repeated teammates based on stored history.

## Building for Production

To build a standalone app that doesn't require Expo Go:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android
```

This produces an installable `.apk` that works independently — no terminal or development server needed.

---

## AI Usage

This project was built with significant assistance from [Claude](https://claude.ai) (Anthropic). The entire development process, from initial architecture to debugging, was conducted through an iterative conversation with Claude over multiple sessions.

### What AI was used for

- **Initial architecture** — designing the data model, Firestore document structure, and hook-based state management pattern
- **Feature implementation** — writing the core logic for queue management, auto court filling, team assignment, and match history
- **Cross-platform setup** — configuring Expo, Firebase, AsyncStorage, and file-based routing
- **Debugging** — diagnosing and fixing bugs including a syntax error that prevented the UI from rendering, a court auto-fill logic bug, and a persistent banner re-appearance issue caused by Firestore snapshot callbacks overwriting local dismissal state
- **Incremental improvements** — skip/accept flow, teammate history tracking, manual override mode, app naming

### How the prompting worked

The project was developed through natural language descriptions of desired behaviour rather than writing code directly. A typical prompt described what the app should do from a user's perspective.

Claude would then read the relevant source files, diagnose the root cause, and produce corrected files. This back-and-forth continued across multiple sessions, with each session starting by uploading the current project zip so Claude had full context.

The most effective prompts were specific about observable behaviour rather than speculating about the cause. Sharing terminal logs, Firebase console screenshots, and full file contents allowed Claude to pinpoint exact bugs.
