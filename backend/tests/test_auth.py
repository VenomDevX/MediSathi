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
