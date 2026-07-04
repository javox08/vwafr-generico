const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;
const LR=[];for(let i=1;i<N;i++)LR.push(Math.log(CL[i]/CL[i-1]));
const PS2=new Float64Array(LR.length+1);for(let k=0;k<LR.length;k++)PS2[k+1]=PS2[k]+LR[k]*LR[k];
const sigHistT=t=>Math.sqrt(PS2[t]/t);
const EWV=new Float64Array(N);{let s=LR[0]*LR[0];EWV[1]=Math.sqrt(s);for(let i=1;i<LR.length;i++){s=0.97*s+0.03*LR[i]*LR[i];EWV[i+1]=Math.sqrt(s);}}
const idx=(dem,p)=>dem[Math.min(dem.length-1,Math.max(0,Math.round(p/100*(dem.length-1))))];
const pinball=(tau,q,y)=>y>=q?(y-q)*tau:(q-y)*(1-tau);
const TAUS=[[0.05,4],[0.10,8],[0.25,25],[0.40,40],[0.50,50],[0.60,60],[0.75,75],[0.90,92],[0.95,96]];
function pre(origins,d){const P=[];for(const t of origins){if(t+d>=N)continue;
  const hr=[];for(let i=200;i+d<=t;i++)hr.push(Math.log(CL[i+d]/CL[i]));if(hr.length<60)continue;
  const mu=hr.reduce((a,x)=>a+x,0)/hr.length;hr.sort((a,b)=>a-b);const dem=hr.map(x=>x-mu);
  P.push({dem,raw:EWV[t]/(sigHistT(t)||1),actual:Math.log(CL[t+d]/CL[t])});}return P;}
function totScore(P,clamp,gamma){let t=0,c=0;for(const r of P){let vs=Math.pow(r.raw,gamma);vs=Math.max(clamp[0],Math.min(clamp[1],vs));const m=idx(r.dem,50);for(const [tau,e] of TAUS){const q=(idx(r.dem,e)-m)*vs;t+=pinball(tau,q,r.actual);c++;}}return t/c;}
const ALL=[];for(let t=700;t<N-31;t+=2)ALL.push(t);
const SPLITS=[0.68,0.60,0.75];
for(const d of [7,30]){
  console.log(`\n===== ${d}d =====`);
  const PV=SPLITS.map(f=>pre(ALL.slice(Math.floor(ALL.length*f)),d));
  const base=PV.map(P=>totScore(P,[0.6,2.0],1));
  console.log(`  ACTUAL clamp[0.6,2.0] γ=1: ${base.map(x=>x.toFixed(5)).join(' ')}`);
  console.log('  -- clamp --');
  for(const clamp of [[0.5,2.4],[0.7,1.8],[0.5,3.0],[0.4,2.4],[0.65,2.2]]){
    const sc=PV.map(P=>totScore(P,clamp,1));const dl=sc.map((s,i)=>(base[i]-s)/base[i]*100);
    console.log(`  [${clamp}] ${dl.map(x=>(x>=0?'+':'')+x.toFixed(2)+'%').join(' ')} ${dl.every(x=>x>0.05)?'★':''}`);
  }
  console.log('  -- gamma (clamp[0.6,2.0]) --');
  for(const g of [0.7,0.85,1.15,1.3]){
    const sc=PV.map(P=>totScore(P,[0.6,2.0],g));const dl=sc.map((s,i)=>(base[i]-s)/base[i]*100);
    console.log(`  γ=${g}: ${dl.map(x=>(x>=0?'+':'')+x.toFixed(2)+'%').join(' ')} ${dl.every(x=>x>0.05)?'★':''}`);
  }
}
