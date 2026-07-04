// Test FOCALIZADO y robusto (pocos parámetros): con settings del app (w25, demStart=200,
// centro neutral), barrer SOLO el par de la banda 90% (p5<-e5, p95<-e95) y el par 50%.
// Elegir por TRAIN, confirmar en VAL. Métrica: pinball de esa banda + cobertura.
const fs=require('fs');
const D=JSON.parse(fs.readFileSync(__dirname+"/btc_daily.json",'utf8'));
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
// pinball de un par de cuantiles (tauLo,tauHi) usando percentiles empíricos (eLo,eHi)
function bandScore(P,tauLo,tauHi,eLo,eHi){let t=0;for(const r of P){const m=idx(r.dem,50);
  const lo=(idx(r.dem,eLo)-m)*r.vs, hi=(idx(r.dem,eHi)-m)*r.vs;
  t+=pinball(tauLo,lo,r.actual)+pinball(tauHi,hi,r.actual);}return t/P.length;}
function bandCov(P,eLo,eHi){let ins=0;for(const r of P){const m=idx(r.dem,50);
  const lo=(idx(r.dem,eLo)-m)*r.vs,hi=(idx(r.dem,eHi)-m)*r.vs;if(r.actual>=lo&&r.actual<=hi)ins++;}return ins/P.length;}
const ALL=[];for(let t=700;t<N-31;t+=2)ALL.push(t);const cut=Math.floor(ALL.length*0.68);
const TRAIN=ALL.slice(0,cut),VAL=ALL.slice(cut);
for(const d of [7,30]){
  const PT=pre(TRAIN,d),PV=pre(VAL,d);
  const appLo=d<=10?4:3, appHi=d<=10?96:97;
  console.log(`\n===== ${d}d =====  (APP banda90: ${appLo}/${appHi}, banda50: 25/75)`);
  console.log(`APP  90%: TRAIN pb=${bandScore(PT,0.05,0.95,appLo,appHi).toFixed(6)} | VAL pb=${bandScore(PV,0.05,0.95,appLo,appHi).toFixed(6)} cov=${(bandCov(PV,appLo,appHi)*100).toFixed(1)}%`);
  // barrido simétrico del par 90%: e in [2..9]
  let best90=null;
  for(let e=2;e<=10;e+=0.25){const tr=bandScore(PT,0.05,0.95,e,100-e);if(!best90||tr<best90.tr)best90={e,tr};}
  const e=best90.e;
  console.log(`BEST 90% (por TRAIN): e=${e}/${100-e} → VAL pb=${bandScore(PV,0.05,0.95,e,100-e).toFixed(6)} cov=${(bandCov(PV,e,100-e)*100).toFixed(1)}%`);
  // barrido del par 50%: e in [18..32]
  console.log(`APP  50%: VAL pb=${bandScore(PV,0.25,0.75,25,75).toFixed(6)} cov=${(bandCov(PV,25,75)*100).toFixed(1)}%`);
  let best50=null;for(let e2=18;e2<=32;e2+=0.5){const tr=bandScore(PT,0.25,0.75,e2,100-e2);if(!best50||tr<best50.tr)best50={e2,tr};}
  const e2=best50.e2;
  console.log(`BEST 50% (por TRAIN): e=${e2}/${100-e2} → VAL pb=${bandScore(PV,0.25,0.75,e2,100-e2).toFixed(6)} cov=${(bandCov(PV,e2,100-e2)*100).toFixed(1)}%`);
}
// verificación explícita 30d en 4/96 y robustez con 2º split
console.log('\n=== VERIFICACIÓN 30d 4/96 vs 3/97 ===');
for(const [lbl,frac] of [['split 68%',0.68],['split 60%',0.60],['split 75%',0.75]]){
  const cut=Math.floor(ALL.length*frac);const PV=pre(ALL.slice(cut),30);
  const app=bandScore(PV,0.05,0.95,3,97),nw=bandScore(PV,0.05,0.95,4,96);
  console.log(`${lbl}: 3/97 pb=${app.toFixed(6)} cov=${(bandCov(PV,3,97)*100).toFixed(1)}% | 4/96 pb=${nw.toFixed(6)} cov=${(bandCov(PV,4,96)*100).toFixed(1)}% | mejora ${((app-nw)/app*100).toFixed(2)}%`);
}
