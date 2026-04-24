from langchain_groq import ChatGroq
import os
from dotenv import load_dotenv

load_dotenv()


class _LazyChatGroq:
    """Lazy wrapper so app imports succeed even if model env is not configured yet."""

    def __init__(self):
        self._client = None

    def _get_client(self) -> ChatGroq:
        if self._client is None:
            model = os.getenv("MODEL", "llama-3.3-70b-versatile")
            temperature = float(os.getenv("TEMPERATURE", "0"))
            api_key = os.getenv("GROQ")
            if not api_key:
                raise RuntimeError(
                    "GROQ environment variable is required for agent execution."
                )
            self._client = ChatGroq(
                model=model,
                temperature=temperature,
                api_key=api_key,
            )
        return self._client

    def invoke(self, *args, **kwargs):
        return self._get_client().invoke(*args, **kwargs)

    def bind_tools(self, *args, **kwargs):
        return self._get_client().bind_tools(*args, **kwargs)


llm = _LazyChatGroq()
