from conftest import login


def test_login_returns_tokens_role_and_scope(client):
    body = login(client, "sunita")
    assert body["access_token"] and body["refresh_token"]
    assert body["user"]["role"] == "asha_worker"
    assert body["user"]["assigned_scope"] == ["village-rampur", "village-sitapur-kalan"]
    assert body["server_time"]


def test_wrong_password_is_rejected_without_saying_which_part_was_wrong(client):
    for username in ("sunita", "nobody"):
        r = client.post("/api/v1/auth/login", json={"username": username, "password": "wrong"})
        assert r.status_code == 401
        assert r.json()["detail"] == "invalid_credentials"


def test_protected_endpoints_need_a_valid_token(client):
    assert client.get("/api/v1/sync/pull").status_code == 401
    assert client.get("/api/v1/sync/pull", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_refresh_rotates_and_the_old_refresh_token_stops_working(client):
    first = login(client, "sunita")
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert r.status_code == 200
    assert r.json()["refresh_token"] != first["refresh_token"]
    again = client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert again.status_code == 401


def test_logout_revokes_the_refresh_token(client):
    body = login(client, "sunita")
    assert client.post("/api/v1/auth/logout", json={"refresh_token": body["refresh_token"]}).status_code == 204
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": body["refresh_token"]}).status_code == 401


def test_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}


def test_repeated_wrong_passwords_lock_the_username_for_a_while(client):
    from app.auth import LoginFailures

    for _ in range(LoginFailures.PER_ADDRESS):
        assert client.post("/api/v1/auth/login", json={"username": "sunita", "password": "guess"}).status_code == 401
    r = client.post("/api/v1/auth/login", json={"username": "sunita", "password": "demo-1234"})
    assert r.status_code == 429


def test_the_server_will_not_start_with_a_default_demo_password(monkeypatch):
    import pytest
    from fastapi.testclient import TestClient

    from app.main import create_app

    monkeypatch.delenv("DEMO_PASSWORD")
    with pytest.raises(RuntimeError, match="DEMO_PASSWORD"):
        with TestClient(create_app()):
            pass


def test_failures_from_one_address_do_not_lock_the_user_out_elsewhere():
    from app.auth import LoginFailures

    f = LoginFailures()
    for _ in range(LoginFailures.PER_ADDRESS):
        assert f.attempt("sunita", "6.6.6.6")
    assert not f.attempt("sunita", "6.6.6.6")
    assert f.attempt("sunita", "10.0.0.7")


def test_many_addresses_still_hit_a_per_username_limit():
    from app.auth import LoginFailures

    f = LoginFailures()
    results = [f.attempt("sunita", f"10.0.{i // 250}.{i % 250}") for i in range(LoginFailures.PER_NAME + 1)]
    assert all(results[:-1]) and not results[-1]


def test_a_full_store_never_forgets_a_live_lockout():
    from app.auth import LoginFailures

    f = LoginFailures()
    f.MAX_KEYS = 50
    while f.attempt("sunita", "6.6.6.6"):
        pass
    for i in range(1000):  # many addresses and usernames trying to push sunita's counter out
        f.attempt(f"user{i}", f"10.{i // 250}.{i % 250}.1")
    assert len(f.seen) <= 50
    assert not f.attempt("sunita", "6.6.6.6")


def test_one_address_cannot_try_many_usernames():
    from app.auth import LoginFailures

    f = LoginFailures()
    results = [f.attempt(f"user{i}", "6.6.6.6") for i in range(LoginFailures.PER_ADDRESS_ALL + 1)]
    assert all(results[:-1]) and not results[-1]


def test_successful_logins_do_not_use_up_the_limits():
    from app.auth import LoginFailures

    f = LoginFailures()
    for i in range(LoginFailures.PER_ADDRESS_ALL * 2):  # a busy clinic Wi-Fi: many workers, one address
        assert f.attempt(f"worker{i % 7}", "203.0.113.5")
        f.succeeded(f"worker{i % 7}", "203.0.113.5")
    assert not f.seen
