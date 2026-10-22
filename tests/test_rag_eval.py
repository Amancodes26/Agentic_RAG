
import os
import asyncio

from groq import Groq
from pydantic import BaseModel

from deepeval import evaluate
from deepeval.models import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase
from deepeval.evaluate import AsyncConfig
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualRelevancyMetric,
)

from app.rag.workflow import ask


def _make_groq_schema_compatible(value):
    """Adapt Pydantic's schema to Groq's strict JSON Schema subset."""
    if isinstance(value, dict):
        if value.get("type") == "object" or "properties" in value:
            value["additionalProperties"] = False
            properties = value.get("properties")
            if isinstance(properties, dict):
                required = set(value.get("required", []))
                # Strict mode requires every key. Preserve optional Pydantic
                # fields by allowing null when the model omits their value.
                for name, prop_schema in properties.items():
                    if name not in required:
                        if "anyOf" in prop_schema:
                            variants = prop_schema["anyOf"]
                            if not any(
                                isinstance(item, dict)
                                and item.get("type") == "null"
                                for item in variants
                            ):
                                variants.append({"type": "null"})
                        elif prop_schema.get("type"):
                            prop_schema["type"] = [prop_schema["type"], "null"]
                value["required"] = list(properties)
        for child in value.values():
            _make_groq_schema_compatible(child)
    elif isinstance(value, list):
        for child in value:
            _make_groq_schema_compatible(child)
    return value


def _fill_optional_fields(data, model_type):
    """Fill omitted optional Pydantic fields before validating Groq output."""
    if not isinstance(data, dict) or not isinstance(model_type, type):
        return

    for name, field in model_type.model_fields.items():
        if name not in data and not field.is_required():
            data[name] = None if field.default is None else field.default


class GroqJudge(DeepEvalBaseLLM):
    """Use Groq as DeepEval's evaluation judge."""

    def __init__(self):
        api_key = os.getenv("GROQ_API_KEY")

        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not configured")

        self.client = Groq(api_key=api_key, max_retries=5)
        self.model_name = "openai/gpt-oss-20b"

    def load_model(self):
        return self.client

    def get_model_name(self):
        return self.model_name

    def generate(
        self, prompt: str, schema: type[BaseModel] | None = None
    ):
        messages = [{"role": "user", "content": prompt}]

        kwargs = {
            "model": self.model_name,
            "messages": messages,
            "temperature": 0,
            # Judge responses are short; a large cap reserves unnecessary TPM.
            "max_completion_tokens": 1024,
        }

        if schema is not None:
            json_schema = _make_groq_schema_compatible(schema.model_json_schema())
            messages[0]["content"] += (
                "\nReturn every key required by the JSON schema. For an "
                "optional explanation such as 'reason' that does not apply, "
                "include the key with a null value."
            )
            kwargs["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "deepeval_output",
                    "strict": True,
                    "schema": json_schema,
                },
            }
    

        for attempt in range(2):
            try:
                response = self.client.chat.completions.create(**kwargs)
            except Exception as exc:
                body = getattr(exc, "body", None) or {}
                error = body.get("error", {}) if isinstance(body, dict) else {}
                if (
                    attempt == 1
                    or getattr(exc, "status_code", None) != 400
                    or error.get("code") != "json_validate_failed"
                ):
                    raise

                messages.append({
                    "role": "assistant",
                    "content": error.get("failed_generation", ""),
                })
                messages.append({
                    "role": "user",
                    "content": (
                        "Your last JSON was rejected because it omitted "
                        "required keys. Return the complete corrected JSON. "
                        "Include every key for every object; use null for an "
                        "optional value that does not apply."
                    ),
                })
                continue
            content = response.choices[0].message.content or ""

            if schema is None:
                return content

            try:
                return schema.model_validate_json(content)
            except Exception:
                if attempt == 1:
                    # DeepEval schemas frequently use Optional fields. Groq
                    # may omit these even with nullable fields marked required.
                    try:
                        import json

                        data = json.loads(content)
                        _fill_optional_fields(data, schema)
                        return schema.model_validate(data)
                    except Exception:
                        raise

                messages.append({
                    "role": "assistant",
                    "content": content,
                })
                messages.append({
                    "role": "user",
                    "content": (
                        "Your previous response was invalid. Return a "
                        "complete, valid JSON object matching the schema. "
                        "Keep the response concise.\n"
                        + str(json_schema)
                    ),
                })

        raise RuntimeError("Groq could not produce valid JSON")



    async def a_generate(
        self, prompt: str, schema: type[BaseModel] | None = None
    ):
        return await asyncio.to_thread(self.generate, prompt, schema)


QUESTIONS = [
    "How do I connect to the company VPN?",
]


def _evaluation_context(result):
    """Return the evidence that the workflow actually used for its answer."""
    if result.get("source_used") == "web_search":
        web_results = result.get("web_results", "")
        return [web_results] if web_results else []

    return [
        doc.page_content
        for doc in result.get("kb_docs", [])
        if getattr(doc, "page_content", "")
    ]


def test_agentic_rag():
    test_cases = []

    for question in QUESTIONS:
        result = ask(question)

        test_cases.append(
            LLMTestCase(
                input=question,
                actual_output=result.get("answer", ""),
                retrieval_context=_evaluation_context(result),
            )
        )

    judge = GroqJudge()

    metrics = [
        AnswerRelevancyMetric(threshold=0.7, model=judge),
        FaithfulnessMetric(threshold=0.7, model=judge),
        ContextualRelevancyMetric(threshold=0.7, model=judge),
    ]

    evaluate(
        test_cases=test_cases,
        metrics=metrics,
        async_config=AsyncConfig(
            run_async=False,
            max_concurrent=1,
            throttle_value=2,
        ),
    )


if __name__ == "__main__":
    test_agentic_rag()
