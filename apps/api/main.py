from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import agents, deals, documents, memo

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Investment Memo API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(deals.router)
app.include_router(documents.router)
app.include_router(agents.router)
app.include_router(memo.router)


@app.get("/health")
def health():
    return {"status": "ok"}
