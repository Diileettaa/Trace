"""Free-form question -> structured query, for questions the dataset templates do not recognise.

    classify(path, question) -> {"intent", "category", "scope", "confidence", "reasons", "closest"}

Rule-based and multilingual (en, zh, fi, sv, de, fr, it): no model call, so it costs nothing and never invents
a number. Names in the question (room numbers, apartment letters, storey names, room labels) are matched against
what the drawing actually contains (query.inventory), so 'kitchen' finds 'Küche' / 'Cuisine' / 'Cucina' and
'level 1' finds the storey 'Level 1'. When the question stays ambiguous, confidence is low and the caller returns
'unrecognised_question' with the closest supported question types instead of guessing."""
import re, unicodedata

INTENT = [  # first match wins
    ("volume", r"m³|m3\b|\bvolume|volumen|tilavuus|体积|容积|kubatur"),
    ("length", r"\blength|\blong\b|how many met(?:re|er)s|pituus|länge|longueur|lunghezza|längd|长度|多长"),
    ("area",   r"m²|m2\b|\barea\b|square met|sq\.? ?m|fläche|surface|superficie|pinta-?ala|\byta\b|面积|平方|多大"),
    ("count",  r"how many|number of|\bcount\b|montako|kuinka monta|wie viele|anzahl|combien|nombre de|quanti|quante|"
               r"numero di|hur många|antal|多少|几个|几扇|几间|几层|数量|几"),
]
# canonical category -> words (lower case; CJK matched as substrings, others on word boundaries)
CATEGORY = {
    "toilet":   ["toilet", "toilets", "toilet bowl", "toilet bowls", "wc seat", "wc seats", "wc", "wcs", "loo", "klo",
                 "wc-istuin", "wc-istuinta", "toilette", "toiletten", "toilettes", "gabinetto", "water", "toalett", "马桶", "坐便器", "便器"],
    "sink":     ["sink", "sinks", "washbasin", "washbasins", "wash basin", "wash basins", "basin", "basins", "lavabo", "lavabos",
                 "lavabi", "lavandino", "pesuallas", "pesualtaita", "waschbecken", "waschtisch", "tvättställ", "洗手池", "洗手盆",
                 "洗脸盆", "水槽", "水池"],
    "bathtub":  ["bathtub", "bathtubs", "tub", "tubs", "badewanne", "badewannen", "baignoire", "baignoires", "vasca",
                 "vasche", "kylpyamme", "badkar", "浴缸"],
    "shower":   ["shower", "showers", "dusche", "duschen", "douche", "douches", "doccia", "docce", "suihku", "dusch", "淋浴"],
    "door":     ["door", "doors", "doorway", "ovi", "ovea", "ovet", "tür", "türen", "porte", "portes", "porta", "dörr",
                 "dörrar", "门"],
    "window":   ["window", "windows", "ikkuna", "ikkunaa", "ikkunat", "fenster", "fenêtre", "fenêtres", "finestra",
                 "finestre", "fönster", "窗", "窗户"],
    "apartment":["apartment", "apartments", "flat", "flats", "unit", "units", "dwelling", "dwellings", "wohnung",
                 "wohnungen", "appartement", "appartements", "logement", "logements", "appartamento", "appartamenti",
                 "asunto", "asuntoa", "lägenhet", "公寓", "住户", "户"],
    "wall":     ["wall", "walls", "wand", "wände", "mur", "murs", "muro", "muri", "seinä", "seinää", "vägg", "墙", "墙体"],
    "slab":     ["slab", "slabs", "floor slab", "decke", "decken", "dalle", "dalles", "solaio", "laatta", "bjälklag", "楼板"],
    "column":   ["column", "columns", "pillar", "pillars", "stütze", "stützen", "colonne", "pilastro", "pilari", "pelare", "柱"],
    "beam":     ["beam", "beams", "träger", "poutre", "poutres", "trave", "travi", "palkki", "balk", "梁"],
    "stair":    ["stair", "stairs", "staircase", "treppe", "treppen", "escalier", "scala", "scale", "porras", "portaat",
                 "trappa", "楼梯"],
    "sanitary": ["sanitary", "sanitary fixture", "sanitary fixtures", "sanitär", "sanitaire", "sanitari", "卫浴", "洁具"],
    "light":    ["light", "lights", "light fixture", "light fixtures", "lamp", "lamps", "luminaire", "leuchte", "leuchten",
                 "valaisin", "灯", "灯具"],
    "storey":   ["storey", "storeys", "story", "stories", "floors", "levels", "kerros", "kerrosta", "geschoss", "geschosse",
                 "étage", "étages", "piano", "piani", "våning", "楼层", "层"],
    "sauna":    ["sauna", "saunas", "saunaa", "桑拿"],
    "kitchen":  ["kitchen", "kitchens", "kitchenette", "keittiö", "keittiötä", "küche", "küchen", "cuisine", "cuisines",
                 "cucina", "cucine", "kök", "厨房"],
    "bedroom":  ["bedroom", "bedrooms", "makuuhuone", "makuuhuonetta", "schlafzimmer", "chambre", "chambres",
                 "camera da letto", "camere da letto", "sovrum", "卧室"],
    "bathroom": ["bathroom", "bathrooms", "washroom", "washrooms", "kylpyhuone", "kylpyhuonetta", "pesuhuone",
                 "badezimmer", "salle de bain", "salles de bain", "bagno", "bagni", "badrum", "浴室", "卫生间"],
    "wc_room":  ["wc room", "wc rooms", "toilet room", "toilet rooms", "separate wc", "erillinen wc", "erillistä wc",
                 "独立卫生间", "厕所"],
    "balcony":  ["balcony", "balconies", "parveke", "parveketta", "balkon", "balkone", "balcon", "balcons", "balcone",
                 "balconi", "阳台"],
    "room":     ["room", "rooms", "space", "spaces", "raum", "räume", "zimmer", "pièce", "pièces", "locale", "locali",
                 "stanza", "stanze", "huone", "huonetta", "rum", "房间", "空间"],
}
# room type -> labels as Swiss drawings write them (de/fr/it), used when a room type is asked on a Swiss plan
SWISS_LABELS = {
    "kitchen":  ["küche", "cuisine", "cucina", "kochen", "küche/essen", "wohnküche"],
    "bathroom": ["bad", "bain", "bagno", "dusche", "douche", "doccia", "bad/wc", "salle de bain"],
    "bedroom":  ["schlafzimmer", "chambre", "camera"],
    "balcony":  ["balkon", "balcon", "balcone", "loggia", "terrasse", "terrazza"],
    "wc_room":  ["wc", "toilette"],
    "stair":    ["treppenhaus", "cage d'escalier", "vano scala", "treppe"],
}
WHOLE = r"in the model|whole building|entire building|koko rakennus|gesamte(?:n)? gebäude|tout le bâtiment|intero edificio|整栋|整个建筑|整个模型|模型中"

