# OrgChart

A Next.js web app for enterprise sales reps that builds a live org chart for any company by querying ZoomInfo, Clay, and web search.

## How It Works

1. You type a company name in the search bar
2. The API route queries **ZoomInfo** for contacts (name, title, dept, email, phone)
3. Falls back to **Clay** enrichment if ZoomInfo returns thin results
4. Falls back to **Brave web search** if both are sparse
5. Results are deduplicated and organized into a reporting hierarchy (CEO → C-Suite → VPs → Directors)
6. Displayed as an interactive, pannable/zoomable org chart

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/your-org/orgchart-app.git
cd orgchart-app
npm install
```

### 2. Set up environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in your credentials:

```env
# ZoomInfo — from your ZoomInfo admin panel → API Settings
ZOOMINFO_USERNAME=you@company.com
ZOOMINFO_PASSWORD=your_api_password
ZOOMINFO_CLIENT_ID=your_client_id

# Clay — from clay.com → Settings → API
CLAY_API_KEY=your_clay_key

# Brave Search (optional fallback)
BRAVE_SEARCH_API_KEY=your_brave_key
```

**Note:** You only need ZoomInfo OR Clay — whichever you have. The app will fall back gracefully.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploy to Vercel

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-org/orgchart-app)

### Manual deploy

1. Push to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your GitHub repo
3. In **Environment Variables**, add:
   - `ZOOMINFO_USERNAME`
   - `ZOOMINFO_PASSWORD`
   - `ZOOMINFO_CLIENT_ID`
   - `CLAY_API_KEY`
   - `BRAVE_SEARCH_API_KEY` *(optional)*
4. Click **Deploy**

Your app will be live at `https://orgchart-app-xxxx.vercel.app` in ~2 minutes.

---

## Project Structure

```
orgchart-app/
├── pages/
│   ├── _app.js              # Global CSS wrapper
│   ├── index.js             # Main UI (search + D3 org chart)
│   └── api/
│       └── orgchart.js      # POST /api/orgchart — calls ZoomInfo/Clay
├── lib/
│   ├── zoominfo.js          # ZoomInfo REST API client
│   ├── clay.js              # Clay enrichment client
│   ├── websearch.js         # Brave search fallback
│   └── buildHierarchy.js    # Flat contacts → D3 tree
├── styles/
│   └── globals.css
├── .env.example             # Copy to .env.local, fill in keys
└── README.md
```

## Getting Your API Keys

### ZoomInfo
1. Log into ZoomInfo → top-right menu → **API Documentation**
2. Or contact your ZoomInfo CSM to enable API access on your account
3. You'll need: `username` (your login email), `password` (API-specific password), and `client_id`

### Clay
1. Log into [clay.com](https://clay.com) → **Settings** → **API**
2. Generate an API key

---

## Customizing the Hierarchy Logic

The `lib/buildHierarchy.js` file contains the title-to-level mapping:

| Level | Examples |
|-------|---------|
| 0 | CEO, Chief Executive Officer |
| 1 | CFO, COO, CTO, CMO, CPO, President |
| 2 | EVP, SVP, Executive VP, Senior VP |
| 3 | VP, Vice President |
| 4 | Director, Head of, General Manager |
| 5 | Manager, Lead |

You can add new patterns to the `TITLE_PATTERNS` array in that file.
