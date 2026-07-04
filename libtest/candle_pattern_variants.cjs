const oh=require(process.env.SP+'/btc_ohlc.json');
const n=oh.length,H=10,HM=30;
const cl=oh.map(k=>k.c),op=oh.map(k=>k.o),hi=oh.map(k=>k.h),lo=oh.map(k=>k.l);
const body=j=>Math.abs(cl[j]-op[j]);const upW=j=>hi[j]-Math.max(op[j],cl[j]),dnW=j=>Math.min(op[j],cl[j])-lo[j];
const bull=j=>cl[j]>op[j];const aBody=(j,w=14)=>{let s=0,c=0;for(let m=Math.max(1,j-w);m<j;m++){s+=Math.abs(cl[m]-op[m]);c++;}return c?s/c:0;};
const start=Math.min(205,Math.floor(n*0.55));
const bt=fn=>{let k=0,win=0;const acc=new Array(HM+1).fill(0),cnt=new Array(HM+1).fill(0);
  for(let j=start;j<n-1;j++){if(fn(j)){k++;for(let h=1;h<=HM&&j+h<n;h++){acc[h]+=(cl[j+h]-cl[j])/cl[j];cnt[h]++;}
    if(j+H<n){if((cl[j+H]-cl[j])/cl[j]>0)win++;}}}
  if(k<4)return {n:k,note:'<4'};const wn=cnt[H]||k,pw=win/wn;
  return {n:k,win:Math.round(pw*100),ci:Math.round(Math.sqrt(pw*(1-pw)/Math.max(1,wn))*196),avg10:+((acc[10]/(cnt[10]||1))*100).toFixed(1),avg30:+((acc[30]/(cnt[30]||1))*100).toFixed(1)};};
const sol=j=>bull(j-1)&&bull(j-2)&&bull(j-3)&&cl[j-1]>cl[j-2]&&cl[j-2]>cl[j-3];
// variantes de la 4ª vela (marubozu con distinta exigencia)
const V={
 'estricto (actual: cuerpo>1.6x, mechas<10%)':j=>sol(j)&&bull(j)&&body(j)>aBody(j)*1.6&&upW(j)<0.1*body(j)&&dnW(j)<0.1*body(j),
 'medio (cuerpo>1.3x, mechas<20%)':j=>sol(j)&&bull(j)&&body(j)>aBody(j)*1.3&&upW(j)<0.2*body(j)&&dnW(j)<0.2*body(j),
 'suave (cuerpo>1.1x, mechas<30%)':j=>sol(j)&&bull(j)&&body(j)>aBody(j)*1.1&&upW(j)<0.3*body(j)&&dnW(j)<0.3*body(j),
 'solo 4ª verde y cierra arriba':j=>sol(j)&&bull(j)&&cl[j]>cl[j-1]&&body(j)>aBody(j)*0.8,
};
console.log('velas:',n);
for(const name in V)console.log(name.padEnd(46)+' '+JSON.stringify(bt(V[name])));
