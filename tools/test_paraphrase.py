"""Paraphrase robustness: ask the dataset's questions in other words / languages and compare with the gold answer
of the canonical question.  python tools/test_paraphrase.py [--per-source N] [-v]
'understood' = the paraphrase gives exactly the engine's answer to the canonical question (the NL layer's job);
'correct vs gold' also includes the engine's own errors. 'declined' is acceptable, 'misread' (another number) is not."""
import os, sys, json, random, argparse, collections
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from engine.answer import answer, DATA
from engine.query import inventory, SWISS_COUNT, CUBI, IFC_COUNT_WORD

SW = {  # canonical key -> paraphrases
    "door": ["How many doors are there?", "门有几扇？", "Wie viele Türen hat dieser Grundriss?", "combien de portes ?", "montako ovea?"],
    "window": ["number of windows", "这张图有多少个窗户", "Quante finestre ci sono?"],
    "toilet": ["how many WCs on this floor", "有几个马桶", "Wie viele Toiletten gibt es?"],
    "sink": ["how many sinks?", "洗手池数量是多少", "Anzahl Waschbecken?"],
    "bathtub": ["number of tubs", "浴缸有几个"],
    "shower": ["how many showers are there", "淋浴有几个"],
    "apartment": ["how many flats are on this floor?", "这层有几户公寓", "Wie viele Wohnungen?"],
}
SW_APT = ["how big is apartment {a} in m2?", "{a}户的面积是多少平方米", "Fläche der Wohnung {a}?"]
SW_ROOM = ["area of room {r}", "房间 {r} 的面积是多少", "surface de la pièce {r} ?"]
SW_INDOOR = ["total indoor floor area of this floor in m²", "这层室内总面积是多少平方米"]
SW_LABEL = ["how many '{l}' rooms are there?", "how many rooms named {l}?", "'{l}' 有几间"]
CU = {
    "toilet": ["how many toilets?", "有几个马桶", "Montako WC-istuinta?"],
    "sink": ["number of sinks", "洗手池有几个"],
    "door": ["how many doors", "门的数量"],
    "window": ["how many windows?", "窗户有几个"],
    "shower_tub": ["how many showers or bathtubs?", "淋浴和浴缸一共几个"],
    "storey": ["how many floors does this house have?", "这张图有几层"],
    "sauna": ["is there a sauna? how many saunas", "kuinka monta saunaa?", "桑拿房有几个"],
    "kitchen": ["how many kitchens", "厨房有几个"],
    "bedroom": ["how many bedrooms are there?", "有几个卧室", "Montako makuuhuonetta?"],
    "bathroom": ["how many bathrooms?", "浴室有几间"],
    "wc_room": ["how many separate toilet rooms?", "有几个独立卫生间"],
    "balcony": ["number of balconies", "阳台有几个", "Montako parveketta?"],
}
IF_MODEL = ["How many {w} does the whole building have?", "整栋建筑有多少{zh}", "Wie viele {w} hat das gesamte Gebäude?"]
IF_STOREY = ["how many {w} on {s}?", "{s} 有多少{zh}"]
ZH = {"doors": "扇门", "windows": "扇窗户", "walls": "面墙", "slabs": "块楼板", "columns": "根柱子", "beams": "根梁",
      "stairs": "部楼梯", "rooms (spaces)": "个房间", "sanitary fixtures": "个洁具", "light fixtures": "个灯具"}
IF_STOREY_AREA = ["total room area on {s} in m²", "{s} 所有房间的总面积是多少平方米"]
IF_WALL_LEN = ["how long are all the walls on {s} together, in metres?", "{s} 墙的总长度是多少米"]

