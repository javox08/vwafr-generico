// Replica EXACTA del tmScore del app y compara su IC con variantes que usan momentum
// continuo vol-escalado. Walk-forward, 3 splits. Solo adopta si mejora robusto.
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;const ln=x=>Math.log(x);const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function corr(xs,ys){const mx=mean(xs),my=mean(ys);let sxy=0,sx=0,sy=0;for(let i=0;i<xs.length;i++){const dx=xs[i]-mx,dy=ys[i]-my;sxy+=dx*dy;sx+=dx*dx;sy+=dy*dy;}return sxy/(Math.sqrt(sx*sy)||1);}
function ma(t,n){let s=0;for(let i=t-n+1;i<=t;i++)s+=CL[i];return s/n;}
function vol(t,n){let m=0;for(let i=t-n+1;i<=t;i++)m+=ln(CL[i]/CL[i-1]);m/=n;let s=0;for(let i=t-n+1;i<=t;i++){const x=ln(CL[i]/CL[i-1])-m;s+=x*x;}return Math.sqrt(s/n);}
const cl0=(v,c)=>Math.max(-c,Math.min(c,v));
// tmScore ACTUAL del app (líneas 2894-2900), evaluado en t
function tmApp(t){const price=CL[t],ma50=ma(t,50),ma200=ma(t,200);
  let hi=-1e18,lo=1e18;for(let q=t-100;q<t;q++){if(CL[q]>hi)hi=CL[q];if(CL[q]<lo)lo=CL[q];}
  const donch=price>(hi+lo)/2?1:-1;
  const trendC=(price>ma50&&ma50>ma200)?1:(price<ma50&&ma50<ma200)?-1:0;
  const m120=(CL[t]/CL[t-120]-1)>0?1:-1;
  const m=CL[t]/CL[t-90]-1;const m90s=m>0.05?1:m<-0.05?-1:0;
  const m2=CL[t]/CL[t-30]-1;const m30s=m2>0.03?1:m2<-0.03?-1:0;
  const regS=price>ma200?1:-1;
  return Math.max(-1,Math.min(1,(0.30*donch+0.22*trendC+0.18*m120+0.15*m90s+0.15*m30s+0.10*regS)*1.2));}
// VARIANTE: sustituye los momentum de signo (m120,m90s,m30s) por vol-momentum continuo
function tmVolMom(t){const price=CL[t],ma50=ma(t,50),ma200=ma(t,200);
  let hi=-1e18,lo=1e18;for(let q=t-100;q<t;q++){if(CL[q]>hi)hi=CL[q];if(CL[q]<lo)lo=CL[q];}
  const donch=price>(hi+lo)/2?1:-1;
  const trendC=(price>ma50&&ma50>ma200)?1:(price<ma50&&ma50<ma200)?-1:0;
  const regS=price>ma200?1:-1;
  const vm=t=>{const r=ln(CL[t]/CL[t-30])/(vol(t,30)*Math.sqrt(30)||1);return Math.max(-1,Math.min(1,r*1.3));}; // vol-mom continuo [-1,1]
  const mv=vm(t);
  // mismos pesos totales de momentum (0.18+0.15+0.15=0.48) → al término continuo
  return Math.max(-1,Math.min(1,(0.30*donch+0.22*trendC+0.48*mv+0.10*regS)*1.2));}
// VARIANTE 2: mezcla mitad signo mitad continuo
function tmBlend(t){return 0.5*tmApp(t)+0.5*tmVolMom(t);}
const ALL=[];for(let t=250;t<N-31;t++)ALL.push(t);const SPLITS=[0.68,0.60,0.75];
for(const d of [7,30]){
  console.log(`\n===== ${d}d · IC del tmScore (VAL 3 splits) =====`);
  const rows=ALL.filter(t=>t+d<N).map(t=>({y:ln(CL[t+d]/CL[t]),app:tmApp(t),vm:tmVolMom(t),bl:tmBlend(t)}));
  for(const [name,key] of [['tmScore ACTUAL (signos)','app'],['vol-momentum continuo','vm'],['mezcla 50/50','bl']]){
    const ics=SPLITS.map(f=>{const V=rows.slice(Math.floor(rows.length*f));return corr(V.map(r=>r[key]),V.map(r=>r.y));});
    const base=SPLITS.map(f=>{const V=rows.slice(Math.floor(rows.length*f));return corr(V.map(r=>r.app),V.map(r=>r.y));});
    const dl=ics.map((x,i)=>x-base[i]);
    console.log(`  ${name.padEnd(26)} IC ${ics.map(x=>(x>=0?'+':'')+x.toFixed(3)).join(' ')} avg=${(mean(ics)>=0?'+':'')+mean(ics).toFixed(3)}${key!=='app'?' | ΔvsApp '+dl.map(x=>(x>=0?'+':'')+x.toFixed(3)).join(' ')+(dl.every(x=>x>0.002)?' ★':''):''}`);
  }
}
