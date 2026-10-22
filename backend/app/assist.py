"""Optional online explanation with Google Gemini (prototype).

The app sends only the question, its language and the ids of the matched library cards; this server writes the
prompt from its own template and its own copy of the library (the same prompt as src/assistant/models.ts). So no
patient records or reports are sent, and the endpoint cannot be used to run arbitrary prompts on our key. The
client still runs its guard on the answer and falls back to the library text on any failure.
"""

import json
import os
import threading
import time
from collections import deque
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError
from urllib.request import Request as Outgoing, urlopen

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from .auth import _network

router = APIRouter(prefix="/api/v1")

PER_HOUR = 30  # per address (IPv6 per /64)
PER_DAY = 500  # all addresses together: caps what anyone can spend on our key
MAX_ADDRESSES = 10_000
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
FALLBACKS = ["gemini-3.5-flash", "gemini-3.1-flash-lite"]  # tried in order when a model is overloaded

# ponytail: in-memory, per-process limits; move to the database or a shared cache if the API runs on more than one process.
calls: dict[str, deque] = {}
day: deque = deque()
lock = threading.Lock()


LIBRARY = {g["id"]: g for g in json.loads((Path(__file__).resolve().parents[2] / "content" / "guidance.json").read_text(encoding="utf8"))}
SCRIPT = {"hi": "Hindi (Devanagari script)", "en": "English", "ta": "Tamil (Tamil script)", "te": "Telugu (Telugu script)",
          "bn": "Bengali (Bengali script)", "mr": "Marathi (Devanagari script)", "gu": "Gujarati (Gujarati script)",
          "kn": "Kannada (Kannada script)", "ml": "Malayalam (Malayalam script)", "pa": "Punjabi (Gurmukhi script)",
          "or": "Odia (Odia script)", "as": "Assamese (Bengali script)", "ur": "Urdu (Nastaliq script)"}  # i18n.tsx LANG_META


class Prompt(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    lang: Literal["hi", "en", "ta", "te", "bn", "mr", "gu", "kn", "ml", "pa", "or", "as", "ur"]
    sources: list[str] = Field(min_length=1, max_length=3)

    @field_validator("sources")
    @classmethod
    def known(cls, ids: list[str]) -> list[str]:
        if any(i not in LIBRARY for i in ids):
            raise ValueError("unknown library card")
        return ids


def _system(lang: str) -> str:
    return f"""You are MediSaathi, a friendly helper that explains first-aid and home-care information to families in India.
Rules:
1. Use ONLY the numbered sources. Do not add facts, medicines, numbers or advice that are not in them.
2. Never say what illness the person has. Never name a medicine or a dose.
3. Reply in {SCRIPT[lang]}, in simple everyday words: 3 to 6 short bullet points.
4. After each point, write the source number, like [1].
5. Finish with when to see a doctor, taken from the sources.
6. If the sources do not answer the question, reply with exactly: NO_ANSWER"""


def _user(p: Prompt) -> str:
    text = lambda g: "\n".join(x for x in (g["title"], g["summary"], g["content"], g.get("limitations")) if x)
    numbered = "\n\n".join(f"[{i + 1}] {text(LIBRARY[s])}" for i, s in enumerate(p.sources))
    return f"Sources:\n{numbered}\n\nQuestion: {p.question}"


def _allow(address: str) -> bool:
    now = time.monotonic()
    with lock:
        while day and now - day[0] > 86400:
            day.popleft()
        if len(day) >= PER_DAY:
            return False
        key = _network(address)
        if key not in calls:
            if len(calls) >= MAX_ADDRESSES:
                for k in [k for k, q in calls.items() if now - q[-1] > 3600]:  # windows that have fully passed
                    del calls[k]
            if len(calls) >= MAX_ADDRESSES:
                return False  # never evict a live window: that would reset its count
            calls[key] = deque()
        q = calls[key]
        while q and now - q[0] > 3600:
            q.popleft()
        if len(q) >= PER_HOUR:
            return False
        q.append(now)
        day.append(now)
        return True


@router.post("/assist")
def explain(p: Prompt, request: Request):
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise HTTPException(503, "online_ai_off")
    if not _allow(request.client.host if request.client else "unknown"):
        raise HTTPException(429, "too_many_requests")
    body = {
        "systemInstruction": {"parts": [{"text": _system(p.lang)}]},
        "contents": [{"role": "user", "parts": [{"text": _user(p)}]}],
        "generationConfig": {"maxOutputTokens": 1024, "thinkingConfig": {"thinkingLevel": "LOW"}},
    }
    models = list(dict.fromkeys([os.environ.get("GEMINI_MODEL") or "gemini-3.8-flash", *FALLBACKS]))
    for model in models:
        req = Outgoing(URL.format(model=model), data=json.dumps(body).encode(),
                       headers={"Content-Type": "application/json", "x-goog-api-key": key}, method="POST")
        try:
            with urlopen(req, timeout=20) as res:
                data = json.loads(res.read())
            parts = data["candidates"][0]["content"]["parts"]
            return {"text": "".join(x.get("text", "") for x in parts if not x.get("thought"))}
        except HTTPError as e:
            if 400 <= e.code < 500 and e.code != 429:
                break  # a bad request will not get better on another model
        except Exception:
            pass  # overloaded models also just hang until the timeout: try the next one
    raise HTTPException(502, "online_ai_failed")  # no upstream detail: it can echo the request
