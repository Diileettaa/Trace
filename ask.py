"""Command line: python ask.py data/swiss_dwellings/site3387_bldg5238_floor23498.pdf "How many toilets (WC) are drawn on this floor plan?" """
import sys, json
from engine.answer import answer
if __name__ == "__main__":
    r = answer(sys.argv[1], sys.argv[2])
    print(json.dumps(r, ensure_ascii=False, indent=2)[:6000])
