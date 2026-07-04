// Backtest de SKILL DIRECCIONAL: IC (correlación de Pearson) fuera de muestra entre
// señales de precio (hasta t) y el retorno real a d días. Walk-forward, 3 splits.
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;
const ln=x=>Math.log(x);
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function corr(xs,ys){const mx=mean(xs),my=mean(ys);let sxy=0,sx=0,sy=0;for(let i=0;i<xs.length;i++){const dx=xs[i]-mx,dy=ys[i]-my;sxy+=dx*dy;sx+=dx*dx;sy+=dy*dy;}return sxy/(Math.sqrt(sx*sy)||1);}
function ma(t,n){let s=0;for(let i=t-n+1;i<=t;i++)s+=CL[i];return s/n;}
function rsi(t,n){let up=0,dn=0;for(let i=t-n+1;i<=t;i++){const ch=CL[i]-CL[i-1];if(ch>0)up+=ch;else dn-=ch;}const rs=up/(dn||1e-9);return 100-100/(1+rs);}
function donch(t,n){let mn=1e18,mx=-1e18;for(let i=t-n+1;i<=t;i++){if(CL[i]<mn)mn=CL[i];if(CL[i]>mx)mx=CL[i];}return (CL[t]-mn)/((mx-mn)||1);}
function vol(t,n){let m=0;for(let i=t-n+1;i<=t;i++)m+=ln(CL[i]/CL[i-1]);m/=n;let s=0;for(let i=t-n+1;i<=t;i++){const x=ln(CL[i]/CL[i-1])-m;s+=x*x;}return Math.sqrt(s/n);}
// señales (en t, solo pasado)
const SIG={
  mom10:t=>ln(CL[t]/CL[t-10]), mom20:t=>ln(CL[t]/CL[t-20]), mom30:t=>ln(CL[t]/CL[t-30]),
  mom60:t=>ln(CL[t]/CL[t-60]), mom90:t=>ln(CL[t]/CL[t-90]), mom120:t=>ln(CL[t]/CL[t-120]), mom180:t=>ln(CL[t]/CL[t-180]),
  maDist50:t=>CL[t]/ma(t,50)-1, maDist200:t=>CL[t]/ma(t,200)-1,
  maCross:t=>ma(t,50)/ma(t,200)-1,
  donch100:t=>donch(t,100)-0.5, donch50:t=>donch(t,50)-0.5,
  rsi14:t=>(rsi(t,14)-50)/50,
  rev2:t=>-ln(CL[t]/CL[t-2]), rev3:t=>-ln(CL[t]/CL[t-3]), rev5:t=>-ln(CL[t]/CL[t-5]),
  volMom30:t=>ln(CL[t]/CL[t-30])/(vol(t,30)*Math.sqrt(30)||1),
};
const KEYS=Object.keys(SIG);
const ALL=[];for(let t=250;t<N-31;t++)ALL.push(t);
const SPLITS=[0.68,0.60,0.75];
for(const d of [7,30]){
  console.log(`\n===== ${d}d · IC de Pearson (VAL en 3 splits) =====`);
  // precompute señales y target
  const rows=ALL.filter(t=>t+d<N).map(t=>{const o={t,y:ln(CL[t+d]/CL[t])};for(const k of KEYS)o[k]=SIG[k](t);return o;});
  const valSets=SPLITS.map(f=>rows.slice(Math.floor(rows.length*f)));
  const res=KEYS.map(k=>{const ics=valSets.map(V=>corr(V.map(r=>r[k]),V.map(r=>r.y)));const rob=ics.every(x=>x>0.03)||ics.every(x=>x<-0.03);return {k,ics,rob,avg:mean(ics)};});
  res.sort((a,b)=>Math.abs(b.avg)-Math.abs(a.avg));
  for(const r of res)console.log(`  ${r.k.padEnd(10)} IC ${r.ics.map(x=>(x>=0?'+':'')+x.toFixed(3)).join(' ')} avg=${(r.avg>=0?'+':'')+r.avg.toFixed(3)} ${r.rob?'★ROBUSTO':''}`);
}
