# Peer Rater

A web app where peers can rate each other and chat, built with vanilla JavaScript and Supabase.

## Features

- Rate peers and see scores
- Built-in chat
- Cloud database powered by Supabase
- Ready to deploy on Netlify or Vercel

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML, CSS, JavaScript |
| Backend / Database | Supabase (PostgreSQL) |
| Hosting | Netlify / Vercel |

## Project Structure

```
Peer-Rater-webapp/
├── index.html           # Main page
├── app.js               # App logic
├── config.js            # Supabase configuration
├── styles.css           # Styling
├── logo.svg             # App logo
├── scores.json          # Score data
├── supabase-schema.sql  # Database schema
├── package.json         # Project metadata and scripts
├── netlify.toml         # Netlify deployment config
└── vercel.json          # Vercel deployment config
```

## Getting Started

### Prerequisites

- A modern web browser
- [Node.js](https://nodejs.org/) (optional, for running a local server)
- A free [Supabase](https://supabase.com/) account

### 1. Clone the repository

```bash
git clone https://github.com/yashh-3012/Peer-Rater-webapp.git
cd Peer-Rater-webapp
```

### 2. Set up Supabase

1. Create a new project on Supabase.
2. Open the **SQL Editor** and run the contents of `supabase-schema.sql` to create the tables.
3. Go to **Project Settings → API** and copy your **Project URL** and **anon public key**.

### 3. Configure the app

Open `config.js` and add your Supabase credentials:

```js
const SUPABASE_URL = "your-project-url";
const SUPABASE_ANON_KEY = "your-anon-public-key";
```

> Never commit secret keys. Only the public anon key belongs in frontend code.

### 4. Run locally

```bash
npx serve .
```

Then open the address shown in the terminal (usually `http://localhost:3000`).
You can also open `index.html` directly in your browser.

## Deployment

The project includes config files for both platforms:

- **Netlify:** connect the repo on Netlify; settings are read from `netlify.toml`.
- **Vercel:** import the repo on Vercel; settings are read from `vercel.json`.

## Future Improvements

- User authentication
- Rating history and analytics
- Notifications for new ratings and messages

## Author

**Yash**, B.Tech CSE, VIT Vellore
GitHub: [@yashh-3012](https://github.com/yashh-3012)