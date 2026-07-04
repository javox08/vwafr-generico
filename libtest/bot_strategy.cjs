// Replica FIEL de simulateBot() del app + prueba de estrategias candidatas (LONG/FLAT).
// Objetivo: máxima rentabilidad ajustada a riesgo FUERA DE MUESTRA (Sharpe/CAGR/DD).
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes;
const FEE=0.0004,FUND=0.0003,SLIP=0.0005;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const std=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)*(x-m))));};
const maAt=(cl,j,n)=>{let s=0;for(let m=j-n;m<j;m++)s+=cl[m];return s/n;};
const momAt=(cl,j,k)=>(j>k&&cl[j-1-k]>0)?cl[j-1]/cl[j-1-k]-1:0;
function volSc(cl,j,n){let m=0;for(let k=j-n;k<j;k++)m+=Math.log(cl[k]/cl[k-1]);m/=n;let s=0;for(let k=j-n;k<j;k++){const x=Math.log(cl[k]/cl[k-1])-m;s+=x*x;}return Math.sqrt(s/n);}
function sim(cl,sigFn){
  const n=cl.length;if(n<260)return null;
  const cost=FEE+SLIP;
  const lr=[];for(let i=1;i<n;i++)lr.push(Math.log(cl[i]/cl[i-1]));
  const vol=j=>{let m=0;for(let k=j-20;k<j;k++)m+=lr[k-1];m/=20;let s=0;for(let k=j-20;k<j;k++){const x=lr[k-1]-m;s+=x*x;}return Math.sqrt(s/20);};
  let eq=1,pos=0,sz=0,trades=0,wins=0,entryEq=1,peak=1,maxDD=0;const start=220,dr=[];
  for(let j=start;j<n;j++){
    const sig=sigFn(cl,j);
    const rv=vol(j)||0.02,lev=Math.max(0.25,Math.min(3,0.022/rv));
    if(Math.sign(sig)!==Math.sign(pos)||Math.abs(sig-pos)>=0.08){
      if(pos!==0){trades++;if(eq>=entryEq)wins++;eq*=(1-cost*Math.abs(sz));}
      if(sig!==0){eq*=(1-cost*lev);entryEq=eq;}
      pos=sig;sz=sig*lev;
    }
    const eq0=eq,r=cl[j]/cl[j-1]-1;
    if(pos!==0)eq*=Math.max(1e-4,1+sz*r-Math.abs(sz)*FUND);
    dr.push(eq/eq0-1);
    if(eq>peak)peak=eq;const dd=(peak-eq)/peak;if(dd>maxDD)maxDD=dd;
  }
  const years=(n-start)/365,m=mean(dr),sd=std(dr);
  let dn=0;for(const x of dr)if(x<0)dn+=x*x;const ddv=Math.sqrt(dn/dr.length);
  const cagr=(Math.pow(Math.max(eq,1e-6),1/years)-1)*100;
  return {cagr,sharpe:sd>0?m/sd*Math.sqrt(365):0,sortino:ddv>0?m/ddv*Math.sqrt(365):0,
    maxDD:maxDD*100,calmar:maxDD>0?(cagr/100)/maxDD:0,trades,winRate:trades?wins/trades*100:0,eq};
}
// hold benchmark
function hold(cl){const start=220,n=cl.length;const mult=cl[n-1]/cl[start-1];const years=(n-start)/365;
  let hp=cl[start-1],hdd=0;for(let j=start-1;j<n;j++){if(cl[j]>hp)hp=cl[j];const d=(hp-cl[j])/hp;if(d>hdd)hdd=d;}
  const dr=[];for(let j=start;j<n;j++)dr.push(cl[j]/cl[j-1]-1);
  return {cagr:(Math.pow(mult,1/years)-1)*100,maxDD:hdd*100,sharpe:std(dr)>0?mean(dr)/std(dr)*Math.sqrt(365):0};}

const botSignal=(cl,j)=>{if(j<210)return 0;const ma50=maAt(cl,j,50),ma200=maAt(cl,j,200),px=cl[j-1],mom=cl[j-1]/cl[j-21]-1;
  if(px>ma50&&ma50>ma200&&mom>0)return 1;if(px<ma50&&ma50<ma200&&mom<0)return -1;return 0;};
// candidatas LONG/FLAT
const vm=(cl,j,n)=>momAt(cl,j,n)/((volSc(cl,j,n)*Math.sqrt(n))||1);
const C={
  'botSignal (actual)':botSignal,
  'volMom30 LF (px>MA200)':(cl,j)=>j<210?0:(cl[j-1]>maAt(cl,j,200)&&vm(cl,j,30)>0?1:0),
  'trend+mom LF':(cl,j)=>j<210?0:(cl[j-1]>maAt(cl,j,200)&&maAt(cl,j,50)>maAt(cl,j,200)&&momAt(cl,j,30)>0?1:0),
  'multi-mom LF (30&90)':(cl,j)=>j<210?0:(cl[j-1]>maAt(cl,j,200)&&momAt(cl,j,30)>0&&momAt(cl,j,90)>0?1:0),
  'Donchian100 LF':(cl,j)=>{if(j<210)return 0;let hi=-1e18,lo=1e18;for(let m=j-100;m<j;m++){if(cl[m]>hi)hi=cl[m];if(cl[m]<lo)lo=cl[m];}return cl[j-1]>(hi+lo)/2&&cl[j-1]>maAt(cl,j,200)?1:0;},
  'px>MA200 LF (puro)':(cl,j)=>j<210?0:(cl[j-1]>maAt(cl,j,200)?1:0),
  'volMom+trend blend LF':(cl,j)=>{if(j<210)return 0;const px=cl[j-1],reg=px>maAt(cl,j,200),mv=Math.max(-1,Math.min(1,vm(cl,j,30)*1.3));return reg&&mv>0.1?1:0;},
};
const half=Math.floor(CL.length/2);
const TR=CL.slice(0,half), OOS=CL.slice(Math.max(0,half-210));
console.log('HOLD  full:',JSON.stringify(hold(CL),(k,v)=>typeof v==='number'?+v.toFixed(2):v));
console.log('\n%-26s | %-28s | %-28s'.replace(/%-(\d+)s/g,(m,n)=>' '.repeat(0)+'ESTRATEGIA'.padEnd(0)),'','');
for(const name in C){
  const f=sim(CL,C[name]),tr=sim(TR,C[name]),oo=sim(OOS,C[name]);
  const fx=x=>x.toFixed(1);
  console.log(name.padEnd(26)+' | FULL cagr '+fx(f.cagr)+'% sh '+f.sharpe.toFixed(2)+' DD '+fx(f.maxDD)+'% cal '+f.calmar.toFixed(2)+' win '+fx(f.winRate)+'% | OOS cagr '+fx(oo.cagr)+'% sh '+oo.sharpe.toFixed(2)+' DD '+fx(oo.maxDD)+'%');
}

