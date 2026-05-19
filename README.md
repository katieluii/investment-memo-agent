# Investment Memo Agent

A full-stack tool that combines real-time web search with proprietary uploaded documents to automate investment diligence and memo generation for early-stage biopharma deals.

Four specialised Claude Sonnet agents — Scientific Diligence, Competitive Intelligence, Clinical & Regulatory, and Financing & Valuation — each synthesise public and proprietary data to surface key opportunities, risks, and diligence questions. Human checkpoints allow analysts to add network intelligence, founder meeting notes, and a structured team assessment before generating a structured Markdown investment memo.

**Live:** [investment-memo-agent-git-main-katieluiis-projects.vercel.app](https://investment-memo-agent-git-main-katieluiis-projects.vercel.app)

---

## How it works

```
Create deal → Upload documents → Index chunks → Run agents → Review + add notes
    → Team assessment → Generate memo
```

### The four agents

| Agent | What it evaluates |
|---|---|
| 🔬 Scientific Diligence | Mechanism of action, clinical/preclinical evidence, scientific opportunities and risks |
| 🏁 Competitive Intelligence | Competitive landscape, market sizing, differentiation |
| ⚖️ Clinical & Regulatory | Regulatory pathway, FDA/EMA precedent, regulatory opportunities and risks |
| 💰 Financing & Valuation | Comparable financings, implied valuation, financing opportunities and risks |

Each agent uses:
- **Live web search** (`web_search_20250305` via Claude Sonnet) for public data — clinical trials, competitive pipeline, recent FDA actions, comparable financings
- **Your uploaded documents** for proprietary context — pitch decks (as text), data room summaries, trial synopses

### Human checkpoints

1. **Per-agent notes** — correct or supplement each agent's output with network intelligence or corrections
2. **Founding team assessment** — structured qualitative ratings (conviction, domain expertise, execution track record, strategic clarity, team cohesion, openness to input) plus free-text meeting notes
3. **Regenerate** — at any point, regenerate the memo to incorporate the latest agent outputs, notes, and team assessment

---

## Architecture

```
apps/
├── api/          FastAPI + SQLite backend (deployed on Railway)
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py
│   ├── seed_demo.py            auto-seeds Axon Therapeutics demo deal on cold start
│   └── routers/
│       ├── deals.py
│       ├── documents.py
│       ├── agents.py           four Claude Sonnet agents with web search
│       ├── feedback.py         per-agent analyst notes
│       ├── founder_insights.py team assessment
│       └── memo.py             memo generation incorporating all inputs
└── web/          Next.js frontend (deployed on Vercel)
    ├── app/deals/
    │   ├── page.tsx              deals list
    │   ├── new/page.tsx          create deal
    │   └── [dealId]/
    │       ├── page.tsx          deal detail + inline edit
    │       ├── documents/        upload + index documents
    │       ├── founder-insights/ team assessment form
    │       ├── review/           agent output cards + per-agent feedback
    │       └── memo/             view + regenerate investment memo
    └── lib/api.ts                typed API client
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/deals` | Create deal |
| GET | `/deals` | List deals |
| GET | `/deals/{id}` | Get deal |
| PATCH | `/deals/{id}` | Update deal |
| POST | `/deals/{id}/documents` | Upload document (.txt or .md) |
| GET | `/deals/{id}/documents` | List documents |
| POST | `/deals/{id}/index-documents` | Chunk and index all documents |
| POST | `/deals/{id}/run-agents` | Run all four agents |
| GET | `/deals/{id}/agent-outputs` | Get agent outputs |
| POST | `/deals/{id}/feedback` | Save per-agent analyst note |
| GET | `/deals/{id}/feedback` | Get analyst notes |
| PUT | `/deals/{id}/founder-insights` | Save/update team assessment |
| GET | `/deals/{id}/founder-insights` | Get team assessment |
| POST | `/deals/{id}/generate-memo` | Generate investment memo |
| GET | `/deals/{id}/memo` | Get latest memo |

---

## Running locally

**Backend**

```bash
cd apps/api
pip install -r requirements.txt
ANTHROPIC_API_KEY=sk-ant-... uvicorn main:app --reload
```

**Frontend**

```bash
cd apps/web
cp .env.local.example .env.local
# edit .env.local: NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev
```

---

## Deployment

**Backend → Railway**

1. Connect `katieluii/investment-memo-agent` GitHub repo to Railway
2. Railway uses the root `Procfile`: `web: sh -c 'cd apps/api && uvicorn main:app --host 0.0.0.0 --port $PORT'`
3. Set environment variable: `ANTHROPIC_API_KEY=sk-ant-...`
4. On cold start, `seed_demo.py` auto-populates a demo deal (Axon Therapeutics, Phase 2b breast cancer)

> SQLite uses ephemeral storage on Railway — the DB resets on each redeploy. Add a Railway Volume mounted at `/app/apps/api` for persistence.

**Frontend → Vercel**

1. Import the repo into Vercel, set **Root Directory** to `apps/web`
2. Add env var: `NEXT_PUBLIC_API_URL=https://<railway-url>.up.railway.app` (no trailing slash, Production environment checked)
3. Redeploy after any env var change (`NEXT_PUBLIC_*` vars are baked at build time)

Stable branch URL: `https://investment-memo-agent-git-main-katieluiis-projects.vercel.app`

---

## Roadmap

- [ ] PDF pitch deck parsing (`pdfplumber` text extraction on upload)
- [ ] Embeddings + semantic retrieval (RAG) for citation-grounded analysis
- [ ] Parallel agent execution to reduce turnaround time
- [ ] Memo export to DOCX and PDF
- [ ] Live clinical news feed integration as automatic deal context
