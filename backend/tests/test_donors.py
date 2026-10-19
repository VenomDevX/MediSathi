def directory(client, headers):
    r = client.get("/api/v1/donors/directory", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_directory_coarsens_coordinates_to_about_1_km(client, sunita):
    for d in directory(client, sunita)["donors"]:
        if d["approx_latitude"] is not None:
            assert round(d["approx_latitude"], 2) == d["approx_latitude"]
            assert round(d["approx_longitude"], 2) == d["approx_longitude"]


def test_asha_workers_never_receive_donor_contacts(client, sunita):
    assert all(d["contact"] is None for d in directory(client, sunita)["donors"])


def test_coordinators_receive_contacts(client, rakesh):
    donors = directory(client, rakesh)["donors"]
    assert donors and all(d["contact"] for d in donors)


def test_withdrawn_or_inactive_donors_are_left_out(client, rakesh):
    from app.db import Donor

    with client.app.state.sessions() as db:
        db.add(Donor(id="d-withdrawn", blood_group="O+", latitude=27.5, longitude=80.7, contact="x", consent_status="withdrawn"))
        db.add(Donor(id="d-inactive", blood_group="O+", latitude=27.5, longitude=80.7, contact="x", consent_status="granted", registration_status="deactivated"))
        db.commit()
    ids = {d["id"] for d in directory(client, rakesh)["donors"]}
    assert "d-withdrawn" not in ids and "d-inactive" not in ids


def test_guidance_manifest_reports_the_content_version(client, sunita):
    assert client.get("/api/v1/guidance/manifest", headers=sunita).json()["version"]
