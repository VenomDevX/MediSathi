import uuid


def op(entity_type, entity_id, payload, operation="create", base_version=None):
    return {
        "operation_id": str(uuid.uuid4()),
        "entity_type": entity_type,
        "entity_id": entity_id,
        "operation": operation,
        "base_version": base_version,
        "payload": payload,
    }


def patient(pid=None, scope="village-rampur", **extra):
    pid = pid or str(uuid.uuid4())
    return {
        "id": pid, "display_name": "Meena Kushwaha", "age_years": 31, "sex": "F", "village": "Rampur",
        "phone": None, "local_identifier": None, "scope_id": scope, "created_by": "u-sunita",
        "created_at": "2026-10-19T09:00:00Z", **extra,
    }


def visit(pid, vid=None, **extra):
    return {
        "id": vid or str(uuid.uuid4()), "patient_id": pid, "worker_id": "u-sunita", "amends_visit_id": None,
        "amendment_reason": None, "visit_time": "2026-10-19T09:30:00Z", "notes": "BP check",
        "observations_json": "{}", "follow_up_at": None, "created_at": "2026-10-19T09:31:00Z", "voided_at": None, **extra,
    }


def push(client, headers, *ops):
    r = client.post("/api/v1/sync/push", json={"operations": list(ops)}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()["results"]


def test_offline_patient_and_visit_sync_and_come_back_on_pull(client, sunita):
    p = patient()
    v = visit(p["id"])
    results = push(client, sunita, op("patient", p["id"], p), op("patient_visit", v["id"], v))
    assert [r["status"] for r in results] == ["accepted", "accepted"]
    assert results[0]["record_version"] == 1
    pulled = client.get("/api/v1/sync/pull", params={"cursor": 0}, headers=sunita).json()
    ids = {(c["entity_type"], c["entity"]["id"]) for c in pulled["changes"]}
    assert ("patient", p["id"]) in ids and ("patient_visit", v["id"]) in ids
    assert pulled["cursor"] > 0


def test_repeating_an_operation_returns_the_first_result_and_creates_no_duplicate(client, sunita):
    p = patient()
    o = op("patient", p["id"], p)
    first = push(client, sunita, o)
    second = push(client, sunita, o)
    assert first == second
    pulled = client.get("/api/v1/sync/pull", params={"cursor": 0}, headers=sunita).json()
    assert sum(1 for c in pulled["changes"] if c["entity"]["id"] == p["id"]) == 1


def test_patient_outside_the_worker_scope_is_rejected(client, sunita):
    p = patient(scope="village-elsewhere")
    [r] = push(client, sunita, op("patient", p["id"], p))
    assert r["status"] == "rejected" and r["error_code"] == "out_of_scope"


def test_visit_for_a_patient_outside_scope_is_rejected(client, sunita, rakesh):
    p = patient(scope="block-mahmudabad")
    push(client, rakesh, op("patient", p["id"], p))
    v = visit(p["id"])
    [r] = push(client, sunita, op("patient_visit", v["id"], v))
    assert r["error_code"] == "out_of_scope"


def test_server_records_the_authenticated_worker_not_the_claimed_one(client, sunita):
    p = patient()
    push(client, sunita, op("patient", p["id"], p))
    v = visit(p["id"], worker_id="u-someone-else")
    push(client, sunita, op("patient_visit", v["id"], v))
    pulled = client.get("/api/v1/sync/pull", params={"cursor": 0}, headers=sunita).json()
    [sv] = [c["entity"] for c in pulled["changes"] if c["entity"]["id"] == v["id"]]
    assert sv["worker_id"] == "u-sunita"


def test_unknown_fields_and_entities_are_rejected(client, sunita):
    p = patient(is_admin=True)
    [r1] = push(client, sunita, op("patient", p["id"], p))
    [r2] = push(client, sunita, op("prescription", "x", {}))
    assert (r1["status"], r1["error_code"]) == ("rejected", "invalid")
    assert (r2["status"], r2["error_code"]) == ("rejected", "unknown_entity")


def test_two_corrections_of_the_same_visit_from_two_devices_never_conflict(client, sunita):
    p = patient()
    v = visit(p["id"])
    push(client, sunita, op("patient", p["id"], p), op("patient_visit", v["id"], v))
    a = visit(p["id"], amends_visit_id=v["id"], amendment_reason="typo", notes="BP 130/85")
    b = visit(p["id"], amends_visit_id=v["id"], amendment_reason="added weight", notes="BP 130/80, 54 kg")
    results = push(client, sunita, op("patient_visit", a["id"], a), op("patient_visit", b["id"], b))
    assert [r["status"] for r in results] == ["accepted", "accepted"]


def test_concurrent_patient_edits_to_different_fields_are_both_applied(client, sunita):
    p = patient()
    push(client, sunita, op("patient", p["id"], p))
    push(client, sunita, op("patient", p["id"], {"id": p["id"], "village": "Rampur Khurd"}, "update", 1))
    [r] = push(client, sunita, op("patient", p["id"], {"id": p["id"], "age_years": 32}, "update", 1))
    assert r["status"] == "accepted" and r["record_version"] == 3
    pulled = client.get("/api/v1/sync/pull", params={"cursor": 0}, headers=sunita).json()
    [sp] = [c["entity"] for c in pulled["changes"] if c["entity"]["id"] == p["id"]]
    assert (sp["village"], sp["age_years"], sp["needs_review"]) == ("Rampur Khurd", 32, False)


def test_concurrent_edits_to_the_same_field_keep_the_server_value_and_flag_for_review(client, sunita):
    p = patient()
    push(client, sunita, op("patient", p["id"], p))
    push(client, sunita, op("patient", p["id"], {"id": p["id"], "display_name": "Meena K."}, "update", 1))
    [r] = push(client, sunita, op("patient", p["id"], {"id": p["id"], "display_name": "Meena Devi"}, "update", 1))
    assert r["status"] == "conflict"
    pulled = client.get("/api/v1/sync/pull", params={"cursor": 0}, headers=sunita).json()
    [sp] = [c["entity"] for c in pulled["changes"] if c["entity"]["id"] == p["id"]]
    assert sp["display_name"] == "Meena K." and sp["needs_review"] is True


def test_stale_report_update_is_a_conflict_not_an_overwrite(client, sunita):
    rid = str(uuid.uuid4())
    report = {"id": rid, "patient_id": None, "file_hash": "abc", "fields": [], "created_by": "u-sunita", "created_at": "2026-10-19T10:00:00Z"}
    push(client, sunita, op("medical_report", rid, report))
    push(client, sunita, op("medical_report", rid, {"id": rid, "patient_id": None, "fields": [{"value": "9.6"}]}, "update", 1))
    [r] = push(client, sunita, op("medical_report", rid, {"id": rid, "patient_id": None, "fields": [{"value": "9.8"}]}, "update", 1))
    assert r["status"] == "conflict"


def test_pull_only_returns_changes_in_the_callers_scope(client, sunita, rakesh):
    mine, theirs = patient(), patient(scope="block-mahmudabad")
    push(client, sunita, op("patient", mine["id"], mine))
    push(client, rakesh, op("patient", theirs["id"], theirs))
    ids = {c["entity"]["id"] for c in client.get("/api/v1/sync/pull", params={"cursor": 0}, headers=sunita).json()["changes"]}
    assert mine["id"] in ids and theirs["id"] not in ids


def test_audit_events_are_stored_with_the_authenticated_actor(client, sunita):
    e = {"id": str(uuid.uuid4()), "actor_id": "u-forged", "action": "donor_contact_reveal", "entity_type": "donor",
         "entity_id": "d-001", "timestamp": "2026-10-19T11:00:00Z", "result": "denied"}
    [r] = push(client, sunita, op("audit_event", e["id"], e))
    assert r["status"] == "accepted"


def test_another_users_operation_id_does_not_return_their_result(client, sunita, rakesh):
    o = op("patient", "x", patient())
    [mine] = push(client, sunita, o)
    assert mine["status"] == "accepted"
    [theirs] = push(client, rakesh, {**o, "payload": {}})
    assert theirs["status"] == "rejected" and theirs["error_code"] == "operation_id_taken"
    assert theirs["entity_id"] == "x" and theirs["record_version"] is None


def test_date_of_birth_and_abha_number_sync_and_are_checked(client, sunita):
    p = patient(date_of_birth="2026-08-20", abha_id="12345678901234")
    assert push(client, sunita, op("patient", p["id"], p))[0]["status"] == "accepted"
    pulled = client.get("/api/v1/sync/pull", params={"cursor": 0}, headers=sunita).json()
    entity = next(c["entity"] for c in pulled["changes"] if c["entity"]["id"] == p["id"])
    assert (entity["date_of_birth"], entity["abha_id"]) == ("2026-08-20", "12345678901234")
    bad = patient(abha_id="12-3456")
    assert push(client, sunita, op("patient", bad["id"], bad))[0]["error_code"] == "invalid"
