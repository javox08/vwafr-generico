const oh=require(process.env.SP+'/btc_ohlc.json');const n=oh.length,H=10;
const cl=oh.map(k=>k.c),op=oh.map(k=>k.o),hi=oh.map(k=>k.h),lo=oh.map(k=>k.l);
const body=j=>Math.abs(cl[j]-op[j]),rng=j=>hi[j]-lo[j];
const upW=j=>hi[j]-Math.max(op[j],cl[j]),dnW=j=>Math.min(op[j],cl[j])-lo[j];
const bull=j=>cl[j]>op[j],bear=j=>cl[j]<op[j];
const aBody=(j,w=14)=>{let s=0,c=0;for(let m=Math.max(1,j-w);m<j;m++){s+=Math.abs(cl[m]-op[m]);c++;}return c?s/c:0;};
const start=Math.min(205,Math.floor(n*0.55));
const cnt=(fn)=>{let k=0,win=0,c=0;for(let j=start;j<n-1;j++){if(fn(j)){k++;if(j+H<n){if((cl[j+H]-cl[j])/cl[j]>0)win++;c++;}}}return {n:k,win:c?Math.round(win/c*100):0};};
const P={
 'Martillo':j=>rng(j)>0&&dnW(j)>2*body(j)&&upW(j)<body(j)&&cl[j-1]<cl[j-3],
 'Estrella fugaz':j=>rng(j)>0&&upW(j)>2*body(j)&&dnW(j)<body(j)&&cl[j-1]>cl[j-3],
 'Envolvente alcista':j=>bull(j)&&bear(j-1)&&cl[j]>=op[j-1]&&op[j]<=cl[j-1],
 'Envolvente bajista':j=>bear(j)&&bull(j-1)&&op[j]>=cl[j-1]&&cl[j]<=op[j-1],
 'Doji':j=>rng(j)>0&&body(j)<0.1*rng(j),
 'Estrella amanecer':j=>bear(j-2)&&body(j-1)<aBody(j-1)*0.6&&bull(j)&&cl[j]>(op[j-2]+cl[j-2])/2,
 'Estrella atardecer':j=>bull(j-2)&&body(j-1)<aBody(j-1)*0.6&&bear(j)&&cl[j]<(op[j-2]+cl[j-2])/2,
 'Tres soldados':j=>bull(j)&&bull(j-1)&&bull(j-2)&&cl[j]>cl[j-1]&&cl[j-1]>cl[j-2],
 'Tres cuervos':j=>bear(j)&&bear(j-1)&&bear(j-2)&&cl[j]<cl[j-1]&&cl[j-1]<cl[j-2],
 'Marubozu alcista':j=>bull(j)&&body(j)>aBody(j)*1.6&&upW(j)<0.1*body(j)&&dnW(j)<0.1*body(j),
 'Marubozu bajista':j=>bear(j)&&body(j)>aBody(j)*1.6&&upW(j)<0.1*body(j)&&dnW(j)<0.1*body(j),
 'Harami alcista':j=>bull(j)&&bear(j-1)&&cl[j]<op[j-1]&&op[j]>cl[j-1]&&body(j)<body(j-1)*0.6,
 'Harami bajista':j=>bear(j)&&bull(j-1)&&op[j]<cl[j-1]&&cl[j]>op[j-1]&&body(j)<body(j-1)*0.6,
 'Linea penetrante':j=>bull(j)&&bear(j-1)&&op[j]<lo[j-1]&&cl[j]>(op[j-1]+cl[j-1])/2&&cl[j]<op[j-1],
 'Nube oscura':j=>bear(j)&&bull(j-1)&&op[j]>hi[j-1]&&cl[j]<(op[j-1]+cl[j-1])/2&&cl[j]>op[j-1],
 'Hueco alcista':j=>op[j]>hi[j-1],
 'Hueco bajista':j=>op[j]<lo[j-1],
 'Pinzas suelo':j=>Math.abs(lo[j]-lo[j-1])<0.001*cl[j]&&cl[j-1]<cl[j-3]&&bull(j),
 'Pinzas techo':j=>Math.abs(hi[j]-hi[j-1])<0.001*cl[j]&&cl[j-1]>cl[j-3]&&bear(j),
 'Tres metodos alcistas':j=>bull(j)&&bull(j-1)&&bull(j-2)&&body(j)>aBody(j)*0.7&&cl[j-1]>cl[j-2]&&cl[j]>cl[j-1]&&op[j]<cl[j-1]&&op[j]>op[j-1],
 'Belt hold alcista':j=>bull(j)&&op[j]<=lo[j]*1.001&&body(j)>aBody(j)*1.2,
 'Belt hold bajista':j=>bear(j)&&op[j]>=hi[j]*0.999&&body(j)>aBody(j)*1.2,
 'Doji libelula':j=>rng(j)>0&&body(j)<0.1*rng(j)&&dnW(j)>3*body(j)&&upW(j)<body(j),
 'Doji lapida':j=>rng(j)>0&&body(j)<0.1*rng(j)&&upW(j)>3*body(j)&&dnW(j)<body(j),
 'Contraataque alcista':j=>bull(j)&&bear(j-1)&&Math.abs(op[j]-cl[j-1])<0.001*cl[j]&&body(j)>aBody(j),
 'Contraataque bajista':j=>bear(j)&&bull(j-1)&&Math.abs(op[j]-cl[j-1])<0.001*cl[j]&&body(j)>aBody(j),
 'Marubozu+soldados':j=>bull(j-1)&&bull(j-2)&&bull(j-3)&&cl[j-1]>cl[j-2]&&cl[j-2]>cl[j-3]&&bull(j)&&body(j)>aBody(j)*1.3&&upW(j)<0.2*body(j)&&dnW(j)<0.2*body(j),
};
const res=Object.entries(P).map(([k,f])=>({k,...cnt(f)})).sort((a,b)=>a.n-b.n);
console.log('velas:',n,'· backtest desde',start,'('+(n-start)+' días, ~'+((n-start)/365).toFixed(0)+' años)');
console.log('\nPatrón                     n     acierto   (n<15 = criterio MUY estricto)');
for(const r of res)console.log('  '+r.k.padEnd(24)+' '+String(r.n).padStart(4)+'   '+r.win+'%'+(r.n<15?'   ⚠️ ESTRICTO':(r.n<40?'   ⚠ pocos':'')));
