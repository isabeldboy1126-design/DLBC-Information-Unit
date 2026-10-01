"""New review/archival routes reject unauthenticated and foreign-account access."""
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database.session_repo import session_repo

@pytest.mark.asyncio
async def test_review_archive_and_processing_boundaries():
    suffix = uuid.uuid4().hex
    a = {"Authorization": f"Bearer test_token_upgrade_a_{suffix}:a@example.test"}
    b = {"Authorization": f"Bearer test_token_upgrade_b_{suffix}:b@example.test"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        for headers in (a, b):
            result = await client.post("/api/auth/onboarding/complete", headers=headers,
                json={"sector":"Adult", "church_state":"Lagos", "terminal_level":"state_headquarters"})
            assert result.status_code == 200
        response = await client.post("/api/sessions", headers=a, json={"title":"Synthetic private session", "raw_text":"Original synthetic text"})
        assert response.status_code == 200
        sid = response.json()["session"]["session_id"]
        routes = [
            ("GET", f"/api/final-report/sessions/{sid}", None),
            ("POST", f"/api/final-report/sessions/{sid}/approve", {"revision_id":"foreign-revision"}),
            ("POST", f"/api/final-report/sessions/{sid}/finalize", {}),
            ("GET", f"/api/final-report/sessions/{sid}/download", None),
            ("GET", f"/api/editing/sessions/{sid}/report", None),
            ("GET", f"/api/proofreading/sessions/{sid}/report", None),
            ("GET", f"/api/reporting/sessions/{sid}/reports", None),
            ("POST", f"/api/sessions/{sid}/archive", None),
            ("POST", f"/api/sessions/{sid}/restore", None),
        ]
        for method, path, body in routes:
            kwargs = {"json":body} if body is not None else {}
            assert (await client.request(method, path, **kwargs)).status_code == 401, path
            assert (await client.request(method, path, headers=b, **kwargs)).status_code == 404, path
        assert (await client.post(f"/api/sessions/{sid}/archive", headers=a)).status_code == 200
        assert sid in {row["session_id"] for row in (await client.get("/api/sessions?include_archived=true", headers=a)).json()["sessions"]}
        assert sid not in {row["session_id"] for row in (await client.get("/api/sessions?include_archived=true", headers=b)).json()["sessions"]}
        assert (await client.post(f"/api/sessions/{sid}/restore", headers=a)).status_code == 200
        current = await session_repo.get_session(sid)
        assert current["raw_text"] == "Original synthetic text"
        assert not current["is_archived"]
        # Initialization cannot rebind an existing ID to another account.
        other = (await client.get("/api/auth/me", headers=b)).json()["account"]["id"]
        with pytest.raises(ValueError):
            await session_repo.create_session(sid, raw_text="Overwrite attempt", account_id=other)
        assert (await session_repo.get_session(sid))["raw_text"] == "Original synthetic text"
