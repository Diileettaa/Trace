"""Turn a question string into a structured intent. Multilingual (EN/DE/FR/IT/FI/NL/DA/ET/ES) regex templates."""
import re

Q = r"['«„\"](.+?)['»“\"]"   # a quoted label in any of the dataset's quote styles

SWISS = [
    # (intent, regex) -- order matters
    ("room_area",  r"(?:area of room|Nettofläche von Raum|surface nette de la pièce|superficie netta del locale)\s+(?P<room>\S+)\s*\("),
    ("apt_area",   r"(?:of apartment|von Wohnung|de l'appartement|dell'appartamento)\s+(?P<apt>[A-Z])\b"),
    ("indoor_area",r"numbered indoor rooms|nummerierten Innenräume|pièces intérieures numérotées|locali interni numerati"),
    ("label_area", r"(?:total net area in m² of all rooms labelled|Nettofläche in m² aller Räume mit der Bezeichnung|toutes les pièces désignées|tutti i locali denominati)\s*" + Q),
    ("label_count",r"(?:rooms labelled|Räume mit der Bezeichnung|portant la désignation|locali con la denominazione)\s*" + Q),
    ("apartments", r"apartments|Wohnungen|appartements|appartamenti"),
    ("doors",      r"\bdoors\b|Türen|portes|porte "),
    ("windows",    r"windows|Fenster|fenêtres|finestre"),
    ("wc",         r"toilets \(WC\)|WCs|Combien de WC|Quanti WC"),
    ("washbasin",  r"washbasins|Lavabos|lavabos|lavabi"),
    ("bathtub",    r"bathtubs|Badewannen|baignoires|vasche da bagno"),
    ("shower",     r"showers|Duschen|douches|docce"),
]
_SW = [(n, re.compile(p)) for n, p in SWISS]

def _greedy_label(question):
    """Labels can contain apostrophes (Cage d'escalier): take from the first quote to the last closing quote."""
    m = re.search(r"['«„](.+)['»“]", question)
    return m.group(1).strip() if m else None

def parse_swiss(question):
    for name, rx in _SW:
        m = rx.search(question)
        if m:
            d = {"intent": name}
            if "room" in m.groupdict(): d["room"] = m.group("room")
            if "apt" in m.groupdict(): d["apt"] = m.group("apt")
            if name in ("label_count", "label_area"): d["label"] = _greedy_label(question)
            return d
    return {"intent": "unknown"}
