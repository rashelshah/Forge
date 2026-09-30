import os
from dotenv import load_dotenv
load_dotenv(".env")
from langchain_openai import ChatOpenAI
api_key = os.getenv("GROQ_API_KEY")
for max_tok in [2000, 4000, 6000, 8000, 16000]:
    try:
        chat = ChatOpenAI(model="openai/gpt-oss-20b", base_url="https://api.groq.com/openai/v1", api_key=api_key, max_tokens=max_tok)
        print(f"max_tok={max_tok}:", chat.invoke("hello").content[:10])
    except Exception as e:
        print(f"max_tok={max_tok} error:", e)
