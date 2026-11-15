"""For each Junction cubicasa PNG find source (F1_scaled / F1_original), dihedral transform k and crop/scale."""
import zipfile,os,json,cv2,numpy as np,time,sys
Z=zipfile.ZipFile(os.path.expanduser("~/mnt/Downloads/cubicasa5k.zip"))
D=os.path.expanduser("~/work/junction-dataset/data/cubicasa5k/")
OUT=os.path.expanduser("~/work/cubi_match.json")
M=json.load(open(OUT)) if os.path.exists(OUT) else {}
def dih(im,k):
    if k&4: im=im.T
    if k&1: im=im[:, ::-1]
    if k&2: im=im[::-1, :]
    return im
def zread(p):
    a=np.frombuffer(Z.read(p),np.uint8); return cv2.imdecode(a,cv2.IMREAD_GRAYSCALE)
names=sorted(f for f in os.listdir(D) if f.endswith(".png"))
RAW=set(json.load(open("det_cache/_raw_detections.json"))["raw"]); order=[n for n in names if n in RAW]+names
t=time.time(); done=0
for n in dict.fromkeys(order):
    if n in M: continue
    if time.time()-t>float(sys.argv[1]): break
    style,i=n[:-4].rsplit("-",1); base=f"cubicasa5k/{style}/{i}/"
    J=cv2.imread(D+n,0); h,w=J.shape
    best=None
    for src in ("F1_scaled.png","F1_original.png"):
        try: S=zread(base+src)
        except KeyError: continue
        for k in range(8):
            T=dih(S,k); H,W=T.shape
            if abs(W/H-w/h)>0.02: continue
            a=cv2.resize(T,(128,128),interpolation=cv2.INTER_AREA).astype(np.float32)
            b=cv2.resize(J,(128,128),interpolation=cv2.INTER_AREA).astype(np.float32)
            d=float(np.abs(a-b).mean())
            if best is None or d<best[0]: best=(d,src,k,W,H)
    M[n]={"diff":best[0],"src":best[1],"k":best[2],"src_size":[best[3],best[4]],"size":[w,h]} if best else {"diff":None}
    done+=1
    if done%40==0: json.dump(M,open(OUT,"w"))
json.dump(M,open(OUT,"w")); print("done",done,"total",len(M),"of",len(names))
