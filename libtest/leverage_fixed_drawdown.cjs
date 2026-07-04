// Caída máxima de la ÉLITE a apalancamiento FIJO (modelo real del worker: notional = L×cuenta,
// LONG/FLAT). Mapea BITUNIX_LEV → drawdown y CAGR. Periodos 2018+, 2020+ y todo el ciclo reciente.
const fs=require('fs');
const CL=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8')).closes;
const FEE=0.0004,FUND=0.0003,SLIP=0.0005;
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0,std=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)*(x-m))));};
const maAt=(cl,j,n)=>{let s=0;for(let m=j-n;m<j;m++)s+=cl[m];return s/n;};
const elite=(cl,j)=>{if(j<210)return 0;const px=cl[j-1];let hi=-1e18,lo=1e18;for(let m=j-100;m<j;m++){if(cl[m]>hi)hi=cl[m];if(cl[m]<lo)lo=cl[m];}
  let mu=0;for(let k=j-30;k<j;k++)mu+=Math.log(cl[k]/cl[k-1]);mu/=30;let vv=0;for(let k=j-30;k<j;k++){const x=Math.log(cl[k]/cl[k-1])-mu;vv+=x*x;}
  const sd=Math.sqrt(vv/30)*Math.sqrt(30),vm=sd>0?(cl[j-1]/cl[j-1-30]-1)/sd:0;return px>maAt(cl,j,200)&&vm>0&&px>(hi+lo)/2?1:0;};
function simFix(cl,L){const n=cl.length,cost=FEE+SLIP;let eq=1,pos=0,peak=1,maxDD=0;const start=220,dr=[];
  for(let j=start;j<n;j++){const sig=elite(cl,j)?L:0;
    if(sig!==pos){if(pos!==0)eq*=(1-cost*Math.abs(pos));if(sig!==0)eq*=(1-cost*sig);pos=sig;}
    const eq0=eq,r=cl[j]/cl[j-1]-1;if(pos!==0)eq*=Math.max(1e-4,1+pos*r-Math.abs(pos)*FUND);dr.push(eq/eq0-1);
    if(eq>peak)peak=eq;const dd=(peak-eq)/peak;if(dd>maxDD)maxDD=dd;}
  const years=(n-start)/365;return {cagr:(Math.pow(Math.max(eq,1e-6),1/years)-1)*100,maxDD:maxDD*100,sharpe:std(dr)>0?mean(dr)/std(dr)*Math.sqrt(365):0};}
for(const [lbl,from] of [['2018+',2400],['2020+',3100],['2022+',3800]]){
  const sub=CL.slice(from);console.log('\n===== '+lbl+' =====  apal.fijo | CAÍDA MÁX | CAGR | Sharpe');
  for(const L of [1,1.1,1.5,2,2.5,3]){const r=simFix(sub,L);
    console.log(`  ${L}x`.padEnd(8)+' | '+r.maxDD.toFixed(0)+'%'.padEnd(4)+'   | '+r.cagr.toFixed(0)+'%   | '+r.sharpe.toFixed(2));}
}
