// MOCK COMPLETO: intercepta fetch y sirve datos sintéticos plausibles para que la vista
// CUANTITATIVA monte entera (klines multi-temporalidad, relé ls, on-chain, etc.)
(function(){
  var errs=[];window.addEventListener('error',function(e){errs.push('ERR: '+(e.message||e.error));});
  window.addEventListener('unhandledrejection',function(e){errs.push('REJ: '+(e.reason&&e.reason.message||e.reason));});
  window.__errs=errs;
  function klines(url){
    var u=new URL(url),limit=+(u.searchParams.get('limit')||500),iv=u.searchParams.get('interval')||'1d';
    var ms={'15m':9e5,'1h':36e5,'4h':144e5,'1d':864e5,'1w':6048e5}[iv]||864e5;
    var end=Date.now(),px=60000,rows=[];
    for(var i=limit-1;i>=0;i--){var t=end-i*ms;
      var r=(Math.random()-0.493)*0.02,o=px,c=px*(1+r);px=c;
      var h=Math.max(o,c)*(1+Math.random()*0.006),l=Math.min(o,c)*(1-Math.random()*0.006);
      var v=100+Math.random()*100,tb=v*(0.44+Math.random()*0.12);
      rows.push([t-ms,''+o,''+h,''+l,''+c,''+v,t+(i===0?ms/2:0),''+(v*c).toFixed(0),'0',''+tb,''+(tb*c).toFixed(0),'0']);}
    return rows;
  }
  var oiH=[];for(var i2=0;i2<480;i2++)oiH.push(+(6+Math.sin(i2/40)*0.3+Math.random()*0.05).toFixed(3));
  var pmH=[];for(var i3=0;i3<480;i3++)pmH.push(+((Math.random()-0.6)*0.08).toFixed(4));
  var fdH=[];for(var i4=0;i4<270;i4++)fdH.push(+((Math.random()*0.02)-0.005).toFixed(4));
  var mk=function(c,r,rp){return {c:c,r:r,srcs:3,rp:rp};};
  var lsData={t:Date.now(),coins:[mk('BTC',1.5,1.17),mk('ETH',1.8,1.05),mk('SOL',2.1,0.9),mk('XRP',1.2,1.3),mk('BNB',1.4,1.1),
    mk('DOGE',2.5,0.8),mk('ADA',1.1,1.2),mk('AVAX',1.7,0.95),mk('LINK',1.3,1.15),mk('LTC',1.6,1.0)],
    btc:{pos:1.17,posSrcs:2,posEx:['OKX','Binance'],posW:true,taker:{b:52300,s:49100,pl:0.5158},prem:-0.038,
      lsEx:{acc:{OKX:1.2,Bybit:1.35,Binance:1.95},pro:{OKX:1.008,Binance:1.35}},oiSplit:{coinM:1.42,stableM:6.63},skew:{rr:-9.27,atmIv:33.2,days:20},cvdAgg:{binUsd:820000000,okxUsd:1305000000},
      oiHist:oiH,premHist:pmH,cvdFut:oiH.map(function(v,i){return +(i*10-2000+Math.random()*50).toFixed(1);}),fundHist:fdH,premHistD:pmH.slice(0,90),oiHistD:oiH.slice(0,30),
      hist:Array.from({length:72},function(){return 1.5+Math.random()*0.1;})},
    mkt:{futVol:14.9,spotVol:1.2}};
  var J=function(o){return Promise.resolve(new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}));};
  window.fetch=function(u){u=''+u;
    try{
      if(u.indexOf('/api/ls')>=0)return J(lsData);
      if(u.indexOf('/api/fr')>=0)return J({t:Date.now(),ex:{Gate:{BTC:{f:0.004,oi:2.1}},MEXC:{BTC:{f:0.01,oi:4.9}},Binance:{BTC:{f:0.008,oi:12.2}},Bybit:{BTC:{f:0.006,oi:7.5}},Bitget:{BTC:{f:0.004,oi:2.2}},
        Kraken:{BTC:{f:0.0045,oi:0.12}},HTX:{BTC:{f:0.01,oi:2.06}},CoinEx:{BTC:{f:0,oi:0.075}},Bitfinex:{BTC:{f:0.0087,oi:0.57}},dYdX:{BTC:{f:-0.0136,oi:0.019}},WhiteBIT:{BTC:{f:-0.0039,oi:1.59}},Phemex:{BTC:{f:0.0065,oi:0.13}},Deribit:{BTC:{f:0.0018,oi:0.78}}}});
      if(u.indexOf('/api/funding')>=0)return J({updated:Date.now(),coins:['BTC','ETH','SOL','XRP','BNB','DOGE','ADA','AVAX','LINK','LTC'],data:{}});
      if(u.indexOf('/klines')>=0)return J(klines(u));
      if(u.indexOf('api.binance.com/api/v3/ticker/price')>=0)return J({price:'60000'});
      if(u.indexOf('coinbase.com/products/BTC-USD/ticker')>=0)return J({price:'60040'});
      if(u.indexOf('alternative.me')>=0)return J({data:[{value:'45',value_classification:'Fear'}]});
      if(u.indexOf('bitcoin-data.com/v1/mvrv/last')>=0)return J({mvrv:'1.21'});
      if(u.indexOf('bitcoin-data.com/v1/nupl/last')>=0)return J({nupl:'0.16'});
      if(u.indexOf('bitcoin-data.com/v1/mvrv-zscore/last')>=0)return J({mvrvZscore:'1.9'});
      if(u.indexOf('bitcoin-data.com/v1/mvrv-zscore')>=0){var zs=[];for(var z=0;z<1700;z++)zs.push({mvrvZscore:''+(2+Math.sin(z/120)*2.5).toFixed(2)});return J(zs);}
      if(u.indexOf('bitcoin-data.com/v1/puell-multiple/last')>=0)return J({puellMultiple:'0.92'});
      if(u.indexOf('bitcoin-data.com/v1/sopr/last')>=0)return J({sopr:'1.01'});
      if(u.indexOf('bitcoin-data.com/v1/fear-greed/last')>=0)return J({fearGreed:'45'});
      if(u.indexOf('bitcoin-data.com')>=0)return J({});
      if(u.indexOf('coingecko.com/api/v3/coins/markets')>=0)return J([{current_price:60000,ath:126000,ath_change_percentage:-52.4,price_change_percentage_24h:1.2,market_cap:1.19e12}]);
      if(u.indexOf('coingecko.com/api/v3/global')>=0)return J({data:{market_cap_percentage:{btc:56.3,eth:9.5},total_market_cap:{usd:2.281e12},market_cap_change_percentage_24h_usd:0.11}});
      if(u.indexOf('stablecoins.llama.fi')>=0)return J({peggedAssets:[{symbol:'USDT',circulating:{peggedUSD:1.7e11}},{symbol:'USDC',circulating:{peggedUSD:9e10}},{symbol:'DAI',circulating:{peggedUSD:5e10}}]});
      if(u.indexOf('companies/public_treasury/bitcoin')>=0)return J({total_holdings:1279882,total_value_usd:8.17e10,companies:[{name:'Strategy',total_holdings:640000}]});
      if(u.indexOf('okx.com/api/v5/market/ticker')>=0)return J({data:[{last:'60000',open24h:'59500'}]});
      if(u.indexOf('depth')>=0)return J({bids:[['60000','1']],asks:[['60010','1']]});
      // Banco Mundial (vista Macro/PIB): formato [meta,[{value,date,countryiso3code,country},…]]
      if(u.indexOf('api.worldbank.org')>=0){
        var m=u.match(/country\/([^/]+)\/indicator\/([^?]+)/);
        var cs=(m?m[1]:'USA').split(';'),code=m?m[2]:'';
        var mrv=+((u.match(/mrv=(\d+)/)||[])[1]||6),rows2=[];
        cs.forEach(function(c3,ci){
          for(var y=0;y<mrv;y++){
            var val=code==='NY.GDP.MKTP.CD'?(30-ci)*1e12:
              code==='SL.UEM.TOTL.ZS'?4+Math.sin(y)*0.5+ci*0.05:
              code==='FP.CPI.TOTL.ZG'?2.5+Math.cos(y)*0.8:
              Math.sin((2025-y)/3+ci)*2+2;
            rows2.push({value:+val,date:''+(2024-y),countryiso3code:c3,country:{id:c3.slice(0,2),value:c3}});
          }
        });
        return J([{page:1,pages:1,per_page:rows2.length,total:rows2.length},rows2]);
      }
      if(u.indexOf('frankfurter')>=0){var rt={'2025-07-01':{EUR:0.90,JPY:152,GBP:0.78},'2026-07-01':{EUR:0.91,JPY:149,GBP:0.79}};return J({rates:rt});}
      return J({});
    }catch(e){return J({});}
  };
})();
