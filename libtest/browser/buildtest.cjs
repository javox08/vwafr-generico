const fs=require('fs');
const SP=process.env.SP, V=process.argv[2]||'home';
let s=fs.readFileSync('index.html','utf8');
s=s.replace(/const \[view,setView\]=useState\('[a-z]+'\);?[^\n]*/, "const [view,setView]=useState('"+V+"');");
s=s.replace('https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js','./libs/react.production.min.js');
s=s.replace('https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js','./libs/react-dom.production.min.js');
s=s.replace('https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js','./libs/babel.min.js');
const mock='<script>'+fs.readFileSync(SP+'/quantmock.js','utf8')+'</scr'+'ipt>'+
  '<script>window.addEventListener("load",function(){setTimeout(function(){var d=document.createElement("div");d.id="ERRSINK";d.textContent="ERRCOUNT:"+window.__errs.length+"|"+window.__errs.slice(0,4).join(" || ");document.body.appendChild(d);},16000);});</scr'+'ipt>';
s=s.replace('<head>','<head>\n'+mock);
fs.writeFileSync(SP+'/test_'+V+'.html',s);
console.log('built test_'+V+'.html · view replaced:',s.includes("useState('"+V+"')"));
