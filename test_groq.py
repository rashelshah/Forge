import os, sys
from dotenv import load_dotenv
load_dotenv(".env")
from langchain_openai import ChatOpenAI
api_key = os.getenv("GROQ_API_KEY")
try:
    chat = ChatOpenAI(model="qwen/qwen3.8-27b", base_url="https://api.groq.com/openai/v1", api_key=api_key)
    print("qwen:", chat.invoke("hello").content)
except Exception as e:
    print("qwen error:", e)
