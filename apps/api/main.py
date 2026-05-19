from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import seed_demo
from database import Base, SessionLocal, engine
from routers import agents, deals, documents, feedback, founder_insights, memo

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
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
