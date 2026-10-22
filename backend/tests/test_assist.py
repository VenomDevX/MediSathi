import json

import pytest

from app import assist

PROMPT = {"question": "my child has fever", "lang": "en", "sources": ["fever-en"]}


class FakeGemini:
    """Stands in for urllib's urlopen: records the request and answers like the Gemini REST API."""

    def __init__(self, parts=None, fail=False):
        self.parts = parts or [{"text": "Rest and drink water [1]."}]
        self.fail = fail
        self.requests = []

    def __call__(self, req, timeout):
        self.requests.append(req)
        if self.fail:
            raise OSError("network down")
        body = json.dumps({"candidates": [{"content": {"parts": self.parts}}]}).encode()

        class Res:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return body

        return Res()


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    assist.calls.clear()
    fake = FakeGemini()
    monkeypatch.setattr(assist, "urlopen", fake)
    return fake


def sent(gemini, i=0):
    data = json.loads(gemini.requests[i].data)
    return data["systemInstruction"]["parts"][0]["text"], data["contents"][0]["parts"][0]["text"]


def test_asks_gemini_with_the_server_key_and_returns_the_text(client, gemini):
    r = client.post("/api/v1/assist", json=PROMPT)
    assert r.status_code == 200, r.text
    assert r.json() == {"text": "Rest and drink water [1]."}
    assert gemini.requests[0].get_header("X-goog-api-key") == "test-key"  # the key never reaches the client


def test_the_server_writes_the_prompt_from_its_own_template_and_library(client, gemini):
    """So the endpoint cannot be used to run arbitrary prompts on our key."""
    client.post("/api/v1/assist", json=PROMPT)
    system, user = sent(gemini)
    assert "Use ONLY the numbered sources" in system
    assert user.startswith("Sources:\n[1] ") and "fever" in user.lower()
    assert user.endswith("Question: my child has fever")


def test_hindi_answers_are_asked_for_in_devanagari(client, gemini):
    client.post("/api/v1/assist", json={**PROMPT, "lang": "hi"})
    assert "Devanagari" in sent(gemini)[0]


def test_drops_thought_parts(client, gemini):
    gemini.parts = [{"text": "thinking...", "thought": True}, {"text": "Answer [1]."}]
    assert client.post("/api/v1/assist", json=PROMPT).json() == {"text": "Answer [1]."}


def test_off_without_a_key(client, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert client.post("/api/v1/assist", json=PROMPT).status_code == 503


def test_upstream_failure_is_a_502_not_a_crash(client, gemini):
    gemini.fail = True
    assert client.post("/api/v1/assist", json=PROMPT).status_code == 502


def test_accepts_only_short_questions_about_known_library_cards(client, gemini):
    assert client.post("/api/v1/assist", json={**PROMPT, "question": "x" * 501}).status_code == 422
    assert client.post("/api/v1/assist", json={**PROMPT, "sources": ["not-a-card"]}).status_code == 422
    assert client.post("/api/v1/assist", json={**PROMPT, "sources": []}).status_code == 422
    assert client.post("/api/v1/assist", json={**PROMPT, "sources": ["fever-en"] * 4}).status_code == 422
    assert not gemini.requests


def test_limits_calls_per_address(client, gemini):
    for _ in range(assist.PER_HOUR):
        assert client.post("/api/v1/assist", json=PROMPT).status_code == 200
    assert client.post("/api/v1/assist", json=PROMPT).status_code == 429
    assert len(gemini.requests) == assist.PER_HOUR
