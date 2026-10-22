import json

import pytest

from app import auth

NEW = {"display_name": "Asha Devi", "username": "Asha.Devi", "password": "long-enough-1"}


def test_sign_up_creates_a_citizen_and_signs_in(client):
    r = client.post("/api/v1/auth/signup", json=NEW)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"] and body["refresh_token"]
    assert body["user"]["display_name"] == "Asha Devi"
    assert body["user"]["role"] == "citizen" and body["user"]["assigned_scope"] == []
    again = client.post("/api/v1/auth/login", json={"username": "asha.devi", "password": "long-enough-1"})
    assert again.status_code == 200


def test_sign_up_cannot_choose_a_role(client):
    r = client.post("/api/v1/auth/signup", json={**NEW, "role": "admin", "scope": ["block-mahmudabad"]})
    assert r.json()["user"]["role"] == "citizen" and r.json()["user"]["assigned_scope"] == []


def test_a_taken_username_is_refused(client):
    assert client.post("/api/v1/auth/signup", json={**NEW, "username": "sunita"}).status_code == 409


@pytest.mark.parametrize("change", [{"password": "short"}, {"username": "ab"}, {"username": "google:123"},
                                    {"username": "has space"}, {"display_name": ""}, {"password": "x" * 257}])
def test_bad_sign_up_details_are_refused(client, change):
    assert client.post("/api/v1/auth/signup", json={**NEW, **change}).status_code == 422


def test_sign_ups_are_limited_per_address(client):
    codes = [client.post("/api/v1/auth/signup", json={**NEW, "username": f"user{i}"}).status_code for i in range(auth.LoginFailures.PER_ADDRESS + 1)]
    assert codes[:-1] == [200] * auth.LoginFailures.PER_ADDRESS and codes[-1] == 429


GOOD = {"aud": "web-client.apps.googleusercontent.com", "iss": "https://accounts.google.com", "sub": "1234567890",
        "email": "asha@example.com", "email_verified": "true", "name": "Asha Devi", "exp": "9999999999"}


@pytest.fixture
def google(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", GOOD["aud"])
    claims = dict(GOOD)
    seen = []

    def fake(url, timeout):
        seen.append(url)

        class Res:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self):
                return json.dumps(claims).encode()

        return Res()

    monkeypatch.setattr(auth, "urlopen", fake)
    return claims


def test_google_sign_in_creates_a_citizen_once(client, google):
    first = client.post("/api/v1/auth/google", json={"id_token": "tok"})
    assert first.status_code == 200, first.text
    assert first.json()["user"]["role"] == "citizen" and first.json()["user"]["display_name"] == "Asha Devi"
    second = client.post("/api/v1/auth/google", json={"id_token": "tok"})
    assert second.json()["user"]["id"] == first.json()["user"]["id"]


@pytest.mark.parametrize("bad", [{"aud": "someone-else"}, {"iss": "https://evil.example"}, {"email_verified": "false"}, {"exp": "1"}])
def test_google_tokens_for_other_apps_or_unverified_emails_are_refused(client, google, bad):
    google.update(bad)
    assert client.post("/api/v1/auth/google", json={"id_token": "tok"}).status_code == 401


def test_google_sign_in_is_off_without_a_client_id(client, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    assert client.post("/api/v1/auth/google", json={"id_token": "tok"}).status_code == 503


def test_a_google_account_cannot_be_reached_with_a_password(client, google):
    client.post("/api/v1/auth/google", json={"id_token": "tok"})
    r = client.post("/api/v1/auth/login", json={"username": "google:1234567890", "password": ""})
    assert r.status_code == 401
