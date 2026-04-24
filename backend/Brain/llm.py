from langchain_groq import ChatGroq
from utils.config import settings

import os

llm = ChatGroq(
    model=settings.MODEL,
    temperature=settings.TEMPERATURE,
    api_key=settings.GROQ)