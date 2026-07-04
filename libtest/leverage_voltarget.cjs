// Tabla apalancamiento ↔ drawdown ↔ CAGR de la estrategia ÉLITE.
// El motor dimensiona por volatilidad (lev=target/vol, con tope). Se varía el TOPE de
// apalancamiento y el objetivo de vol para ver qué caída máxima sale. Periodo 2018+ y 2020+.
const fs=require('fs');
const CL=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8')).closes;
const FEE=0.0004,FUND=0.0003,SLIP=0.0005;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const std=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)*(x-m))));};
const maAt=(cl,j,n)=>{let s=0;for(let m=j-n;m<j;m++)s+=cl[m];return s/n;};
const elite=(cl,j)=>{if(j<210)return 0;const px=cl[j-1];let hi=-1e18,lo=1e18;for(let m=j-100;m<j;m++){if(cl[m]>hi)hi=cl[m];if(cl[m]<lo)lo=cl[m];}
  let mu=0;for(let k=j-30;k<j;k++)mu+=Math.log(cl[k]/cl[k-1]);mu/=30;let vv=0;for(let k=j-30;k<j;k++){const x=Math.log(cl[k]/cl[k-1])-mu;vv+=x*x;}
  const sd=Math.sqrt(vv/30)*Math.sqrt(30),vm=sd>0?(cl[j-1]/cl[j-1-30]-1)/sd:0;return px>maAt(cl,j,200)&&vm>0&&px>(hi+lo)/2?1:0;};
// sim con TOPE de apalancamiento levCap y objetivo de vol tgt
function sim(cl,tgt,levCap){
  const n=cl.length,cost=FEE+SLIP;const lr=[];for(let i=1;i<n;i++)lr.push(Math.log(cl[i]/cl[i-1]));
  const vol=j=>{let m=0;for(let k=j-20;k<j;k++)m+=lr[k-1];m/=20;let s=0;for(let k=j-20;k<j;k++){const x=lr[k-1]-m;s+=x*x;}return Math.sqrt(s/20);};
  let eq=1,pos=0,sz=0,peak=1,maxDD=0;const start=220,dr=[];
  for(let j=start;j<n;j++){const sig=elite(cl,j);const lev=Math.max(0.25,Math.min(levCap,tgt/(vol(j)||0.02)));
    if(Math.sign(sig)!==Math.sign(pos)||Math.abs(sig-pos)>=0.08){if(pos!==0)eq*=(1-cost*Math.abs(sz));if(sig!==0)eq*=(1-cost*lev);pos=sig;sz=sig*lev;}
    const eq0=eq,r=cl[j]/cl[j-1]-1;if(pos!==0)eq*=Math.max(1e-4,1+sz*r-Math.abs(sz)*FUND);dr.push(eq/eq0-1);
    if(eq>peak)peak=eq;const dd=(peak-eq)/peak;if(dd>maxDD)maxDD=dd;}
  const years=(n-start)/365,cagr=(Math.pow(Math.max(eq,1e-6),1/years)-1)*100;
  let levSum=0,levN=0;for(let j=start;j<n;j++){if(elite(cl,j)){levSum+=Math.max(0.25,Math.min(levCap,tgt/(vol(j)||0.02)));levN++;}}
  return {cagr,maxDD:maxDD*100,sharpe:std(dr)>0?mean(dr)/std(dr)*Math.sqrt(365):0,avgLev:levN?levSum/levN:0};
}
for(const [lbl,from] of [['2018+',2400],['2020+',3100]]){
  const sub=CL.slice(from);
  console.log('\n===== '+lbl+' =====');
  console.log('objetivo vol · tope | apal.medio | CAÍDA MÁX | CAGR | Sharpe');
  for(const [tgt,cap] of [[0.022,3],[0.03,4],[0.04,5],[0.05,6],[0.06,8],[0.08,10]]){
    const r=sim(sub,tgt,cap);
    console.log(`  vol ${(tgt*100).toFixed(1)}% · tope ${cap}x`.padEnd(22)+' | '+r.avgLev.toFixed(1)+'x       | '+r.maxDD.toFixed(0)+'%'.padEnd(3)+'   | '+r.cagr.toFixed(0)+'%   | '+r.sharpe.toFixed(2));
  }
}
