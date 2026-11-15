import json,os,collections,hashlib
GT=json.load(open(os.path.expanduser("~/work/cubi_gt.json"))); GOLD=json.load(open("eval/_cubi_gold.json"))
R=json.load(open("det_cache/_raw_detections.json"))
QW={"window":"How many windows are shown on this floor plan?","door":"How many doors are shown on this floor plan? Count doorways fitted with a door; open doorways without a door leaf do not count."}
TH={"window":0.45,"door":0.3}
def iou(a,b):
    x0,y0,x1,y1=max(a[0],b[0]),max(a[1],b[1]),min(a[2],b[2]),min(a[3],b[3]); i=max(0,x1-x0)*max(0,y1-y0)
    u=(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i; return i/u if u>0 else 0
def cover(a,b):  # fraction of b inside a
    x0,y0,x1,y1=max(a[0],b[0]),max(a[1],b[1]),min(a[2],b[2]),min(a[3],b[3]); i=max(0,x1-x0)*max(0,y1-y0)
    return i/max(1e-9,(b[2]-b[0])*(b[3]-b[1]))
for cat in ("window","door"):
    agree=tot=0; S=collections.Counter(); per=collections.defaultdict(collections.Counter)
    for b in R["test"]:
        if b not in R["raw"] or QW[cat] not in GOLD.get(b,{}): continue
        g=[x[1:] for x in GT[b]["boxes"] if x[0]==cat]; tot+=1; agree+= len(g)==GOLD[b][QW[cat]]
        W,H=R["raw"][b]["size"]
        d=[[x[2]*1000/W,x[3]*1000/H,x[4]*1000/W,x[5]*1000/H] for x in R["raw"][b]["dets"] if x[0]==cat and x[1]>=TH[cat]]
        used=set(); tp=0
        for gi,gb in sorted(enumerate(g),key=lambda z:-max(iou(z[1],x) for x in d) if d else 0):
            best=max(((iou(gb,x),j) for j,x in enumerate(d) if j not in used),default=(0,None))
            if best[0]>=0.3: used.add(best[1]); tp+=1
            else:
                merged=any(cover(x,gb)>0.6 for x in d)
                k="FN_merged_into_bigger_box" if merged else "FN_missed"; S[k]+=1; per[b.rsplit('-',1)[0]][k]+=1
        for j,x in enumerate(d):
            if j in used: continue
            part=any(cover(gb,x)>0.6 for gb in g)
            k="FP_part_of_true_object" if part else "FP_no_object"; S[k]+=1; per[b.rsplit('-',1)[0]][k]+=1
        S["TP"]+=tp; S["GT"]+=len(g); per[b.rsplit('-',1)[0]]["GT"]+=len(g); per[b.rsplit('-',1)[0]]["TP"]+=tp
    print(cat,"GT count == gold answer:",agree,"/",tot)
    print("  instances",dict(S),"recall",round(S["TP"]/S["GT"],3),"precision",round(S["TP"]/(S["TP"]+S["FP_no_object"]+S["FP_part_of_true_object"]),3))
    for k,v in per.items(): print("   ",k,dict(v),"recall",round(v["TP"]/max(1,v["GT"]),3))
