from typing import List, Literal
from typing_extensions import TypedDict
from pydantic import BaseModel, Field
from langchain_core.documents import Document

class RouteDecision(BaseModel):
    route: Literal["kb", "direct", "out_of_scope"] = Field(
        description=(
            "kb for IT support/company document questions; direct only for greetings, "
            "thanks, and brief personal conversation; out_of_scope for unrelated requests"
        )
    )
    web_search_allowed: bool = Field(
        default=False,
        description="True only for public/current information; false for private company or personal documents",
    )

class EvidenceGrade(BaseModel):
    grade: Literal["good", "weak"] = Field(description="Whether evidence is sufficient to answer")

class AgentState(TypedDict):
    question: str
    current_query: str
    chat_history: List[dict]
    web_search_allowed: bool
    kb_docs: List[Document]
    web_results: str
    kb_grade: str
    web_grade: str
    answer: str
    source_used: str
    retry_count: int
    trace: List[str]
    citations: List[dict]
