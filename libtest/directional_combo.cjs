// ¿Una COMBINACIÓN de señales robustas supera el IC de una sola? Ridge fit en TRAIN,
// IC en VAL (3 splits). Estandariza señales. Compara sets. También pinball: ¿centrar el
// cono en el predictor mejora la banda vs centro neutro?
const fs=require('fs');
const D=JSON.parse(fs.readFileSync('libtest/btc_daily.json','utf8'));
const CL=D.closes,N=CL.length;const ln=x=>Math.log(x);const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
function corr(xs,ys){const mx=mean(xs),my=mean(ys);let sxy=0,sx=0,sy=0;for(let i=0;i<xs.length;i++){const dx=xs[i]-mx,dy=ys[i]-my;sxy+=dx*dy;sx+=dx*dx;sy+=dy*dy;}return sxy/(Math.sqrt(sx*sy)||1);}
function ma(t,n){let s=0;for(let i=t-n+1;i<=t;i++)s+=CL[i];return s/n;}
function rsi(t,n){let up=0,dn=0;for(let i=t-n+1;i<=t;i++){const ch=CL[i]-CL[i-1];if(ch>0)up+=ch;else dn-=ch;}return 100-100/(1+up/(dn||1e-9));}
function donch(t,n){let mn=1e18,mx=-1e18;for(let i=t-n+1;i<=t;i++){if(CL[i]<mn)mn=CL[i];if(CL[i]>mx)mx=CL[i];}return (CL[t]-mn)/((mx-mn)||1);}
function vol(t,n){let m=0;for(let i=t-n+1;i<=t;i++)m+=ln(CL[i]/CL[i-1]);m/=n;let s=0;for(let i=t-n+1;i<=t;i++){const x=ln(CL[i]/CL[i-1])-m;s+=x*x;}return Math.sqrt(s/n);}
const SIG={
  volMom30:t=>ln(CL[t]/CL[t-30])/(vol(t,30)*Math.sqrt(30)||1),
  maDist50:t=>CL[t]/ma(t,50)-1, rsi14:t=>(rsi(t,14)-50)/50,
  donch100:t=>donch(t,100)-0.5, mom90:t=>ln(CL[t]/CL[t-90]),
  rev5:t=>-ln(CL[t]/CL[t-5]),
};
function ridge(X,y,lam){const p=X[0].length,XtX=Array.from({length:p},()=>new Float64Array(p)),Xty=new Float64Array(p);
  for(let i=0;i<X.length;i++)for(let a=0;a<p;a++){Xty[a]+=X[i][a]*y[i];for(let b=0;b<p;b++)XtX[a][b]+=X[i][a]*X[i][b];}
  for(let a=0;a<p;a++)XtX[a][a]+=lam;
  // solve XtX w = Xty (Gauss)
  const M=XtX.map((r,i)=>[...r,Xty[i]]);
  for(let c=0;c<p;c++){let piv=c;for(let r=c+1;r<p;r++)if(Math.abs(M[r][c])>Math.abs(M[piv][c]))piv=r;[M[c],M[piv]]=[M[piv],M[c]];
    for(let r=0;r<p;r++)if(r!==c){const f=M[r][c]/M[c][c];for(let k=c;k<=p;k++)M[r][k]-=f*M[c][k];}}
  const w=new Float64Array(p);for(let i=0;i<p;i++)w[i]=M[i][p]/M[i][i];return w; // w
}
const ALL=[];for(let t=250;t<N-31;t++)ALL.push(t);const SPLITS=[0.68,0.60,0.75];
const SETS={
  'volMom30 solo':['volMom30'],
  'trend(volMom30+maDist50+donch100)':['volMom30','maDist50','donch100'],
  '+rsi14':['volMom30','maDist50','donch100','rsi14'],
  '+rev5 (reversión)':['volMom30','maDist50','donch100','rsi14','rev5'],
  'todo':['volMom30','maDist50','rsi14','donch100','mom90','rev5'],
};
for(const d of [7,30]){
  console.log(`\n===== ${d}d · IC combinado (VAL 3 splits) =====`);
  const rows=ALL.filter(t=>t+d<N).map(t=>{const o={y:ln(CL[t+d]/CL[t])};for(const k in SIG)o[k]=SIG[k](t);return o;});
  // estandariza cada señal con stats del train principal
  const cut0=Math.floor(rows.length*0.68);const tr0=rows.slice(0,cut0);
  const st={};for(const k in SIG){const xs=tr0.map(r=>r[k]);st[k]={m:mean(xs),s:Math.sqrt(mean(xs.map(x=>(x-mean(xs))**2)))||1};}
  const z=(r,ks)=>ks.map(k=>(r[k]-st[k].m)/st[k].s);
  for(const name in SETS){const ks=SETS[name];
    const Xtr=tr0.map(r=>z(r,ks)),ytr=tr0.map(r=>r.y);
    const w=ridge(Xtr,ytr,1.0);
    const ics=SPLITS.map(f=>{const V=rows.slice(Math.floor(rows.length*f));const pred=V.map(r=>{const zz=z(r,ks);let s=0;for(let i=0;i<ks.length;i++)s+=zz[i]*w[i];return s;});return corr(pred,V.map(r=>r.y));});
    const rob=ics.every(x=>x>0.03);
    console.log(`  ${name.padEnd(38)} IC ${ics.map(x=>(x>=0?'+':'')+x.toFixed(3)).join(' ')} avg=${(mean(ics)>=0?'+':'')+mean(ics).toFixed(3)} ${rob?'★':''}`);
  }
}
