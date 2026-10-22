
import os
from functools import lru_cache

from groq import Groq


PROMPT_GUARD_MODEL = "meta-llama/llama-prompt-guard-2-22m"


@lru_cache(maxsize=1)
def get_guard_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured")

    return Groq(api_key=api_key)


def detect_prompt_attack(text: str) -> bool:
    """
    Return True when the classifier identifies a prompt attack.

    Confirm the exact response format against the deployed model
    before relying on this function in production.
    """
    if not text or not text.strip():
        return False

    response = get_guard_client().chat.completions.create(
        model=PROMPT_GUARD_MODEL,
        messages=[{"role": "user", "content": text[:1800]}],
        temperature=0,
        max_completion_tokens=32,
    )

    label = (
        response.choices[0].message.content or ""
    ).strip().lower()

    if label in {"unsafe", "malicious", "attack"}:
        return True

    if label in {"safe", "benign"}:
        return False

    # Fail closed if the response cannot be interpreted.
    raise RuntimeError(
        f"Unexpected Prompt Guard response: {label!r}"
    )
