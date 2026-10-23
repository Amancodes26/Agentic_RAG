
import time

from pinecone import Pinecone, ServerlessSpec
from langchain_pinecone import PineconeVectorStore

from app.core.config import get_settings

settings = get_settings()

_embeddings = None
_vectorstore = None

EMBEDDING_DIMENSIONS = {
    "all-minilm-l6-v2": 384,
}


def get_embedding_dimension(model_name: str | None = None) -> int:
    name = (model_name or settings.embedding_model).strip().lower()

    if "all-minilm-l6-v2" in name:
        return 384

    raise ValueError(
        f"Unsupported embedding model: {name}. "
        "Add its actual output dimension before using it."
    )


def get_embeddings():
    global _embeddings

    if _embeddings is None:
        # Keep the web app's startup path lightweight. Loading this integration
        # imports PyTorch/Transformers, which is only needed for KB retrieval
        # and ingestion and can delay or exhaust memory during deployment boot.
        from langchain_huggingface import HuggingFaceEmbeddings

        _embeddings = HuggingFaceEmbeddings(
            model_name=settings.embedding_model,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )

    return _embeddings


def ensure_index():
    if not settings.pinecone_api_key:
        raise RuntimeError("PINECONE_API_KEY is missing")

    pc = Pinecone(api_key=settings.pinecone_api_key)
    dimension = get_embedding_dimension()

    existing = pc.list_indexes().names()

    if settings.pinecone_index_name in existing:
        info = pc.describe_index(settings.pinecone_index_name)

        if info.dimension != dimension:
            raise RuntimeError(
                f"Pinecone index dimension is {info.dimension}, "
                f"but the embedding model produces {dimension}. "
                "Use a compatible index or create a new index. "
                "This application will not delete your existing index."
            )
    else:
        pc.create_index(
            name=settings.pinecone_index_name,
            dimension=dimension,
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region="us-east-1",
            ),
        )

        while not pc.describe_index(
            settings.pinecone_index_name
        ).status["ready"]:
            time.sleep(1)

    return pc.Index(settings.pinecone_index_name)


def get_vectorstore(namespace: str | None = None):
    global _vectorstore
    namespace = namespace or settings.common_kb_namespace or settings.pinecone_namespace
    if namespace == settings.pinecone_namespace:
        if _vectorstore is None:
            _vectorstore = PineconeVectorStore(index=ensure_index(), embedding=get_embeddings(), namespace=namespace)
        return _vectorstore
    return PineconeVectorStore(index=ensure_index(), embedding=get_embeddings(), namespace=namespace)


def get_retriever(namespace: str | None = None):
    return get_vectorstore(namespace).as_retriever(search_kwargs={"k": settings.top_k})


def similarity_search_with_score(query: str, namespace: str, k: int | None = None):
    return get_vectorstore(namespace).similarity_search_with_score(query, k=k or settings.top_k)


def add_documents(chunks, namespace: str | None = None):
    return get_vectorstore(namespace).add_documents(chunks)