def _norm(s): return unicodedata.normalize("NFC", s or "").lower()

def _has(text, word):
    if re.search(r"[一-鿿]", word): return word in text
    L = r"[0-9A-Za-zÀ-ɏ]"   # Latin letters/digits only, so 'Wohnen 有几间' and 'wc有几个' still match
    return re.search(r"(?<!" + L + ")" + re.escape(word) + r"(?!" + L + ")", text) is not None

def _intent(t):
    for name, rx in INTENT:
        if re.search(rx, t, re.I): return name
    return None

def _categories(t):
    """All categories mentioned, longest match first (so 'wc room' beats 'wc', 'bathroom' beats 'room')."""
    hits = []
    for cat, words in CATEGORY.items():
        for w in words:
            if _has(t, w): hits.append((len(w), cat, w))
    hits.sort(reverse=True)
    out, used = [], []
    for ln, cat, w in hits:
        if any(w in u for u in used): continue          # 'wc' inside an already matched 'wc room'
        used.append(w)
        if cat not in out: out.append(cat)
    return out

QUOTED = re.compile(r"['«„\"“‘「『]([^'»“”\"’」』]+)['»“”\"’」』]")

def classify(path, question):
    from .query import inventory, source_of
    src = source_of(path); q = question or ""; t = _norm(q)
    inv = inventory(path) if src else {}
    reasons, scope = [], {}
    intent = _intent(t)
    cats = _categories(t)
    quoted = [m.group(1).strip() for m in QUOTED.finditer(q)]

    # ---- scope from what the drawing actually contains
    if src == "swiss_dwellings":
        nums = {r["number"] for r in inv.get("rooms", [])}
        m = next((x for x in re.findall(r"\b[A-Z]?\d+\.\d+\b", q) if x in nums), None)
        if m: scope["room"] = m; reasons.append(f"room number {m} found in the drawing")
        am = re.search(r"(?:apartment|flat|unit|wohnung|appartement|logement|appartamento|asunto|lägenhet)\s+([A-Z])\b", q, re.I) \
             or re.search(r"\b([A-Z])\s*(?:户|号公寓|公寓)", q) or re.search(r"(?:公寓|户)\s*([A-Z])\b", q)
        if am and am.group(1).upper() in inv.get("apartments", []):
            scope["apartment"] = am.group(1).upper(); reasons.append(f"apartment {scope['apartment']}")
        labels = inv.get("room_labels", [])
        lab = next((l for l in quoted if l in labels), None) or \
              next((l for l in sorted(labels, key=len, reverse=True) if len(l) > 2 and _has(t, _norm(l))), None)
        if lab and "room" not in scope:
            scope["label"] = lab; reasons.append(f"label '{lab}' is written in the drawing")
        elif not lab and "room" not in scope:   # room type asked in another language -> labels used in this drawing
            for c in cats:
                cand = [l for l in labels if _norm(l) in SWISS_LABELS.get(c, [])]
                if cand:
                    scope["labels"] = cand; reasons.append(f"'{c}' matched drawing label(s) {cand}"); break
    elif src in ("ifc_models", "ifc_bench"):
        storeys = inv.get("storeys", [])
        st = next((s for s in quoted if s in storeys), None) or \
             next((s for s in sorted(storeys, key=len, reverse=True) if s and _has(t, _norm(s))), None)
        if not st:   # 'level 1', '1st floor', '一层'
            n = re.search(r"(?:level|floor|storey|kerros|geschoss|étage|piano)\s*(-?\d+)|(-?\d+)\s*(?:st|nd|rd|th)?\s*(?:floor|level|storey)|([一二三四五六七八九十\d]+)\s*(?:层|楼)", t)
            if n:
                num = next(g for g in n.groups() if g)
                num = str("一二三四五六七八九十".index(num) + 1) if num in "一二三四五六七八九十" else num
                c = [s for s in storeys if s and re.search(r"(?<!\d)" + re.escape(num) + r"(?!\d)", s)]
                if len(c) == 1: st = c[0]
        if st and not re.search(WHOLE, t): scope["storey"] = st; reasons.append(f"storey '{st}'")
        rooms = [r["name"] for r in inv.get("rooms", [])]
        rm = next((r for r in quoted if r in rooms), None) or \
             next((r for r in sorted(rooms, key=len, reverse=True) if len(r) > 3 and _has(t, _norm(r))), None)
        if rm and intent == "area": scope["room"] = rm; reasons.append(f"room '{rm}'")

    # ---- category
    if "storey" in scope or len(cats) > 1:               # '一层有几扇门': the storey is the scope, not the thing counted
        cats = [c for c in cats if c != "storey"] or cats
    cat = None
    for c in cats:
        if c == "room" and len(cats) > 1: continue        # 'bathroom' etc. beats generic 'room'
        cat = c; break
    if cat is None and src == "swiss_dwellings" and ("label" in scope or "labels" in scope): cat = "room"
    if src == "cubicasa5k" and cat in ("shower", "bathtub"): cat = "shower_tub"
    if src == "cubicasa5k" and cat == "storey": pass
    if src == "swiss_dwellings" and cat in ("kitchen", "bathroom", "bedroom", "balcony", "wc_room", "stair", "room") and \
            ("label" in scope or "labels" in scope):
        cat = "room"
    if src in ("ifc_models", "ifc_bench") and cat in ("bathroom", "bedroom", "kitchen"): cat = "room"
    if src == "cubicasa5k" and cat == "toilet" and re.search(r"room|huone|间|厕所", t) and "wc_room" not in cats: cat = "wc_room"

    # ---- intent defaults
    if intent is None:
        if cat or scope: intent = "area" if "room" in scope or ("apartment" in scope and not cat) else "count"; reasons.append("intent assumed")
    if intent == "area" and cat in (None, "room", "apartment"): cat = cat if cat == "room" else None
    if intent in ("length", "volume") and cat is None and src in ("ifc_models", "ifc_bench"): cat = "wall"

    conf = 0.0
    if intent: conf += 0.4
    if cat or (intent == "area" and scope) or (intent == "area" and src == "swiss_dwellings"): conf += 0.4
    if "intent assumed" in reasons: conf = min(conf, 0.5)   # 'fire rating of the doors' must not become a door count
    else: conf += 0.2
    closest = [c for c in (inv.get("count_categories") or [])][:12]
    return {"intent": intent, "category": cat, "scope": scope, "confidence": round(conf, 2),
            "reasons": reasons, "closest": closest, "source": src}