console.log('\n=== VARIANTES CON CONTROL DE CAÍDA (protección de crash) ===');
const donMid=(cl,j,n)=>{let hi=-1e18,lo=1e18;for(let m=j-n;m<j;m++){if(cl[m]>hi)hi=cl[m];if(cl[m]<lo)lo=cl[m];}return (hi+lo)/2;};
const C2={
  'volMom+Donchian regime':(cl,j)=>j<210?0:(vm(cl,j,30)>0&&cl[j-1]>donMid(cl,j,100)&&cl[j-1]>maAt(cl,j,200)?1:0),
  'volMom+MA50 crash-stop':(cl,j)=>j<210?0:(vm(cl,j,30)>0&&cl[j-1]>maAt(cl,j,200)&&cl[j-1]>maAt(cl,j,50)?1:0),
  'Donchian+volMom (ambos)':(cl,j)=>{if(j<210)return 0;let hi=-1e18,lo=1e18;for(let m=j-100;m<j;m++){if(cl[m]>hi)hi=cl[m];if(cl[m]<lo)lo=cl[m];}return cl[j-1]>(hi+lo)/2&&vm(cl,j,30)>0?1:0;},
  'triple filtro (MA200+Don+volMom)':(cl,j)=>j<210?0:(cl[j-1]>maAt(cl,j,200)&&cl[j-1]>donMid(cl,j,60)&&vm(cl,j,20)>0?1:0),
  'MA20>MA100 + volMom':(cl,j)=>j<210?0:(maAt(cl,j,20)>maAt(cl,j,100)&&vm(cl,j,30)>0?1:0),
};
for(const name in C2){
  const f=sim(CL,C2[name]),tr=sim(TR,C2[name]),oo=sim(OOS,C2[name]);
  const fx=x=>x.toFixed(1);
  console.log(name.padEnd(30)+' | FULL cagr '+fx(f.cagr)+'% sh '+f.sharpe.toFixed(2)+' DD '+fx(f.maxDD)+'% cal '+f.calmar.toFixed(2)+' | OOS cagr '+fx(oo.cagr)+'% sh '+oo.sharpe.toFixed(2)+' DD '+fx(oo.maxDD)+'% cal '+oo.calmar.toFixed(2)+' | TR sh '+tr.sharpe.toFixed(2));
}

console.log('\n=== FLAGSHIP: volMom+régimen Donchian, sizing fraccionado (control de cola) ===');
const flag=(frac)=>(cl,j)=>{if(j<210)return 0;const px=cl[j-1];
  const reg=px>maAt(cl,j,200);const mv=vm(cl,j,30);
  let hi=-1e18,lo=1e18;for(let m=j-100;m<j;m++){if(cl[m]>hi)hi=cl[m];if(cl[m]<lo)lo=cl[m];}
  return reg&&mv>0&&px>(hi+lo)/2?frac:0;};
for(const frac of [1,0.75,0.6,0.5]){
  const f=sim(CL,flag(frac)),oo=sim(OOS,flag(frac)),tr=sim(TR,flag(frac));
  const fx=x=>x.toFixed(1);
  console.log(('sig='+frac).padEnd(10)+' | FULL cagr '+fx(f.cagr)+'% sh '+f.sharpe.toFixed(2)+' DD '+fx(f.maxDD)+'% | OOS cagr '+fx(oo.cagr)+'% sh '+oo.sharpe.toFixed(2)+' DD '+fx(oo.maxDD)+'% cal '+oo.calmar.toFixed(2)+' win '+fx(oo.winRate)+'% | TR sh '+tr.sharpe.toFixed(2));
}

console.log('\n=== FLAGSHIP (sig=1) en distintos periodos (realismo) ===');
const flag1=flag(1);
for(const [lbl,from] of [['2011+ (todo)',0],['2015+',1200],['2018+ (2 ciclos)',2400],['2020+',3100]]){
  const sub=CL.slice(from);const s=sim(sub,flag1);const h=hold(sub);const fx=x=>x.toFixed(1);
  console.log(lbl.padEnd(18)+' | BOT cagr '+fx(s.cagr)+'% sh '+s.sharpe.toFixed(2)+' DD '+fx(s.maxDD)+'% cal '+s.calmar.toFixed(2)+' win '+fx(s.winRate)+'% | HOLD cagr '+fx(h.cagr)+'% sh '+h.sharpe.toFixed(2)+' DD '+fx(h.maxDD)+'%');
}
