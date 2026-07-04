// Verifica robusto: ¿mejora el compuesto de indicadores de PRECIO quitando rsiW y
// ponderando por poder predictivo? Train/val temporal + horizontes 180/270/365d.
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
function corr(xs,ys){const mx=mean(xs),my=mean(ys);let sxy=0,sx=0,sy=0;for(let i=0;i<xs.length;i++){const dx=xs[i]-mx,dy=ys[i]-my;sxy+=dx*dy;sx+=dx*dx;sy+=dy*dy;}return sxy/(Math.sqrt(sx*sy)||1);}
const ma=(t,n)=>{let s=0,k=0;for(let i=Math.max(0,t-n+1);i<=t;i++){s+=CL[i];k++;}return s/k;};
const athTo=t=>{let h=0;for(let i=0;i<=t;i++)if(CL[i]>h)h=CL[i];return CL[t]/h-1;};
const cl01=x=>Math.max(0,Math.min(1,x));const lin=(v,bt,tp)=>cl01((tp-v)/(tp-bt));
function rsiWk(t){if(t<105)return null;const w=[];for(let i=t-98;i<t;i+=7)w.push(CL[i]);w.push(CL[t]);let g=0,l=0;for(let i=1;i<w.length;i++){const c=w[i]-w[i-1];if(c>=0)g+=c;else l-=c;}const rs=l===0?100:g/l;return 100-100/(1+rs);}
const IND={mayer:t=>lin(CL[t]/ma(t,200),0.7,2.4),ddAth:t=>lin(-athTo(t),0,0.75),pxMa200w:t=>lin(CL[t]/ma(t,1400),0.8,3),pxMa200:t=>lin(CL[t]/ma(t,200),0.75,2),rsiW:t=>{const r=rsiWk(t);return r==null?null:lin(r,30,80);}};
const keys=Object.keys(IND);
function build(H){const rows=[];for(let t=1400;t+H<N;t+=2){const o={t,fwd:CL[t+H]/CL[t]-1};let ok=true;for(const k in IND){const v=IND[k](t);if(v==null){ok=false;break;}o[k]=v;}if(ok)rows.push(o);}return rows;}
for(const H of [180,270,365]){
  const rows=build(H);const cut=Math.floor(rows.length*0.65);const tr=rows.slice(0,cut),va=rows.slice(cut);
  // ICs en TRAIN
  const ic={};for(const k in IND)ic[k]=corr(tr.map(r=>r[k]),tr.map(r=>r.fwd));
  const scEqual=r=>mean(keys.map(k=>r[k]));
  const noRsi=keys.filter(k=>k!=='rsiW');
  const scNoRsi=r=>mean(noRsi.map(k=>r[k]));
  const wpos=keys.filter(k=>ic[k]>0.02);const ws=wpos.reduce((a,k)=>a+ic[k],0)||1;
  const scW=r=>wpos.reduce((a,k)=>a+ic[k]*r[k],0)/ws;
  const icE=corr(va.map(scEqual),va.map(r=>r.fwd));
  const icN=corr(va.map(scNoRsi),va.map(r=>r.fwd));
  const icW=corr(va.map(scW),va.map(r=>r.fwd));
  console.log(`H=${H}d (val n=${va.length}) | ICs train: ${keys.map(k=>k+' '+(ic[k]>=0?'+':'')+ic[k].toFixed(2)).join('  ')}`);
  console.log(`   VAL IC → media simple ACTUAL=${icE.toFixed(3)} | sin rsiW=${icN.toFixed(3)} | pond. por IC (${wpos.join('+')})=${icW.toFixed(3)}`);
}
