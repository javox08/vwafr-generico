const https=require('https');
function get(url){return new Promise((res,rej)=>{https.get(url,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
(async()=>{
  const DAY=86400;
  let end=Math.floor(Date.now()/1000);
  const map=new Map();
  for(let i=0;i<7;i++){ // 7 pages * 1000 = up to 7000 days
    const start=end-1000*DAY;
    const url=`https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000&start=${start}&end=${end}`;
    let j; try{j=JSON.parse(await get(url));}catch(e){console.error('parse fail page',i,e.message);break;}
    const arr=(j&&j.data&&j.data.ohlc)||[];
    if(!arr.length){console.error('empty page',i);break;}
    for(const o of arr){const t=+o.timestamp,c=parseFloat(o.close);if(t>0&&c>0)map.set(t,c);}
    const minT=Math.min(...arr.map(o=>+o.timestamp));
    end=minT-DAY;
    process.stderr.write(`page ${i}: ${arr.length} rows, oldest=${new Date(minT*1000).toISOString().slice(0,10)}\n`);
    await new Promise(r=>setTimeout(r,300));
  }
  const rows=[...map.entries()].sort((a,b)=>a[0]-b[0]);
  const closes=rows.map(r=>r[1]);
  const first=new Date(rows[0][0]*1000).toISOString().slice(0,10);
  const last=new Date(rows[rows.length-1][0]*1000).toISOString().slice(0,10);
  require('fs').writeFileSync(__dirname+"/btc_daily.json",JSON.stringify({first,last,n:closes.length,closes}));
  console.error(`SAVED ${closes.length} daily closes, ${first} .. ${last}`);
})();
