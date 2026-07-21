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
    cpi:{yoy:3.1,mom:0.24,month:'2026-05-01',prevYoy:3.4,prevMom:0.18,estMom:0.22,estYoy:3.0,estLastMom:0.16,estLastYoy:2.8,hist:[4.1,3.9,3.8,3.6,3.4,3.1]},
    jobs:{month:'2026-06-01',nfp:{act:57,prev:129,est:92,estLast:80,hist:[180,150,120,95,129,57]},unemp:{act:4.2,prev:4.3}},
    ppi:{yoy:2.4,mom:0.31,month:'2026-06-01',prevYoy:2.1,prevMom:0.18,estMom:0.2,estYoy:2.2,estLastMom:0.17,estLastYoy:2.0,hist:[1.6,1.8,1.9,2.0,2.1,2.4]},
    btc:{pos:1.17,posSrcs:2,posEx:['OKX','Binance'],posW:true,taker:{b:52300,s:49100,pl:0.5158},prem:-0.038,
      lsEx:{acc:{OKX:1.2,Bybit:1.35,Binance:1.95},pro:{OKX:1.008,Binance:1.35}},oiSplit:{coinM:1.42,stableM:6.63},skew:{rr:-9.27,atmIv:33.2,days:20},opts:{exp:'31JUL26',days:19,maxPain:64000,pc:0.41,callOI:67464,putOI:27603,spot:64196},cvdAgg:{binUsd:820000000,okxUsd:1305000000},
      oiHist:oiH,premHist:pmH,cvdFut:oiH.map(function(v,i){return +(i*10-2000+Math.random()*50).toFixed(1);}),fundHist:fdH,premHistD:pmH.slice(0,90),oiHistD:oiH.slice(0,30),
      hist:Array.from({length:72},function(){return 1.5+Math.random()*0.1;})},
    eth:{opts:{exp:'31JUL26',days:15,maxPain:1800,pc:0.59,callOI:181000,putOI:107000,spot:1917}},
    coinsX:(function(){var names=['SUI','PEPE','WIF','ARB','OP','APT','SEI','TIA','INJ','NEAR','FIL','TON','TRX','DOT','UNI','ATOM','FET','RNDR','SHIB','BONK','JUP','WLD','ENA','ONDO','AAVE','MKR','LDO','STX','IMX','HBAR'];
      return names.map(function(n,i){return {c:n,r:+(0.8+Math.random()*1.6).toFixed(3),oi:+(1.2/(i+2)).toFixed(4)};});})(),
    mkt:{futVol:14.9,spotVol:1.2}};
  var J=function(o){return Promise.resolve(new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}));};
  window.fetch=function(u){u=''+u;
    try{
      if(u.indexOf('/api/news')>=0)return J({t:Date.now(),items:[
        {t:'El bitcoin se aleja de mínimos con el IPC de EEUU',s:'Expansión',u:'https://example.com/1',d:Date.now()-40*6e4,hot:true},
        {t:'Bitcoin recupera los $65,000 tras resultados del IPP de EEUU',s:'Yahoo',u:'https://example.com/2',d:Date.now()-3*36e5,hot:false},
        {t:'La SEC aprueba nuevas reglas para los ETF de criptomonedas',s:'Investing.com España',u:'https://example.com/3',d:Date.now()-5*36e5,hot:false},
        {t:'Glassnode: Bitcoin podría estar formando un suelo',s:'FXStreet',u:'https://example.com/4',d:Date.now()-9*36e5,hot:false}]});
      if(u.indexOf('/api/social')>=0)return J({t:Date.now(),tiktok:{f:531,v:782,likes:10400},youtube:{subs:'34 subscribers'},twitch:{live:false,f:107},x:{f:24},fb1:{name:'Notici Javox'},fb2:{name:'NotiExpress',n:'3 me gusta'}});
      if(u.indexOf('/api/ls')>=0)return J(lsData);
      if(u.indexOf('/api/fr')>=0){
        // OI (en $B) por moneda y exchange, sintético pero plausible (BTC el mayor)
        var oiBase={BTC:12,ETH:6,SOL:2.5,XRP:1.8,BNB:1.2,DOGE:1.5,ADA:0.9,AVAX:0.7,LINK:0.6,LTC:0.5};
        var mkEx=function(mult){var o={};for(var cc in oiBase)o[cc]={f:+((Math.random()*0.02)-0.005).toFixed(4),oi:+(oiBase[cc]*mult*(0.6+Math.random()*0.6)).toFixed(3)};return o;};
        var exNames=['Gate','MEXC','Binance','Bybit','Bitget','Kraken','HTX','CoinEx','Bitfinex','dYdX','WhiteBIT','Phemex','Deribit','Hyperliquid'];
        var exObj={};exNames.forEach(function(n,i){exObj[n]=mkEx([0.18,0.4,1,0.62,0.18,0.01,0.17,0.006,0.05,0.002,0.13,0.011,0.065,0.06][i]||0.05);});
        return J({t:Date.now(),ex:exObj});}
      if(u.indexOf('/api/funding')>=0){var mk2=function(base){var ex={},names=['Binance','OKX','Bybit','Bitget','Gate','MEXC','HTX','Kraken'];names.forEach(function(n,i){ex[n]={funding:+(base+(i-3)*0.004).toFixed(4),oi:+(1+Math.random()*10).toFixed(2),ok:true};});return ex;};
        return J({updated:Date.now(),coins:['BTC','ETH','SOL','XRP','BNB','DOGE','ADA','AVAX','LINK','LTC'],data:{BTC:mk2(0.008),ETH:mk2(0.006),SOL:mk2(0.012),XRP:mk2(0.004),BNB:mk2(0.005),DOGE:mk2(0.01),ADA:mk2(0.004),AVAX:mk2(0.007),LINK:mk2(0.006),LTC:mk2(0.005)}});}
      if(u.indexOf('/klines')>=0)return J(klines(u));
      if(u.indexOf('api.binance.com/api/v3/ticker/price')>=0)return J({price:'60000'});
      if(u.indexOf('coinbase.com/products/BTC-USD/ticker')>=0)return J({price:'60040'});
      if(u.indexOf('alternative.me')>=0){
        var nf=+((u.match(/limit=(\d+)/)||[])[1]||1),fd=[];
        for(var f2=0;f2<nf;f2++)fd.push({value:''+Math.round(15+Math.abs(Math.sin(f2/40))*70),value_classification:'Fear',
          timestamp:''+Math.floor((Date.now()-f2*864e5)/1000)});
        return J({data:fd});
      }
      if(u.indexOf('mempool.space')>=0){var hr=[];for(var h9=0;h9<365;h9++){
        var base9=9e20*(1+h9/900);if(h9>300&&h9<330)base9*=0.9; // capitulación y recuperación
        hr.push({timestamp:Math.floor((Date.now()-(364-h9)*864e5)/1000),avgHashrate:base9});}
        return J({hashrates:hr});}
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
      if(u.indexOf('fredgraph.csv')>=0)return Promise.resolve(new Response('DATE,CPIAUCSL\n2025-05-01,320.0\n2026-04-01,332.4\n2026-05-01,333.9\n',{status:200}));
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
      // CoinGecko market_chart (BTC/ETH/SOL/oro): series diarias para correlaciones y liquidez-dólar
      if(u.indexOf('market_chart')>=0){
        var base=u.indexOf('pax-gold')>=0?2400:u.indexOf('ethereum')>=0?1900:u.indexOf('solana')>=0?150:60000;
        var nd=+((u.match(/days=(\d+)/)||[])[1]||120),pr=[],pv=base;
        for(var d5=nd;d5>=0;d5--){pv*=1+(Math.random()-0.495)*0.02;pr.push([Date.now()-d5*864e5,pv]);}
        return J({prices:pr});
      }
      if(u.indexOf('frankfurter')>=0){var rt={};
        for(var d6=180;d6>=0;d6--){var dt=new Date(Date.now()-d6*864e5).toISOString().slice(0,10);
          rt[dt]={EUR:+(0.90+Math.sin(d6/30)*0.01).toFixed(4),JPY:+(150+Math.sin(d6/25)*2).toFixed(2),GBP:+(0.78+Math.cos(d6/40)*0.008).toFixed(4)};}
        return J({rates:rt});}
      return J({});
    }catch(e){return J({});}
  };
})();
