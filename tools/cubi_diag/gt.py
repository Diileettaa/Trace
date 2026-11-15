import zipfile,os,json,io,struct,sys,time
sys.path.insert(0,"train"); os.environ["TASK"]="fixtures"
import cubicasa_to_yolo as C
Z=zipfile.ZipFile(os.path.expanduser("~/mnt/Downloads/cubicasa5k.zip"))
D=os.path.expanduser("~/work/junction-dataset/data/cubicasa5k/")
OUT=os.path.expanduser("~/work/cubi_gt.json")
G=json.load(open(OUT)) if os.path.exists(OUT) else {}
names=sorted(f for f in os.listdir(D) if f.endswith(".png")); t=time.time(); n=0
for b in names:
    if b in G: continue
    if time.time()-t>float(sys.argv[1]): break
    style,i=b[:-4].rsplit("-",1); base=f"cubicasa5k/{style}/{i}/"
    h=Z.read(base+"F1_scaled.png")[:24]; W,H=struct.unpack(">II",h[16:24])
    objs,_,_=C.objects(io.BytesIO(Z.read(base+"model.svg")))
    G[b]={"scaled":[W,H],"boxes":[[c]+[round(v,1) for v in (bx[0]*1000/W,bx[1]*1000/H,bx[2]*1000/W,bx[3]*1000/H)] for c,bx in objs]}
    n+=1
json.dump(G,open(OUT,"w")); print("done",n,"total",len(G),"of",len(names))
