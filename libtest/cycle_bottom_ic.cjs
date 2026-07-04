// Backtest de los indicadores de FONDO basados en precio: ¿cuánto predice cada uno el
// retorno futuro (los fondos preceden grandes subidas)? IC con retorno a 365d. Y ¿está
// bien calibrado el score lineal? Compara IC de cada indicador y del compuesto.
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function corr(xs,ys){const mx=mean(xs),my=mean(ys);let sxy=0,sx=0,sy=0;for(let i=0;i<xs.length;i++){const dx=xs[i]-mx,dy=ys[i]-my;sxy+=dx*dy;sx+=dx*dx;sy+=dy*dy;}return sxy/(Math.sqrt(sx*sy)||1);}
const ma=(t,n)=>{let s=0,k=0;for(let i=Math.max(0,t-n+1);i<=t;i++){s+=CL[i];k++;}return s/k;};
const athTo=t=>{let h=0;for(let i=0;i<=t;i++)if(CL[i]>h)h=CL[i];return CL[t]/h-1;};
const cl01=x=>Math.max(0,Math.min(1,x));
const lin=(v,bt,tp)=>cl01((tp-v)/(tp-bt));
// RSI semanal aproximado (muestras cada 7d)
function rsiW(t){if(t<105)return null;const w=[];for(let i=t-98;i<t;i+=7)w.push(CL[i]);w.push(CL[t]);let g=0,l=0;for(let i=1;i<w.length;i++){const c=w[i]-w[i-1];if(c>=0)g+=c;else l-=c;}const rs=l===0?100:g/l;return 100-100/(1+rs);}
// indicadores como score de fondo [0..1] con los umbrales ACTUALES del app
const IND={
  mayer:t=>lin(CL[t]/ma(t,200),0.7,2.4),
  ddAth:t=>lin(-athTo(t),0,0.75),
  pxMa200w:t=>lin(CL[t]/ma(t,1400),0.8,3),
  pxMa200:t=>lin(CL[t]/ma(t,200),0.75,2),
  rsiW:t=>{const r=rsiW(t);return r==null?null:lin(r,30,80);},
};
const H=365; // horizonte forward
const rows=[];
for(let t=1400;t+H<N;t+=3){const o={fwd:CL[t+H]/CL[t]-1};let ok=true;for(const k in IND){const v=IND[k](t);if(v==null){ok=false;break;}o[k]=v;}if(ok)rows.push(o);}
console.log(`n=${rows.length} · outcome = retorno a ${H}d (los fondos → subidas grandes)`);
console.log('\nIC (correlación score-de-fondo vs retorno futuro; + = el indicador predice bien):');
const ics={};
for(const k in IND){const ic=corr(rows.map(r=>r[k]),rows.map(r=>r.fwd));ics[k]=ic;console.log(`  ${k.padEnd(10)} IC=${(ic>=0?'+':'')+ic.toFixed(3)}`);}
// compuesto media simple (actual) vs ponderado por IC
const comp=rows.map(r=>mean(Object.keys(IND).map(k=>r[k])));
const icComp=corr(comp,rows.map(r=>r.fwd));
const keys=Object.keys(IND);const wsum=keys.reduce((a,k)=>a+Math.max(0,ics[k]),0);
const compW=rows.map(r=>keys.reduce((a,k)=>a+Math.max(0,ics[k])*r[k],0)/wsum);
const icCompW=corr(compW,rows.map(r=>r.fwd));
console.log(`\nCompuesto MEDIA SIMPLE (actual): IC=${icComp.toFixed(3)}`);
console.log(`Compuesto PONDERADO por IC:      IC=${icCompW.toFixed(3)}`);
// calibración: por deciles del score compuesto, retorno medio forward real
console.log('\nCalibración del score compuesto (media simple) → retorno forward real por rango:');
const srt=[...rows].map((r,i)=>({s:comp[i],f:r.fwd})).sort((a,b)=>a.s-b.s);
for(let q=0;q<5;q++){const seg=srt.slice(Math.floor(q/5*srt.length),Math.floor((q+1)/5*srt.length));const ms=mean(seg.map(x=>x.s)),mf=mean(seg.map(x=>x.f));console.log(`  score ${(ms*100).toFixed(0)}% → retorno medio ${H}d = ${(mf*100>=0?'+':'')+(mf*100).toFixed(0)}%`);}
