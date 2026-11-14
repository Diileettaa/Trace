def test_catalog_lists_fixture_drawings():
    from fastapi.testclient import TestClient

    from agent import catalog
    from agent.app import app

    catalog.catalog.cache_clear()
    r = TestClient(app).get("/catalog").json()
    assert "featured" in r and isinstance(r["sources"], list)
    for s in r["sources"]:
        assert s["count"] == len(s["items"]) and all(i["path"].startswith("data/") for i in s["items"])
