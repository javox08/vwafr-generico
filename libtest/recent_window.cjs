// ¿Mejora usar solo los últimos K días para los cuantiles empíricos (vs todo el
// histórico desde 200)? Base de vol = EWMA 0.97 (ya commiteada). Robusto = mejora en 3 splits.
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;
const LR=[];for(let i=1;i<N;i++)LR.push(Math.log(CL[i]/CL[i-1]));
const PS2=new Float64Array(LR.length+1);for(let k=0;k<LR.length;k++)PS2[k+1]=PS2[k]+LR[k]*LR[k];
const sigHistT=t=>Math.sqrt(PS2[t]/t);
const EWV=new Float64Array(N);{let s=LR[0]*LR[0];EWV[1]=Math.sqrt(s);for(let i=1;i<LR.length;i++){s=0.97*s+0.03*LR[i]*LR[i];EWV[i+1]=Math.sqrt(s);}}
const idx=(dem,p)=>dem[Math.min(dem.length-1,Math.max(0,Math.round(p/100*(dem.length-1))))];
const pinball=(tau,q,y)=>y>=q?(y-q)*tau:(q-y)*(1-tau);
const TAUS=[[0.05,4],[0.10,8],[0.25,25],[0.40,40],[0.50,50],[0.60,60],[0.75,75],[0.90,92],[0.95,96]];
// winMode: 'all' (desde 200) o número K (últimos K orígenes de retornos a d días)
function pre(origins,d,winK){const P=[];for(const t of origins){if(t+d>=N)continue;
  let start=200;if(winK){start=Math.max(200,t-d-winK);}
  const hr=[];for(let i=start;i+d<=t;i++)hr.push(Math.log(CL[i+d]/CL[i]));if(hr.length<60)continue;
  const mu=hr.reduce((a,x)=>a+x,0)/hr.length;hr.sort((a,b)=>a-b);const dem=hr.map(x=>x-mu);
  let vs=EWV[t]/(sigHistT(t)||1);vs=Math.max(0.6,Math.min(2.0,vs));
  P.push({dem,vs,actual:Math.log(CL[t+d]/CL[t])});}return P;}
function totScore(P){let t=0,c=0;for(const r of P){const m=idx(r.dem,50);for(const [tau,e] of TAUS){const q=(idx(r.dem,e)-m)*r.vs;t+=pinball(tau,q,r.actual);c++;}}return t/c;}
const ALL=[];for(let t=700;t<N-31;t+=2)ALL.push(t);
const SPLITS=[0.68,0.60,0.75];
for(const d of [7,30]){
  console.log(`\n===== ${d}d =====`);
  const base=SPLITS.map(f=>totScore(pre(ALL.slice(Math.floor(ALL.length*f)),d,null)));
  console.log(`  todo histórico (ACTUAL): ${base.map(x=>x.toFixed(5)).join(' ')}`);
  for(const K of [500,750,1000,1500,2000]){
    const sc=SPLITS.map(f=>totScore(pre(ALL.slice(Math.floor(ALL.length*f)),d,K)));
    const delta=sc.map((s,i)=>(base[i]-s)/base[i]*100);
    const robust=delta.every(x=>x>0.05);
    console.log(`  últimos ${K}d: ${sc.map(x=>x.toFixed(5)).join(' ')} | Δ ${delta.map(x=>(x>=0?'+':'')+x.toFixed(2)+'%').join(' ')} ${robust?'★ROBUSTO':''}`);
  }
}