def run(path, question, min_conf=0.6):
    """classify -> query. Multiple matching labels (e.g. 'Bad' and 'Dusche') are summed, each shown as a part."""
    from .query import query
    c = classify(path, question)
    if c["confidence"] < min_conf or not c["intent"]:
        return {"value": None, "unit": None, "items": [], "sources": [], "method": "unrecognised_question",
                "warnings": ["question not recognised; supported question types for this drawing: " + ", ".join(c["closest"])],
                "classified": c}
    scope = dict(c["scope"]); labels = scope.pop("labels", None)
    if labels:
        parts = [query(path, c["intent"], "room", {**scope, "label": l}) for l in labels]
        ok = [p for p in parts if p["value"] is not None]
        if not ok: r = parts[0]
        else:
            r = {"value": round(sum(p["value"] for p in ok), 2), "unit": ok[0]["unit"],
                 "items": [i for p in ok for i in p["items"]], "sources": ok[0]["sources"],
                 "method": ok[0]["method"] + ("+" if len(ok) > 1 else ""), "warnings": [],
                 "parts": [{"label": l, "value": p["value"], "canonical_question": p.get("canonical_question")} for l, p in zip(labels, parts)],
                 "interpreted": {**ok[0].get("interpreted", {}), "scope": {"labels": labels}}}
    else:
        r = query(path, c["intent"], c["category"], scope)
    r["classified"] = c
    return r
