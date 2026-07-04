// ¿Mejora un modelo de VOLATILIDAD distinto la calibración global del cono?
// Mide pinball TOTAL (8 cuantiles, mapeo del app fijo) OOS en 3 splits, variando SOLO
// cómo se estima la vol que alimenta vs. Adopta solo si mejora robusto en los 3 splits.
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;
const LR=[];for(let i=1;i<N;i++)LR.push(Math.log(CL[i]/CL[i-1]));
const PS2=new Float64Array(LR.length+1);for(let k=0;k<LR.length;k++)PS2[k+1]=PS2[k]+LR[k]*LR[k];
const sigHistT=t=>Math.sqrt(PS2[t]/t), sigWin=(t,w)=>Math.sqrt((PS2[t]-PS2[t-w])/w);
// EWMA vol al día t (recursivo, O(t)) — cacheado por lambda
function ewmaAll(lam){const v=new Float64Array(N);let s=LR[0]*LR[0];v[1]=Math.sqrt(s);for(let i=1;i<LR.length;i++){s=lam*s+(1-lam)*LR[i]*LR[i];v[i+1]=Math.sqrt(s);}return v;}
const EW={0.90:ewmaAll(0.90),0.94:ewmaAll(0.94),0.97:ewmaAll(0.97)};
const idx=(dem,p)=>dem[Math.min(dem.length-1,Math.max(0,Math.round(p/100*(dem.length-1))))];
const pinball=(tau,q,y)=>y>=q?(y-q)*tau:(q-y)*(1-tau);
const TAUS=[[0.05,4],[0.10,8],[0.25,25],[0.40,40],[0.50,50],[0.60,60],[0.75,75],[0.90,92],[0.95,96]];
function sigNowOf(t,vm){if(vm.k==='win')return sigWin(t,vm.w);return EW[vm.lam][t];}
function pre(origins,d,vm){const P=[];for(const t of origins){if(t+d>=N)continue;
  const hr=[];for(let i=200;i+d<=t;i++)hr.push(Math.log(CL[i+d]/CL[i]));if(hr.length<60)continue;
  const mu=hr.reduce((a,x)=>a+x,0)/hr.length;hr.sort((a,b)=>a-b);const dem=hr.map(x=>x-mu);
  let vs=sigNowOf(t,vm)/(sigHistT(t)||1);vs=Math.max(0.6,Math.min(2.0,vs));
  P.push({dem,vs,actual:Math.log(CL[t+d]/CL[t])});}return P;}
function totScore(P){let t=0,c=0;for(const r of P){const m=idx(r.dem,50);for(const [tau,e] of TAUS){const q=(idx(r.dem,e)-m)*r.vs;t+=pinball(tau,q,r.actual);c++;}}return t/c;}
const ALL=[];for(let t=700;t<N-31;t+=2)ALL.push(t);
const SPLITS=[0.68,0.60,0.75];
const models=[{k:'win',w:25,name:'rolling-25 (ACTUAL)'},{k:'win',w:15,name:'rolling-15'},{k:'win',w:40,name:'rolling-40'},{k:'win',w:60,name:'rolling-60'},{k:'ewma',lam:0.90,name:'EWMA λ=0.90'},{k:'ewma',lam:0.94,name:'EWMA λ=0.94'},{k:'ewma',lam:0.97,name:'EWMA λ=0.97'}];
for(const d of [7,30]){
  console.log(`\n===== ${d}d (pinball total VAL en 3 splits) =====`);
  const base=SPLITS.map(f=>totScore(pre(ALL.slice(Math.floor(ALL.length*f)),d,{k:'win',w:25})));
  for(const vm of models){
    const sc=SPLITS.map(f=>totScore(pre(ALL.slice(Math.floor(ALL.length*f)),d,vm)));
    const delta=sc.map((s,i)=>(base[i]-s)/base[i]*100);
    const robust=vm.name.indexOf('ACTUAL')<0 && delta.every(x=>x>0.05);
    console.log(`  ${vm.name.padEnd(22)} ${sc.map(x=>x.toFixed(5)).join(' ')} | Δ ${delta.map(x=>(x>=0?'+':'')+x.toFixed(2)+'%').join(' ')} ${robust?'★ROBUSTO':''}`);
  }
}
