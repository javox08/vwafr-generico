// ¿Es asimétrica la cobertura del cono? Mide por separado cuántas veces el precio real
// PERFORA la banda de ABAJO vs la de ARRIBA. Si es asimétrico, calibra colas por separado.
// Base: EWMA vol 0.97 (ya desplegada). Walk-forward, 3 splits.
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;const ln=x=>Math.log(x);
const PS2=new Float64Array(N);{let s=0;for(let i=1;i<N;i++){const r=ln(CL[i]/CL[i-1]);s+=r*r;PS2[i]=s;}}
const sigHistT=t=>Math.sqrt(PS2[t]/t);
const EWV=new Float64Array(N);{let s=ln(CL[1]/CL[0])**2;EWV[1]=Math.sqrt(s);for(let i=2;i<N;i++){const r=ln(CL[i]/CL[i-1]);s=0.97*s+0.03*r*r;EWV[i]=Math.sqrt(s);}}
const idx=(dem,p)=>dem[Math.min(dem.length-1,Math.max(0,Math.round(p/100*(dem.length-1))))];
const pinball=(tau,q,y)=>y>=q?(y-q)*tau:(q-y)*(1-tau);
function pre(origins,d){const P=[];for(const t of origins){if(t+d>=N)continue;
  const hr=[];for(let i=200;i+d<=t;i++)hr.push(ln(CL[i+d]/CL[i]));if(hr.length<60)continue;
  const mu=hr.reduce((a,x)=>a+x,0)/hr.length;hr.sort((a,b)=>a-b);const dem=hr.map(x=>x-mu);
  let vs=EWV[t]/(sigHistT(t)||1);vs=Math.max(0.6,Math.min(2.0,vs));
  P.push({dem,vs,actual:ln(CL[t+d]/CL[t])});}return P;}
// cobertura de cola: % de veces que el precio real cae por DEBAJO de la banda inferior (eLo)
// y por ENCIMA de la superior (eHi). Ideal para banda 90%: 5% por debajo, 5% por encima.
function tails(P,eLo,eHi){let below=0,above=0;for(const r of P){const m=idx(r.dem,50);
  const lo=(idx(r.dem,eLo)-m)*r.vs,hi=(idx(r.dem,eHi)-m)*r.vs;
  if(r.actual<lo)below++;if(r.actual>hi)above++;}return {below:below/P.length,above:above/P.length};}
function tailPin(P,eLo,eHi){let t=0;for(const r of P){const m=idx(r.dem,50);
  t+=pinball(0.05,(idx(r.dem,eLo)-m)*r.vs,r.actual)+pinball(0.95,(idx(r.dem,eHi)-m)*r.vs,r.actual);}return t/P.length;}
const ALL=[];for(let t=700;t<N-31;t+=2)ALL.push(t);const SPLITS=[0.68,0.60,0.75];
for(const d of [7,30]){
  console.log(`\n===== ${d}d · asimetría de colas (banda 90%, ideal 5%/5%) =====`);
  for(const f of SPLITS){const P=pre(ALL.slice(Math.floor(ALL.length*f)),d);const t=tails(P,4,96);
    console.log(`  split ${(f*100)|0}%: por DEBAJO ${(t.below*100).toFixed(1)}% · por ENCIMA ${(t.above*100).toFixed(1)}%`);}
  // prueba pares asimétricos: bajar el eLo (banda inferior más ancha) si perfora mucho
  console.log('  -- prueba pares (eLo/eHi) por pinball de colas, VAL 3 splits --');
  for(const [lo,hi] of [[4,96],[3,96],[3,97],[2.5,96],[3.5,95.5],[2,96]]){
    const dl=SPLITS.map(f=>tailPin(pre(ALL.slice(Math.floor(ALL.length*f)),d),lo,hi));
    const base=SPLITS.map(f=>tailPin(pre(ALL.slice(Math.floor(ALL.length*f)),d),4,96));
    const imp=dl.map((x,i)=>(base[i]-x)/base[i]*100);
    console.log(`  [${lo}/${hi}] pinball ${dl.map(x=>x.toFixed(5)).join(' ')} | Δ ${imp.map(x=>(x>=0?'+':'')+x.toFixed(2)+'%').join(' ')} ${imp.every(x=>x>0.05)?'★':''}`);
  }
}

console.log('\n===== 30d · asimétrico TARGETED (solo banda inferior) =====');
{const d=30;
 for(const [lo,hi] of [[4,96],[3.5,96],[3.25,96],[3,96],[3.5,96.5]]){
   const dl=SPLITS.map(f=>tailPin(pre(ALL.slice(Math.floor(ALL.length*f)),d),lo,hi));
   const base=SPLITS.map(f=>tailPin(pre(ALL.slice(Math.floor(ALL.length*f)),d),4,96));
   const imp=dl.map((x,i)=>(base[i]-x)/base[i]*100);
   const cov=SPLITS.map(f=>tails(pre(ALL.slice(Math.floor(ALL.length*f)),d),lo,hi));
   console.log(`  [${lo}/${hi}] Δpinball ${imp.map(x=>(x>=0?'+':'')+x.toFixed(2)+'%').join(' ')} | below ${cov.map(c=>(c.below*100).toFixed(1)).join('/')} above ${cov.map(c=>(c.above*100).toFixed(1)).join('/')} ${imp.every(x=>x>-0.1)&&imp.filter(x=>x>0.05).length>=2?'★casi-robusto':''}`);
 }}
