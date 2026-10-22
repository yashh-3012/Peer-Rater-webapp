# PeerRater

**Fair grade tracking for group projects.** PeerRater turns team work into transparent contribution data: every task has points, an owner and a deadline, so everyone can see who did what.

## Features

- **Accounts and roles:** sign up as a Team Leader or a Team Member
- **Teams:** leaders create teams, add or remove members and manage join requests; members can search for teams and request to join
- **Task board:** add tasks with points (1–100), an assignee and an optional deadline; tasks can be claimed, edited and removed
- **Late penalty:** a task claimed after its deadline earns only half its points
- **Analytics:** contribution breakdown as pie, doughnut, bar or line charts (Chart.js)
- **Print receipt:** print a contribution summary with the chart
- **Team chat:** built-in chat for each team
- **Customisation:** profile photos, team logos and 6 themes (Light, Sunset, Ocean, Dark, Forest and more)

## Tech Stack

- HTML, CSS and vanilla JavaScript
- [Chart.js](https://www.chartjs.org/) for charts
- Browser `localStorage` for data
- Netlify / Vercel for hosting

## Project Structure

```
Peer-Rater-webapp/
├── index.html           # App layout
├── app.js               # App logic
├── styles.css           # Styling and themes
├── config.js            # App configuration
├── logo.svg             # Logo
├── supabase-schema.sql  # Optional Supabase table (for cloud storage)
├── package.json         # Scripts
├── netlify.toml         # Netlify config
└── vercel.json          # Vercel config
```

## Getting Started

### Prerequisites

- A modern web browser
- Python 3 (used by the local server script)

### Run locally

```bash
git clone https://github.com/yashh-3012/Peer-Rater-webapp.git
cd Peer-Rater-webapp
npm start
```

Then open `http://localhost:3000` in your browser.

You can also just open `index.html` directly.

## How It Works

1. A team leader signs up and creates a team.
2. Members sign up and request to join (or get invited by the leader).
3. The leader adds tasks to the board with points and deadlines.
4. Members claim tasks. Late tasks get half points.
5. The analytics section shows each member's contribution, and the receipt can be printed.

> **Note:** data is stored in your browser's `localStorage`, so it stays on your device and is not shared between users.

## Deployment

```bash
npm run deploy:netlify
npm run deploy:vercel
```

## Author

**Yash**, B.Tech CSE, VIT Vellore
GitHub: [@yashh-3012](https://github.com/yashh-3012)