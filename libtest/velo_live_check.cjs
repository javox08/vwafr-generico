// Replica la lógica del Análisis Velo de la web con DATOS REALES de ahora mismo
// (precio de Bitstamp ≈ Binance; derivados del relé) y muestra lo que diría la web.
const https=require('https');
const get=u=>new Promise((res,rej)=>{https.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});
(async()=>{
  const rel=JSON.parse(await get('https://vwafr-generico.vercel.app/api/ls?v='+Date.now()));
  const b=rel.btc||{};
  // precio 15m/1h/4h/1d de Bitstamp
  const ohlc=async(step,limit)=>{const j=JSON.parse(await get(`https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=${step}&limit=${limit}`));
    return j.data.ohlc.map(x=>({c:+x.close,v:+x.volume}));};
  const p15=await ohlc(900,96), p1h=await ohlc(3600,120), p4h=await ohlc(14400,120), p1d=await ohlc(86400,90);
  const slope=a=>{const m=a.length,mx=(m-1)/2;let my=0;for(const v of a)my+=v;my/=m;let nu=0,de=0;for(let i=0;i<m;i++){nu+=(i-mx)*(a[i]-my);de+=(i-mx)*(i-mx);}return de?nu/de:0;};
  console.log('=== DATOS EN VIVO (lo que muestra Velo) ===');
  const cv=b.cvdFut||[], oi=b.oiHist||[], pm=b.premHist||[], fd=b.fundHist||[];
  console.log('precio ahora:', p15[p15.length-1].c);
  console.log('CVD futuros: último', cv[cv.length-1],'BTC · 24h antes', cv[cv.length-25], '→', (cv[cv.length-1]-cv[cv.length-25]).toFixed(0),'BTC en 24h');
  console.log('OI: ahora $'+oi[oi.length-1]+'B · 24h antes $'+oi[oi.length-25]+'B →', ((oi[oi.length-1]/oi[oi.length-25]-1)*100).toFixed(2)+'%');
  console.log('premium ahora:', pm[pm.length-1]+'% · funding último:', fd[fd.length-1]+'% · taker 24h:', (b.taker&&b.taker.pl*100).toFixed(1)+'% long');
  console.log('\n=== LO QUE DIRÍA EL ANÁLISIS VELO DE LA WEB ===');
  // veredicto por TF (precio; el CVD por TF de la web es spot — aquí uso el de futuros como dinero)
  const tfs=[['15m',p15.map(k=>k.c)],['1h',p1h.map(k=>k.c)],['4h',p4h.map(k=>k.c)],['1D',p1d.map(k=>k.c)]];
  const cvdSlope=n=>{const seg=cv.slice(-n);return slope(seg);};
  const cvN={'15m':24,'1h':120,'4h':480,'1D':480};
  for(const [tf,cls] of tfs){
    const pSl=slope(cls)/(cls[0]||1)*cls.length;
    const cSl=cvdSlope(cvN[tf]);
    const pd=pSl>0.005?1:pSl<-0.005?-1:0, cd=cSl>0?1:cSl<0?-1:0;
    const verd=pd>0&&cd>0?'✅ SUBIDA CON RESPALDO':pd>0&&cd<0?'⚠️ SUBE SIN DINERO (divergencia)':
      pd<0&&cd<0?'🔻 BAJADA REAL':pd<0&&cd>0?'🧲 CAE PERO ABSORBEN':
      pd>0?'▲ sube · dinero neutro':pd<0?'▼ baja · dinero neutro':
      cd<0?'🧲 VENDEN pero AGUANTA · absorción':cd>0?'⚠️ COMPRAN pero no sube · distribución':'➖ lateral';
    console.log(`  ${tf}: precio ${(pSl*100).toFixed(2)}% del tramo · CVDfut ${cd>0?'↑':cd<0?'↓':'→'} → ${verd}`);
  }
  // motivo del movimiento actual (últimas 12/24 velas de 15m)
  const P=p15.map(k=>k.c),n3=P.length;
  let bars=12,rr=P[n3-1]/P[n3-1-bars]-1;const rr24=P[n3-1]/P[n3-25]-1;
  if(Math.abs(rr24)>Math.abs(rr)*1.6){bars=24;rr=rr24;}
  const horas=Math.max(1,Math.round(bars*0.25));
  console.log('\n  MOVIMIENTO ACTUAL: '+(rr>0?'SUBIENDO +':'BAJANDO ')+(rr*100).toFixed(2)+'% en ~'+horas+'h');
  if(Math.abs(rr)>=0.006){
    const dF=cv[cv.length-1]-cv[cv.length-1-horas];
    console.log('   · Futuros en el tramo: '+(dF>0?'compraron +':'vendieron ')+Math.round(dF)+' BTC netos');
    const chgL=(oi[oi.length-1]/oi[oi.length-1-horas]-1)*100;
    console.log('   · OI del tramo: '+(chgL>=0?'+':'')+chgL.toFixed(2)+'% → '+(rr>0?(chgL>0.15?'largos nuevos':chgL<-0.15?'CIERRE DE CORTOS':'estable'):(chgL>0.15?'cortos nuevos':chgL<-0.15?'desapalancamiento':'estable')));
  } else console.log('   (sin movimiento fuerte → "lateral")');
  console.log('   · premium '+pm[pm.length-1]+'% '+(pm[pm.length-1]<-0.02?'→ descuento/miedo':'')+' · taker '+(b.taker.pl*100).toFixed(1)+'% long');
})();
