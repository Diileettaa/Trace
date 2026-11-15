import json,os,cv2,numpy as np,random
GT=json.load(open(os.path.expanduser("~/work/cubi_gt.json"))); R=json.load(open("det_cache/_raw_detections.json"))
D=os.path.expanduser("~/work/junction-dataset/data/cubicasa5k/")
def iou(a,b):
    x0,y0,x1,y1=max(a[0],b[0]),max(a[1],b[1]),min(a[2],b[2]),min(a[3],b[3]); i=max(0,x1-x0)*max(0,y1-y0)
    u=(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i; return i/u if u>0 else 0
def cover(a,b):
    x0,y0,x1,y1=max(a[0],b[0]),max(a[1],b[1]),min(a[2],b[2]),min(a[3],b[3]); i=max(0,x1-x0)*max(0,y1-y0)
    return i/max(1e-9,(b[2]-b[0])*(b[3]-b[1]))
crops={"missed":[],"merged":[],"ok":[]}; random.seed(1)
tests=[b for b in R["test"] if b in R["raw"] and b.startswith("high_quality_architectural")]; random.shuffle(tests)
for b in tests[:250]:
    W,H=R["raw"][b]["size"]; im=cv2.imread(D+b)
    if im is None or b not in GT: continue
    h,w=im.shape[:2]
    d=[[x[2]*1000/W,x[3]*1000/H,x[4]*1000/W,x[5]*1000/H] for x in R["raw"][b]["dets"] if x[0]=="window" and x[1]>=0.45]
    for c,*gb in GT[b]["boxes"]:
        if c!="window": continue
        m=max([iou(gb,x) for x in d] or [0]); merged=any(cover(x,gb)>0.6 for x in d)
        k="ok" if m>=0.3 else ("merged" if merged else "missed")
        if len(crops[k])>=24: continue
        x0,y0,x1,y1=[int(v*s/1000) for v,s in zip(gb,(w,h,w,h))]; pad=max(12,int(0.6*max(x1-x0,y1-y0)))
        X0,Y0,X1,Y1=max(0,x0-pad),max(0,y0-pad),min(w,x1+pad),min(h,y1+pad)
        cr=im[Y0:Y1,X0:X1].copy(); cv2.rectangle(cr,(x0-X0,y0-Y0),(x1-X0,y1-Y0),(0,170,0),1)
        for x in d:
            a0,b0,a1,b1=[int(v*s/1000) for v,s in zip(x,(w,h,w,h))]; cv2.rectangle(cr,(a0-X0,b0-Y0),(a1-X0,b1-Y0),(0,0,255),1)
        s=150/max(cr.shape[:2]); cr=cv2.resize(cr,None,fx=s,fy=s,interpolation=cv2.INTER_NEAREST)
        canvas=np.full((160,160,3),255,np.uint8); canvas[:cr.shape[0],:cr.shape[1]]=cr
        cv2.putText(canvas,f"{x1-x0}x{y1-y0}px",(2,157),cv2.FONT_HERSHEY_SIMPLEX,0.35,(0,0,0),1)
        crops[k].append(canvas)
for k,L in crops.items():
    rows=[np.hstack(L[i:i+8]+[np.full((160,160,3),255,np.uint8)]*(8-len(L[i:i+8]))) for i in range(0,len(L),8)]
    cv2.imwrite(f"eval/_mont_{k}.png",np.vstack(rows)); print(k,len(L))
