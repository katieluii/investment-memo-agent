import os
import shutil

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

CHUNK_SIZE = 1000

router = APIRouter(prefix="/deals", tags=["documents"])


@router.post("/{deal_id}/documents", response_model=schemas.DocumentOut)
def upload_document(deal_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    deal = db.query(models.Deal).filter(models.Deal.id == deal_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")

    if not (file.filename.endswith(".txt") or file.filename.endswith(".md")):
        raise HTTPException(status_code=400, detail="Only .txt and .md files are supported")

    dest_dir = os.path.join(UPLOAD_DIR, str(deal_id))
    os.makedirs(dest_dir, exist_ok=True)
    file_path = os.path.join(dest_dir, file.filename)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    doc = models.Document(deal_id=deal_id, filename=file.filename, file_path=file_path)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{deal_id}/documents", response_model=list[schemas.DocumentOut])
def list_documents(deal_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.Document)
        .filter(models.Document.deal_id == deal_id)
        .order_by(models.Document.created_at)
        .all()
    )


@router.post("/{deal_id}/index-documents")
def index_documents(deal_id: int, db: Session = Depends(get_db)):
    docs = db.query(models.Document).filter(models.Document.deal_id == deal_id).all()
    if not docs:
        raise HTTPException(status_code=404, detail="No documents found for this deal")

    db.query(models.DocumentChunk).filter(models.DocumentChunk.deal_id == deal_id).delete()

    total_chunks = 0
    for doc in docs:
        try:
            with open(doc.file_path, "r", encoding="utf-8") as f:
                text = f.read()
        except OSError as e:
            raise HTTPException(status_code=500, detail=f"Could not read {doc.filename}: {e}")

        chunks = [text[i : i + CHUNK_SIZE] for i in range(0, len(text), CHUNK_SIZE)]
        for idx, chunk_text in enumerate(chunks):
            db.add(
                models.DocumentChunk(
                    deal_id=deal_id,
                    document_id=doc.id,
                    chunk_index=idx,
                    chunk_text=chunk_text,
                )
            )
        doc.status = "indexed"
        total_chunks += len(chunks)

    db.commit()
    return {"message": f"Indexed {total_chunks} chunks from {len(docs)} documents"}
