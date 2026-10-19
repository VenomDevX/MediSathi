import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["MEDISAATHI_SECRET"] = "test-secret-not-for-production-0123456789"
os.environ["DEMO_PASSWORD"] = "demo-1234"

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client():
    with TestClient(create_app()) as c:
        yield c


def login(client, username):
    r = client.post("/api/v1/auth/login", json={"username": username, "password": "demo-1234"})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def sunita(client):
    """ASHA worker; scope: village-rampur, village-sitapur-kalan."""
    return {"Authorization": f"Bearer {login(client, 'sunita')['access_token']}"}


@pytest.fixture
def rakesh(client):
    """Coordinator; scope: block-mahmudabad."""
    return {"Authorization": f"Bearer {login(client, 'rakesh')['access_token']}"}
