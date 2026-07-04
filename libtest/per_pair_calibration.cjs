// Calibración por-par ROBUSTA: para cada nivel nominal y horizonte, halla el percentil
// empírico e que minimiza pinball, y SOLO lo adopta si mejora en LOS 3 splits temporales
// frente al valor actual del app. 1 grado de libertad por nivel = no sobreajusta.
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;
const LR=[];for(let i=1;i<N;i++)LR.push(Math.log(CL[i]/CL[i-1]));
const PS2=new Float64Array(LR.length+1);for(let k=0;k<LR.length;k++)PS2[k+1]=PS2[k]+LR[k]*LR[k];
const sigHistT=t=>Math.sqrt(PS2[t]/t), sigNowT=(t,w)=>Math.sqrt((PS2[t]-PS2[t-w])/w);
const idx=(dem,p)=>dem[Math.min(dem.length-1,Math.max(0,Math.round(p/100*(dem.length-1))))];
const pinball=(tau,q,y)=>y>=q?(y-q)*tau:(q-y)*(1-tau);
function pre(origins,d){const P=[];for(const t of origins){if(t+d>=N)continue;
  const hr=[];for(let i=200;i+d<=t;i++)hr.push(Math.log(CL[i+d]/CL[i]));if(hr.length<60)continue;
  const mu=hr.reduce((a,x)=>a+x,0)/hr.length;hr.sort((a,b)=>a-b);const dem=hr.map(x=>x-mu);
  let vs=sigNowT(t,25)/(sigHistT(t)||1);vs=Math.max(0.6,Math.min(2.0,vs));
  P.push({dem,vs,actual:Math.log(CL[t+d]/CL[t])});}return P;}
const qScore=(P,tau,e)=>{let t=0;for(const r of P){const m=idx(r.dem,50);const q=(idx(r.dem,e)-m)*r.vs;t+=pinball(tau,q,r.actual);}return t/P.length;};
const ALL=[];for(let t=700;t<N-31;t+=2)ALL.push(t);
// App actual (tras el fix del 90%): nominal -> percentil empírico
const APP={5:4,10:8,25:25,40:40,60:60,75:75,90:92,95:96};
const SPLITS=[0.68,0.60,0.75];
function evalAll(d){
  const trainSets=SPLITS.map(f=>pre(ALL.slice(0,Math.floor(ALL.length*f)),d));
  const valSets=SPLITS.map(f=>pre(ALL.slice(Math.floor(ALL.length*f)),d));
  console.log(`\n===== ${d}d =====`);
  const newMap={};
  for(const tauPct of [5,10,25,40,60,75,90,95]){
    const tau=tauPct/100, appE=APP[tauPct];
    // aprende e en el TRAIN principal (split 68)
    let bestE=appE,bestTr=1e18;
    const lo=Math.max(0.3,tauPct-10),hi=Math.min(99.7,tauPct+10);
    for(let e=lo;e<=hi;e+=0.25){const s=qScore(trainSets[0],tau,e);if(s<bestTr){bestTr=s;bestE=e;}}
    // ¿mejora en los 3 VAL frente al app?
    let wins=0,deltas=[];
    for(let s=0;s<SPLITS.length;s++){const a=qScore(valSets[s],tau,appE),n=qScore(valSets[s],tau,bestE);deltas.push((a-n)/a*100);if(n<a-1e-9)wins++;}
    const robust=wins===SPLITS.length && Math.round(bestE*4)/4!==appE;
    newMap[tauPct]=robust?Math.round(bestE):appE;
    console.log(`  p${tauPct}: app e=${appE} learned e=${bestE.toFixed(1)} | VAL Δpinball ${deltas.map(x=>(x>=0?'+':'')+x.toFixed(2)+'%').join(' ')} | ${robust?'ADOPTAR e='+Math.round(bestE):'mantener'}`);
  }
  return newMap;
}
for(const d of [7,30])evalAll(d);
