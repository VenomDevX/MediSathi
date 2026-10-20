"""Blood requests: a donor's number reaches a requester only after that donor accepts that request."""

API = "/api/v1/blood"


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


def register(client, group="O+", contact="Demo donor (not a real number)", consent=True, **extra):
    return client.post(f"{API}/donors", json={"blood_group": group, "locality_label": "Sitapur", "latitude": 27.57, "longitude": 80.68, "contact": contact, "consent": consent, **extra})


def ask(client, group="O+"):
    r = client.post(f"{API}/requests", json={"blood_group": group, "locality_label": "Sitapur", "latitude": 27.57, "longitude": 80.68, "note": "Surgery at district hospital"})
    assert r.status_code == 201, r.text
    return r.json()


def test_registration_needs_consent(client):
    assert register(client, consent=False).status_code == 422


def test_registration_rejects_unknown_blood_group(client):
    assert register(client, group="Z+").status_code == 422


def test_matching_donor_sees_the_request_without_requester_details(client):
    donor = register(client).json()
    req = ask(client)
    seen = client.get(f"{API}/requests/for-me", headers=bearer(donor["token"])).json()["requests"]
    assert [r["id"] for r in seen] == [req["id"]]
    assert "token" not in seen[0] and seen[0]["note"] == "Surgery at district hospital"


def test_other_blood_groups_do_not_see_the_request(client):
    donor = register(client, group="B-").json()
    ask(client, "O+")
    assert client.get(f"{API}/requests/for-me", headers=bearer(donor["token"])).json()["requests"] == []


def test_withdrawn_donor_sees_nothing_and_their_number_is_erased(client):
    donor = register(client).json()
    ask(client)
    assert client.post(f"{API}/donors/me/withdraw", headers=bearer(donor["token"])).status_code == 204
    assert client.get(f"{API}/requests/for-me", headers=bearer(donor["token"])).status_code == 401
    from app.db import Donor

    with client.app.state.sessions() as db:
        row = db.get(Donor, donor["donor_id"])
        assert row.consent_status == "withdrawn" and row.contact is None


def test_contact_reaches_requester_only_after_the_donor_accepts(client):
    donor = register(client, contact="Asha demo contact").json()
    req = ask(client)
    status = client.get(f"{API}/requests/{req['id']}", headers=bearer(req["token"])).json()
    assert status["donors"] == []

    r = client.post(f"{API}/requests/{req['id']}/respond", json={"accept": True}, headers=bearer(donor["token"]))
    assert r.status_code == 204
    status = client.get(f"{API}/requests/{req['id']}", headers=bearer(req["token"])).json()
    assert [d["contact"] for d in status["donors"]] == ["Asha demo contact"]


def test_declining_shares_nothing(client):
    donor = register(client).json()
    req = ask(client)
    client.post(f"{API}/requests/{req['id']}/respond", json={"accept": False}, headers=bearer(donor["token"]))
    assert client.get(f"{API}/requests/{req['id']}", headers=bearer(req["token"])).json()["donors"] == []


def test_every_share_is_audited(client):
    from sqlalchemy import select

    from app.db import AuditEvent

    donor = register(client).json()
    req = ask(client)
    client.post(f"{API}/requests/{req['id']}/respond", json={"accept": True}, headers=bearer(donor["token"]))
    with client.app.state.sessions() as db:
        events = db.scalars(select(AuditEvent).where(AuditEvent.action == "donor_contact_shared")).all()
    assert [(e.actor_id, e.entity_id) for e in events] == [(donor["donor_id"], req["id"])]


def test_only_the_requester_can_read_the_request(client):
    donor = register(client).json()
    req = ask(client)
    other = ask(client)
    client.post(f"{API}/requests/{req['id']}/respond", json={"accept": True}, headers=bearer(donor["token"]))
    assert client.get(f"{API}/requests/{req['id']}", headers=bearer(other["token"])).status_code == 404
    assert client.get(f"{API}/requests/{req['id']}", headers=bearer(donor["token"])).status_code == 404
    assert client.get(f"{API}/requests/{req['id']}").status_code == 401


def test_donor_cannot_answer_a_request_for_another_group(client):
    donor = register(client, group="A+").json()
    req = ask(client, "O+")
    r = client.post(f"{API}/requests/{req['id']}/respond", json={"accept": True}, headers=bearer(donor["token"]))
    assert r.status_code == 404


def test_closed_request_disappears_for_donors(client):
    donor = register(client).json()
    req = ask(client)
    assert client.post(f"{API}/requests/{req['id']}/close", headers=bearer(req["token"])).status_code == 204
    assert client.get(f"{API}/requests/for-me", headers=bearer(donor["token"])).json()["requests"] == []
    r = client.post(f"{API}/requests/{req['id']}/respond", json={"accept": True}, headers=bearer(donor["token"]))
    assert r.status_code == 404


def test_donor_sees_their_own_answer(client):
    donor = register(client).json()
    req = ask(client)
    client.post(f"{API}/requests/{req['id']}/respond", json={"accept": True}, headers=bearer(donor["token"]))
    seen = client.get(f"{API}/requests/for-me", headers=bearer(donor["token"])).json()["requests"]
    assert seen[0]["my_answer"] == "accepted"


def test_tokens_are_not_stored_in_plain_text(client):
    from sqlalchemy import select

    from app.db import BloodRequest, DonorToken

    donor = register(client).json()
    req = ask(client)
    with client.app.state.sessions() as db:
        assert donor["token"] not in {t.token_hash for t in db.scalars(select(DonorToken))}
        assert db.get(BloodRequest, req["id"]).token_hash != req["token"]


def test_self_registered_donors_never_appear_in_the_coordinator_directory(client, rakesh):
    donor = register(client, contact="Self-registered demo contact").json()
    donors = client.get("/api/v1/donors/directory", headers=rakesh).json()["donors"]
    assert donor["donor_id"] not in {d["id"] for d in donors}
    assert "Self-registered demo contact" not in {d["contact"] for d in donors}
