from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

import seed_demo
from database import Base, SessionLocal, engine
from routers import agents, deals, documents, feedback, founder_insights, memo

Base.metadata.create_all(bind=engine)


def _run_migrations():
    """Add any new columns to existing tables without requiring Alembic."""
    with engine.connect() as conn:
        inspector = inspect(engine)
        existing = {col["name"] for col in inspector.get_columns("deals")}
        new_cols = [
            ("investment_amount", "REAL"),
            ("moic", "REAL"),
            ("irr", "REAL"),
            ("moic_submitted_at", "DATETIME"),
            ("peak_revenue_m", "REAL"),
            ("market_sizing_submitted_at", "DATETIME"),
            ("exit_base_moic", "REAL"),
            ("exit_base_irr", "REAL"),
            ("exit_submitted_at", "DATETIME"),
            ("therapeutic_area", "TEXT"),
        ]
        for col_name, col_type in new_cols:
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE deals ADD COLUMN {col_name} {col_type}"))
        conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _run_migrations()
    db = SessionLocal()
    try:
        seed_demo.run(db)
    except Exception:
        pass
    finally:
        db.close()
    yield


app = FastAPI(title="Investment Memo API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

app.include_router(deals.router)
app.include_router(documents.router)
app.include_router(agents.router)
app.include_router(feedback.router)
app.include_router(founder_insights.router)
app.include_router(memo.router)


@app.get("/health")
def health():
    return {"status": "ok"}
