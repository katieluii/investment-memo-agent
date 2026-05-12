# Investment Memo Agent — MVP

A local full-stack app for creating biotech/VC investment memos.

## Stack

- **Backend:** FastAPI + SQLite (SQLAlchemy ORM)
- **Frontend:** Next.js 14, TypeScript, App Router

## How to run

### Backend

```bash
cd apps/api
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The SQLite database (`memo.db`) is created automatically on first run. No setup required.

### Frontend

```bash
cd apps/web
npm install
cp .env.local.example .env.local   # default points to http://localhost:8000
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Demo flow

1. **Create a deal** — go to `/deals` → click **+ New Deal** → fill in company name, asset, indication, stage, round, thesis → Submit
2. **Upload documents** — click **Documents →** → upload one or more `.txt` / `.md` files
3. **Index documents** — click **Index Documents** (splits files into ~1 000-char chunks)
4. **Run agents** — click **Review →** → click **Run Agents** → see mocked structured outputs from three agents (diligence, financing, risk)
5. **Generate memo** — click **Memo →** → click **Generate Memo** → read the full Markdown investment memo

---

## Architecture

```
apps/
  api/
    main.py              FastAPI app + CORS + DB init
    database.py          SQLAlchemy engine, session factory
    models.py            Deal, Document, DocumentChunk, AgentOutput, Memo
    schemas.py           Pydantic v2 response/request schemas
    routers/
      deals.py           POST/GET /deals, GET /deals/{id}
      documents.py       POST/GET documents, POST index-documents
      agents.py          POST run-agents, GET agent-outputs
      memo.py            POST generate-memo, GET memo
    uploads/             Local file storage (gitignored except .gitkeep)
  web/
    lib/api.ts           All fetch helpers + TypeScript types
    app/
      deals/             Deal list page
      deals/new/         Create deal form
      deals/[dealId]/    Deal overview + nav
      deals/[dealId]/documents/   Upload + index
      deals/[dealId]/review/      Run agents + view outputs
      deals/[dealId]/memo/        Generate + view memo
```

---

## What's mocked / TODO

The agents produce **mocked** outputs with `[TODO: ...]` placeholders. Real wiring:

- `# TODO: replace with real LLM call` comments are in each agent function in `routers/agents.py`
- `# TODO: replace with real LLM call for prose generation` in `routers/memo.py`
- `# TODO: embeddings/RAG` — replace chunk lookup with vector similarity search
- `# TODO: PDF/DOCX parsing` — add `pdfminer` / `python-docx` to document indexing
- `# TODO: DOCX/PDF export` — render memo markdown to file
- `# TODO: workflow orchestration` — add LangGraph or similar when agents grow
