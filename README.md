# IT Support Agentic RAG

An enterprise IT support copilot that answers questions using a **private company knowledge base first**, and falls back to **external web search only when evidence is weak**. The application is built with FastAPI, LangGraph, Pinecone, Groq, and Tavily, and includes a web UI for real-time chat with agent trace visualization.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Installation](#installation)
7. [Configuration](#configuration)
8. [Running the Application](#running-the-application)
9. [Ingesting the Sample Knowledge Base](#ingesting-the-sample-knowledge-base)
10. [API Reference](#api-reference)
11. [Frontend](#frontend)
12. [LangGraph Workflow](#langgraph-workflow)
13. [Security & Auditing](#security--auditing)
14. [Deploying to Render](#deploying-to-render)
15. [Troubleshooting](#troubleshooting)

---

## Overview

This project implements an **Agentic RAG** pipeline for IT support. Instead of always returning the top-k retrieved chunks, the agent:

1. **Routes** each question to either the private knowledge base or a direct conversational response.
2. **Retrieves** relevant chunks from Pinecone using local HuggingFace embeddings.
3. **Grades** the retrieved evidence with a structured LLM judge.
4. **Searches the web** (Tavily) only if the private evidence is weak.
5. **Generates** a grounded answer and appends citations.
6. **Logs** every query, source, and decision trace for auditability.

A demo company IT handbook is included in `data/sample_kb/` so the system is runnable out of the box.

## Architecture

```
User (Browser)
    |
    v
FastAPI App
    |
    |-- POST /api/chat --> LangGraph Agent
    |                       |-- Route question (KB vs direct)
    |                       |-- Retrieve from Pinecone
    |                       |-- Grade evidence
    |                       |-- Web search fallback (Tavily)
    |                       |-- Rewrite & retry
    |                       |-- Generate answer
    |
    |-- POST /api/ingest -> Load file -> Chunk -> Embed -> Pinecone
    |
    |-- GET  /api/health
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| **API** | FastAPI + Uvicorn |
| **Agent** | LangGraph + LangChain |
| **LLM** | Groq (`openai/gpt-oss-20b`) |
| **Web Search** | Tavily |
| **Vector DB** | Pinecone (serverless) |
| **Embeddings** | HuggingFace `sentence-transformers/all-MiniLM-L6-v2` |
| **Frontend** | Jinja2 + HTML/CSS/JS |
| **Storage** | SQLite (audit logs), Pinecone (vectors), local filesystem (uploads) |
| **Config** | Pydantic Settings + `.env` |

## Project Structure

```
c:\Users\Aman\Desktop\RAG\
├── app/
│   ├── main.py                 # FastAPI app, router, static/templates mount
│   ├── api/
│   │   └── routes.py           # /health, /chat, /ingest endpoints
│   ├── core/
│   │   ├── config.py           # Settings, BASE_DIR, env loading
│   │   └── logging.py          # Logging configuration
│   ├── rag/
│   │   ├── state.py            # TypedDict + structured outputs (RouteDecision, EvidenceGrade)
│   │   ├── vectorstore.py      # Pinecone index, embeddings, retriever
│   │   └── workflow.py         # LangGraph nodes + conditional edges + agent_graph
│   └── services/
│       ├── audit.py            # SQLite query audit logging
│       └── ingestion.py        # PDF/TXT/MD/DOCX loading + chunking
├── templates/
│   └── index.html              # Single-page chat UI
├── static/
│   ├── css/style.css
│   └── js/app.js               # Frontend JS (chat, trace, upload modal)
├── data/
│   ├── audit.db                # SQLite audit database
│   └── sample_kb/
│       └── company_it_handbook.md
├── uploads/                    # Uploaded documents staging area
├── tests/                      # (reserved for future tests)
├── run.py                      # Uvicorn entry point
├── ingest_sample_kb.py         # Script to index data/sample_kb into Pinecone
├── requirements.txt            # Python dependencies
├── render.yaml                 # Render deployment config
├── .env                        # API keys and settings (DO NOT commit)
└── .gitignore                  # Git ignore rules
```

## Prerequisites

- **Python 3.12** (recommended for deployment)
- **API keys** for:
  - [Groq](https://console.groq.com/) — LLM inference
  - [Tavily](https://tavily.com/) — web search
  - [Pinecone](https://www.pinecone.io/) — vector database
- **Git** (optional, for cloning)

## Installation

1. **Clone or open the repository**
   ```powershell
   cd c:\Users\Aman\Desktop\RAG
   ```

2. **Create and activate a virtual environment**
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

3. **Install dependencies**
   ```powershell
   pip install -r requirements.txt
   ```

## Configuration

All configuration is managed via a `.env` file at the project root.

Create `.env` (or edit the existing one):

```env
# Groq LLM
GROQ_API_KEY="your-groq-api-key"
groq_model="openai/gpt-oss-20b"

# Tavily web search
TAVILY_API_KEY="your-tavily-api-key"

# Pinecone vector database
PINECONE_API_KEY="your-pinecone-api-key"
pinecone_index_name="it-support-rag"
pinecone_namespace="it-knowledge-base"

# Embeddings
embedding_model="sentence-transformers/all-MiniLM-L6-v2"

# RAG behavior
top_k=4
max_retries=1

# App security
admin_api_key="change-me"

# Storage paths (defaults are fine if you keep the project layout)
# audit_db_path="data/audit.db"
# upload_dir="uploads"
# sample_kb_dir="data/sample_kb"
```

> **Important:** Never commit `.env` to version control. The included `.gitignore` already excludes it.

## Running the Application

```powershell
# Activate your virtual environment if not already active
.\venv\Scripts\Activate.ps1

# Start the server
python run.py
```

The app will be available at **http://127.0.0.1:8080**

## Ingesting the Sample Knowledge Base

Before using the chat for the first time, index the sample documents:

```powershell
python ingest_sample_kb.py
```

You should see output like:
```
Indexed 1 files -> 12 chunks -> 12 Pinecone vectors
```

To upload additional company documents at runtime, use the **"+ Add Company Document"** button in the web UI. The `/api/ingest` endpoint requires the `admin_api_key` header.

## API Reference

### `GET /api/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "IT Support Agentic RAG"
}
```

### `POST /api/chat`

Send a question to the agentic RAG pipeline.

**Request body:**
```json
{
  "question": "How do I connect to the company VPN?"
}
```

**Response body:**
```json
{
  "answer": "Install the NovaSecure VPN client from the internal Software Portal...",
  "source_used": "private_kb",
  "trace": [
    "Router -> KB",
    "Private KB retrieval -> 4 chunks",
    "KB evidence grade -> GOOD",
    "Answer generation -> PRIVATE KB"
  ],
  "citations": [
    {"title": "company_it_handbook.md", "url": "", "type": "private_kb"}
  ],
  "rewritten_query": "How do I connect to the company VPN?"
}
```

Possible `source_used` values:
- `private_kb` — answered from the company knowledge base
- `web_search` — answered from external web evidence
- `direct` — conversational reply, no retrieval needed
- `insufficient_evidence` — the agent could not find reliable evidence

### `POST /api/ingest`

Upload a document for ingestion into Pinecone.

**Headers:**
| Header | Value |
|--------|-------|
| `X-Admin-Key` | The value of `admin_api_key` from `.env` |

**Form data:**
| Field | Description |
|-------|-------------|
| `file` | PDF, TXT, MD, or DOCX file |

**Response:**
```json
{
  "message": "Document indexed",
  "file": "new_policy.pdf",
  "chunks": 24,
  "ids_created": 24
}
```

## Frontend

The UI is a single-page application served by FastAPI using Jinja2Templates.

- **`templates/index.html`** — main layout with sidebar, chat area, and agent trace panel.
- **`static/css/style.css`** — responsive styling.
- **`static/js/app.js`** — handles chat submission, trace rendering, and document upload modal.

Open **http://127.0.0.1:8080** in your browser.

## LangGraph Workflow

The agent graph is defined in `app/rag/workflow.py`.

```
START
  |
  v
route_question
  |
  |-- direct_answer --> END
  |
  v
retrieve_kb
  |
  v
grade_kb
  |
  |-- generate_from_kb --> END
  |
  v
search_web
  |
  v
grade_web
  |
  |-- generate_from_web --> END
  |
  |-- rewrite_query --> retrieve_kb (loop)
  |
  |-- insufficient --> END
```

### Nodes

| Node | Purpose |
|------|---------|
| `route_question` | Decides whether the question needs private knowledge (`kb`) or a direct chat reply (`direct`). |
| `retrieve_kb` | Fetches top-k chunks from Pinecone. |
| `grade_kb` | LLM judge returns `good` or `weak` for the retrieved chunks. |
| `search_web` | Queries Tavily for external evidence. |
| `grade_web` | LLM judge returns `good`, `weak`, or triggers a rewritten query retry. |
| `rewrite_query` | Rephrases the question and retries KB retrieval once. |
| `generate_from_kb` | Answers strictly from private KB with citations. |
| `generate_from_web` | Answers from web evidence with a disclaimer. |
| `direct_answer` | Conversational reply for greetings or simple chat. |
| `insufficient` | Graceful fallback when no reliable evidence is found. |

## Security & Auditing

- **Audit logging:** Every chat request is recorded in `data/audit.db` with timestamp, question, source used, and full decision trace.
- **Admin-protected ingestion:** The `/api/ingest` endpoint requires the `X-Admin-Key` header.
- **Environment secrets:** API keys are loaded from `.env` and never hardcoded.



