from pathlib import Path
import json
from fastapi import APIRouter, UploadFile, File, HTTPException, Header, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Literal
from app.core.config import get_settings
from app.rag.workflow import ask, stream_ask
from app.rag.vectorstore import add_documents 
from app.services.ingestion import load_file, chunk_documents, SUPPORTED
from app.services.audit import write_audit, register_demo_user

router = APIRouter(prefix="/api")
settings = get_settings()

class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=3000)


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=3000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=12)
    username: str = Field(min_length=2, max_length=40, pattern=r"^[A-Za-z0-9 _.-]+$")
    search_common: bool = False


class WorkspaceRequest(BaseModel):
    username: str = Field(min_length=2, max_length=40, pattern=r"^[A-Za-z0-9 _.-]+$")


def _user_key(username: str) -> str:
    import hashlib
    return hashlib.sha256(username.strip().casefold().encode()).hexdigest()[:32]


@router.post("/workspace")
def workspace(payload: WorkspaceRequest):
    existed = register_demo_user(payload.username)
    return {"username": payload.username.strip(), "returning": existed}


@router.get("/health")
def health():
    return {"status": "ok", "service": settings.app_name}


@router.post("/chat")
def chat(payload: ChatRequest, request: Request):
    chat_history = [message.model_dump() for message in payload.history]
    user_id = _user_key(payload.username)
    # Keep compatibility with already-open pages and older cached frontend bundles.
    if "text/event-stream" not in request.headers.get("accept", ""):
        try:
            result = ask(payload.question, chat_history=chat_history, user_id=user_id, search_common=payload.search_common)
            write_audit(payload.question, result.get("source_used", "unknown"), result.get("trace", []))
            answer = result.get("answer")
            if not isinstance(answer, str) or not answer.strip():
                answer = "I found relevant content in your document, but could not generate an answer. Try asking about a specific detail."
            return {
                "answer": answer,
                "source_used": result.get("source_used", "unknown"),
                "trace": result.get("trace", []),
                "citations": result.get("citations", []),
                "rewritten_query": result.get("current_query", payload.question),
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Chat request failed: {exc}") from exc

    def events():
        try:
            for event in stream_ask(
                payload.question,
                chat_history=chat_history,
                user_id=user_id,
                search_common=payload.search_common,
            ):
                if event["type"] == "token":
                    outgoing = event
                else:
                    result = event.get("result", {})
                    write_audit(payload.question, result.get("source_used", "unknown"), result.get("trace", []))
                    answer = result.get("answer")
                    if not isinstance(answer, str) or not answer.strip():
                        answer = "I found relevant content in your document, but could not generate an answer. Try asking about a specific detail."
                    outgoing = {
                        "type": "done",
                        "answer": answer,
                        "source_used": result.get("source_used", "unknown"),
                        "trace": result.get("trace", []),
                        "citations": result.get("citations", []),
                        "rewritten_query": result.get("current_query", payload.question),
                    }
                yield f"data: {json.dumps(outgoing, ensure_ascii=False)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )



@router.post("/ingest")
async def ingest(file: UploadFile = File(...), username: str = "", scope: str = "personal", x_admin_key: str = Header(default="")):
    if len(username.strip()) < 2 or len(username) > 40:
        raise HTTPException(status_code=400, detail="Enter a valid workspace name first")
    if scope not in {"personal", "common"}:
        raise HTTPException(status_code=400, detail="scope must be personal or common")
    if scope == "common" and (not settings.admin_api_key or x_admin_key != settings.admin_api_key):
        raise HTTPException(status_code=401, detail="Admin key required for common knowledge uploads")
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in SUPPORTED:
        raise HTTPException(status_code=400, detail=f"Supported: {', '.join(sorted(SUPPORTED))}")
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    user_id = _user_key(username)
    dest = upload_dir / (f"{user_id}_{Path(file.filename).name}" if scope == "personal" else Path(file.filename).name)
    dest.write_bytes(await file.read())
    docs = load_file(dest)
    if not docs or not any(doc.page_content.strip() for doc in docs):
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="No readable text was extracted. If this is a scanned PDF, OCR is needed before indexing.")
    chunks = chunk_documents(docs)
    for chunk in chunks:
        chunk.metadata["workspace"] = username.strip()
        chunk.metadata["scope"] = scope
        chunk.metadata["filename"] = Path(file.filename).name
    namespace = f"user-{user_id}" if scope == "personal" else settings.common_kb_namespace
    ids = add_documents(chunks, namespace=namespace)
    return {"message": "Document indexed", "file": Path(file.filename).name, "scope": scope, "chunks": len(chunks), "ids_created": len(ids), "index": settings.pinecone_index_name, "namespace": namespace}
