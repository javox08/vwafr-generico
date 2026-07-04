// ¿Mejora condicionar los cuantiles empíricos al RÉGIMEN de volatilidad actual?
// Cada retorno histórico a d-días se PONDERA por el parecido de su vol a la de hoy
// (kernel gaussiano sobre log-vol). Cuantiles ponderados. Base EWMA 0.97. 3 splits.
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;const ln=x=>Math.log(x);
const PS2=new Float64Array(N);{let s=0;for(let i=1;i<N;i++){const r=ln(CL[i]/CL[i-1]);s+=r*r;PS2[i]=s;}}
const sigHistT=t=>Math.sqrt(PS2[t]/t);
const EWV=new Float64Array(N);{let s=ln(CL[1]/CL[0])**2;EWV[1]=Math.sqrt(s);for(let i=2;i<N;i++){const r=ln(CL[i]/CL[i-1]);s=0.97*s+0.03*r*r;EWV[i]=Math.sqrt(s);}}
const pinball=(tau,q,y)=>y>=q?(y-q)*tau:(q-y)*(1-tau);
const TAUS=[[0.05,4],[0.10,8],[0.25,25],[0.40,40],[0.50,50],[0.60,60],[0.75,75],[0.90,92],[0.95,96]];
// cuantil ponderado
function wq(items,p){/*items=[{v,w}] ordenado por v*/let tot=0;for(const it of items)tot+=it.w;const target=p/100*tot;let c=0;for(const it of items){c+=it.w;if(c>=target)return it.v;}return items[items.length-1].v;}
function pre(origins,d,band){const P=[];for(const t of origins){if(t+d>=N)continue;
  const items=[];for(let i=200;i+d<=t;i++){const r=ln(CL[i+d]/CL[i]);let w=1;
    if(band){const lv=Math.log((EWV[i]||1e-9)/(EWV[t]||1e-9));w=Math.exp(-(lv*lv)/(2*band*band));}
    items.push({v:r,w});}
  if(items.length<60)continue;
  let sw=0;for(const it of items)sw+=it.v*it.w;let tw=0;for(const it of items)tw+=it.w;const mu=sw/tw;
  const dem=items.map(it=>({v:it.v-mu,w:it.w})).sort((a,b)=>a.v-b.v);
  let vs=EWV[t]/(sigHistT(t)||1);vs=Math.max(0.6,Math.min(2.0,vs));
  P.push({dem,vs,actual:ln(CL[t+d]/CL[t])});}return P;}
function score(P){let t=0,c=0;for(const r of P){const m=wq(r.dem,50);for(const [tau,e] of TAUS){const q=(wq(r.dem,e)-m)*r.vs;t+=pinball(tau,q,r.actual);c++;}}return t/c;}
const ALL=[];for(let t=700;t<N-31;t+=3)ALL.push(t);const SPLITS=[0.68,0.60,0.75];
for(const d of [7,30]){
  console.log(`\n===== ${d}d =====`);
  const base=SPLITS.map(f=>score(pre(ALL.slice(Math.floor(ALL.length*f)),d,null)));
  console.log(`  sin condicionar (ACTUAL): ${base.map(x=>x.toFixed(5)).join(' ')}`);
  for(const band of [0.7,0.5,0.35,0.25]){
    const sc=SPLITS.map(f=>score(pre(ALL.slice(Math.floor(ALL.length*f)),d,band)));
    const dl=sc.map((s,i)=>(base[i]-s)/base[i]*100);
    console.log(`  kernel σ=${band}: Δ ${dl.map(x=>(x>=0?'+':'')+x.toFixed(2)+'%').join(' ')} ${dl.every(x=>x>0.05)?'★ROBUSTO':''}`);
  }
}
