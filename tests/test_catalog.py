def test_catalog_tree_shape():
    from fastapi.testclient import TestClient

    from agent import catalog
    from agent.app import app

    catalog.tree.cache_clear()
    r = TestClient(app).get("/catalog").json()
    assert "featured" in r and isinstance(r["sources"], list)
    for s in r["sources"]:
        assert s["count"] == sum(g["count"] for g in s["groups"])
        for g in s["groups"]:
            assert g["count"] == len(g["items"]) and all(i["path"].startswith("data/") for i in g["items"])


def test_group_labels():
    from agent.catalog import _group_and_label

    assert _group_and_label("swiss_dwellings", "x.pdf", "site1000_bldg2082_floor9385", []) == ("Site 1000 · Building 2082", "Floor 9385")
    m = ["bsc-esplanades_1807-ep-ar-v18"]
    assert _group_and_label("ifc_models", "m.ifc", "bsc-esplanades_1807-ep-ar-v18", m) == ("bsc esplanades 1807 ep ar v18", "3D model")
    assert _group_and_label("ifc_models", "p.pdf", "bsc-esplanades_1807-ep-ar-v18_plan-04-4-korrus", m) == ("bsc esplanades 1807 ep ar v18", "Plan 04 4 korrus")
    assert _group_and_label("cubicasa5k", "x", "colorful-11397", []) == ("Colour plans", "Plan 11397")
