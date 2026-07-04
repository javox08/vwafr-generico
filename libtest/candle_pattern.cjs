const oh=require(process.env.SP+'/btc_ohlc.json');
const n=oh.length,H=10,HM=30;
const cl=oh.map(k=>k.c),op=oh.map(k=>k.o),hi=oh.map(k=>k.h),lo=oh.map(k=>k.l);
const body=j=>Math.abs(cl[j]-op[j]),rng=j=>hi[j]-lo[j];
const upW=j=>hi[j]-Math.max(op[j],cl[j]),dnW=j=>Math.min(op[j],cl[j])-lo[j];
const bull=j=>cl[j]>op[j];const aBody=(j,w=14)=>{let s=0,c=0;for(let m=Math.max(1,j-w);m<j;m++){s+=Math.abs(cl[m]-op[m]);c++;}return c?s/c:0;};
const start=Math.min(205,Math.floor(n*0.55));let muD=0;for(let j=1;j<n;j++)muD+=(cl[j]-cl[j-1])/cl[j-1];muD/=(n-1);
const bt=fn=>{let k=0,win=0,sum=0;const acc=new Array(HM+1).fill(0),cnt=new Array(HM+1).fill(0);
  for(let j=start;j<n-1;j++){if(fn(j)){k++;for(let h=1;h<=HM&&j+h<n;h++){acc[h]+=(cl[j+h]-cl[j])/cl[j];cnt[h]++;}
    if(j+H<n){const r=(cl[j+H]-cl[j])/cl[j];sum+=r;if(r>0)win++;}}}
  if(k<4)return {n:k,note:'muy pocos casos'};
  const wn3=cnt[H]||k,pw=win/wn3;return {n:k,win:Math.round(pw*100),avg10:+((acc[10]/(cnt[10]||1))*100).toFixed(1),avg30:+((acc[30]/(cnt[30]||1))*100).toFixed(1)};};
const maru=j=>bull(j)&&body(j)>aBody(j)*1.6&&upW(j)<0.1*body(j)&&dnW(j)<0.1*body(j);
const soldiers=j=>bull(j)&&bull(j-1)&&bull(j-2)&&cl[j]>cl[j-1]&&cl[j-1]>cl[j-2];
// patrón combinado: 3 soldados (j-3..j-1) y marubozu en j
const combo=j=>j>4&&bull(j-1)&&bull(j-2)&&bull(j-3)&&cl[j-1]>cl[j-2]&&cl[j-2]>cl[j-3]&&maru(j);
console.log('velas OHLC:',n,'· desde start=',start);
console.log('Marubozu solo:          ',JSON.stringify(bt(maru)));
console.log('3 soldados solo:        ',JSON.stringify(bt(soldiers)));
console.log('3 SOLDADOS + MARUBOZU:  ',JSON.stringify(bt(combo)));
// base: subida media a 10d de cualquier día
let b=0,bc=0;for(let j=start;j<n-10;j++){b+=(cl[j+10]-cl[j])/cl[j]>0?1:0;bc++;}
console.log('base "sube a 10d":',Math.round(b/bc*100)+'%');