def correct(q, v):
    if v is None: return False
    g = float(q["answer"])
    return round(v) == round(g) and abs(v - round(v)) < 1e-6 if q["type"] == "count" else abs(v - g) <= 0.02 * abs(g) + 1e-9

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--per-source", type=int, default=6); ap.add_argument("-v", action="store_true")
    a = ap.parse_args(); random.seed(7)
    Q = [json.loads(l) for l in open(os.path.join(DATA, "questions.jsonl"), encoding="utf-8")]
    by = collections.defaultdict(dict)
    for q in Q: by[q["path"]][q["question"]] = q
    cases = []   # (source, path, paraphrase, gold question dict)
    def add(src, p, texts, canon, **fmt):
        g = by[p].get(canon)
        if g: cases.extend((src, p, t.format(**fmt), g) for t in texts)
    paths = collections.defaultdict(list)
    for p in by: paths[p.split("/")[1]].append(p)
    for p in random.sample(sorted(paths["swiss_dwellings"]), a.per_source):
        for k, texts in SW.items(): add("swiss", p, texts, SWISS_COUNT[k])
        for qq in by[p]:
            if qq.startswith("What is the net floor area of apartment "):
                add("swiss", p, SW_APT, qq, a=qq.split("apartment ")[1][0]); break
        for qq in by[p]:
            if qq.startswith("What is the net floor area of room "):
                add("swiss", p, SW_ROOM, qq, r=qq.split("room ")[1].split(" ")[0]); break
        for qq in by[p]:
            if qq.startswith("What is the total net floor area in m² of all numbered indoor rooms"): add("swiss", p, SW_INDOOR, qq)
        for qq in by[p]:
            if qq.startswith("How many rooms labelled '"):
                add("swiss", p, SW_LABEL, qq, l=qq.split("'")[1]); break
    for p in random.sample(sorted(x for x in paths["cubicasa5k"] if len(by[x]) >= 10), a.per_source):
        for k, texts in CU.items(): add("cubicasa", p, texts, CUBI[k])
    for p in random.sample(sorted(x for x in paths["ifc_models"] if x.endswith(".pdf")), a.per_source):
        try: inv = inventory(p)
        except Exception: continue
        model = (inv.get("model_name") or "")
        for k, w in IFC_COUNT_WORD.items():
            add("ifc", p, IF_MODEL, f"How many {w} are there in the model '{model}'?", w=w.split(" ")[0], zh=ZH[w])
            for s in inv["storeys"]:
                add("ifc", p, IF_STOREY, f"How many {w} are shown on the floor plan of '{s}'?", w=w.split(" ")[0], zh=ZH[w], s=s)
        for s in inv["storeys"]:
            add("ifc", p, IF_STOREY_AREA, f"What is the total net floor area of all rooms (spaces) on '{s}', in m²?", s=s)
            add("ifc", p, IF_WALL_LEN, f"What is the total length of all walls on '{s}', in metres?", s=s)
    stats = collections.defaultdict(collections.Counter); bad = []
    for src, p, text, g in cases:
        try: r = answer(p, text)
        except Exception as e: r = {"value": None, "method": "error:" + repr(e)[:80]}
        canon = answer(p, g["question"])["value"]
        same = r["value"] is not None and canon is not None and abs(float(r["value"]) - float(canon)) < 1e-6
        ok = correct(g, r["value"]); unrec = r.get("method") == "unrecognised_question" or r["value"] is None
        stats[src]["n"] += 1; stats[src]["ok"] += ok; stats[src]["same"] += same
        stats[src]["declined"] += unrec; stats[src]["wrong"] += (not same and not unrec)
        if not same: bad.append((src, "declined" if unrec else "WRONG", p.split("/")[-1][:40], text, g["answer"], r["value"], r.get("method"),
                               (r.get("classified") or {}).get("category"), (r.get("classified") or {}).get("scope")))
    tot = collections.Counter()
    for src, c in stats.items():
        tot.update(c); print(f"{src:9s} n={c['n']:4d}  understood (= canonical answer) {100*c['same']/c['n']:5.1f}%   correct vs gold {100*c['ok']/c['n']:5.1f}%   declined {c['declined']:3d}   misread {c['wrong']:3d}")
    print(f"{'all':9s} n={tot['n']:4d}  understood (= canonical answer) {100*tot['same']/tot['n']:5.1f}%   correct vs gold {100*tot['ok']/tot['n']:5.1f}%   declined {tot['declined']:3d}   misread {tot['wrong']:3d}")
    for b in bad[: (400 if a.v else 25)]: print("  ", b)

if __name__ == "__main__":
    main()
