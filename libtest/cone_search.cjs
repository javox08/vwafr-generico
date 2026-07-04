const fs=require('fs');
const D=JSON.parse(fs.readFileSync(__dirname+"/btc_daily.json",'utf8'));
const CL=D.closes, N=CL.length;
const TAUS=[0.05,0.10,0.25,0.40,0.50,0.60,0.75,0.90,0.95];
const DEMS=[120,200,350,500], SIGW=[15,20,25,30,40];
const LR=[];for(let i=1;i<N;i++)LR.push(Math.log(CL[i]/CL[i-1])); // LR[i-1] = ret at day i
// prefix sum of squares of LR: PS2[k]=sum_{j<k} LR[j]^2
const PS2=new Float64Array(LR.length+1);for(let k=0;k<LR.length;k++)PS2[k+1]=PS2[k]+LR[k]*LR[k];
function sigHistT(t){/*sqrt(mean LR[0..t-1]^2)*/const m=PS2[t]/t;return Math.sqrt(m);}
function sigNowT(t,w){const a=t-w;const m=(PS2[t]-PS2[a])/w;return Math.sqrt(m);}
function idx(dem,p){return dem[Math.min(dem.length-1,Math.max(0,Math.round(p/100*(dem.length-1))))];}
function pinball(tau,q,y){return y>=q?(y-q)*tau:(q-y)*(1-tau);}

// Precompute per (d): for each origin t -> {demByStart:{ds:{dem,mu}}, sigNow:{w:val}, sigHist, actual}
function precompute(origins,d){
  const P=[];
  for(const t of origins){
    if(t+d>=N)continue;
    const sh=sigHistT(t); const sn={};for(const w of SIGW)sn[w]=sigNowT(t,w);
    const demByStart={};
    let ok=true;
    for(const ds of DEMS){
      const hr=[];for(let i=ds;i+d<=t;i++)hr.push(Math.log(CL[i+d]/CL[i]));
      if(hr.length<60){ok=false;break;}
      const mu=hr.reduce((a,x)=>a+x,0)/hr.length; hr.sort((a,b)=>a-b);
      const dem=hr.map(x=>x-mu);
      demByStart[ds]={dem,mu};
    }
    if(!ok)continue;
    P.push({t,sh,sn,demByStart,actual:Math.log(CL[t+d]/CL[t])});
  }
  return P;
}
function vsOf(p,cfg){let vs=cfg.useVs?(p.sn[cfg.sigWin]/(p.sh||p.sn[cfg.sigWin])):1;return Math.max(cfg.vsClamp[0],Math.min(cfg.vsClamp[1],vs));}
function rowsOf(P,cfg){return P.map(p=>{const D2=p.demByStart[cfg.demStart];return {dem:D2.dem,vs:vsOf(p,cfg),actual:p.actual,centerRet:cfg.drift==='mean'?D2.mu:0};});}
function score(rows,ePct){let tot=0,cnt=0;for(const r of rows){const med=idx(r.dem,50);for(let k=0;k<TAUS.length;k++){const q=r.centerRet+(idx(r.dem,ePct[k])-med)*r.vs;tot+=pinball(TAUS[k],q,r.actual);cnt++;}}return cnt?tot/cnt:Infinity;}
function coverage(rows,ePct,a,b){let ins=0,tot=0;for(const r of rows){const med=idx(r.dem,50);const lo=r.centerRet+(idx(r.dem,ePct[a])-med)*r.vs,hi=r.centerRet+(idx(r.dem,ePct[b])-med)*r.vs;if(r.actual>=lo&&r.actual<=hi)ins++;tot++;}return tot?ins/tot:0;}
function learnEpct(rows){const ePct=[];for(let k=0;k<TAUS.length;k++){let best=1e18,bp=TAUS[k]*100;const lo=Math.max(0.3,TAUS[k]*100-12),hi=Math.min(99.7,TAUS[k]*100+12);for(let p=lo;p<=hi;p+=0.3){let tot=0;for(const r of rows){const med=idx(r.dem,50);const q=r.centerRet+(idx(r.dem,p)-med)*r.vs;tot+=pinball(TAUS[k],q,r.actual);}if(tot<best){best=tot;bp=p;}}ePct.push(bp);}for(let k=1;k<ePct.length;k++)if(ePct[k]<ePct[k-1])ePct[k]=ePct[k-1];return ePct;}
function appEpct(d){const ql=d<=10?4:3,qh=d<=10?96:97;return [ql,8,25,40,50,60,75,92,qh];}

const ALL=[];for(let t=700;t<N-31;t+=3)ALL.push(t);
const cut=Math.floor(ALL.length*0.68);
const TRAIN=ALL.slice(0,cut),VAL=ALL.slice(cut);
console.log(`Datos ${N}d (${D.first}..${D.last}). origins train=${TRAIN.length} val=${VAL.length}`);
const grid=[];
for(const sigWin of SIGW)for(const demStart of DEMS)for(const useVs of [true,false])for(const vsClamp of [[0.6,2.0],[0.5,2.4],[0.7,1.6]])for(const drift of ['zero','mean'])grid.push({sigWin,demStart,useVs,vsClamp,drift});

const RESULT={};
for(const d of [7,30]){
  console.log(`\n===== HORIZONTE ${d}d ===== (${grid.length} configs)`);
  const PT=precompute(TRAIN,d), PV=precompute(VAL,d);
  const ae=appEpct(d);
  const appVaRows=rowsOf(PV,{sigWin:25,demStart:200,useVs:true,vsClamp:[0.6,2.0],drift:'zero'});
  const appVal=score(appVaRows,ae);
  console.log(`APP actual: VAL pinball=${appVal.toFixed(5)} cov90=${(coverage(appVaRows,ae,0,8)*100).toFixed(1)}% cov50=${(coverage(appVaRows,ae,2,6)*100).toFixed(1)}%`);
  let best=null;
  for(const cfg of grid){
    const tr=rowsOf(PT,cfg);if(tr.length<200)continue;
    const ep=learnEpct(tr);
    const va=rowsOf(PV,cfg);const vs=score(va,ep);
    if(!best||vs<best.vs)best={vs,cfg,ep,cov90:coverage(va,ep,0,8),cov50:coverage(va,ep,2,6)};
  }
  RESULT[d]={best,appVal,ae,appCov90:coverage(appVaRows,ae,0,8),appCov50:coverage(appVaRows,ae,2,6)};
  console.log(`MEJOR VAL: pinball=${best.vs.toFixed(5)} (mejora ${((appVal-best.vs)/appVal*100).toFixed(2)}% sobre app)`);
  console.log(`  cfg=${JSON.stringify(best.cfg)}`);
  console.log(`  cov90=${(best.cov90*100).toFixed(1)}% cov50=${(best.cov50*100).toFixed(1)}%`);
  console.log(`  ePct=[${best.ep.map(x=>x.toFixed(1)).join(', ')}]`);
}
fs.writeFileSync(__dirname+"/cone_search_result.json",JSON.stringify(RESULT,null,1));
