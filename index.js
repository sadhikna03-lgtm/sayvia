// Mr.Speechie backend: zero-dependency Node.js server. Run: node server.js
const http=require('http'),fs=require('fs'),path=require('path');
const PORT=process.env.PORT||3000,PUB=path.join(__dirname,'public'),DATA=path.join(__dirname,'data'),BK=path.join(DATA,'backups');
fs.mkdirSync(BK,{recursive:true});
const MIME={'.html':'text/html','.png':'image/png','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const okUser=u=>/^[a-z0-9]{3,32}$/i.test(u||'');
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj))};
const body=req=>new Promise((ok,no)=>{let b='',n=0;req.on('data',c=>{n+=c.length;if(n>25e6){no(new Error('too big'));req.destroy()}else b+=c});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch(e){no(e)}});req.on('error',no)});
const log=(type,user,data)=>fs.appendFileSync(path.join(DATA,'requests.jsonl'),JSON.stringify({type,user,at:new Date().toISOString(),data})+'\n');
const express = require('express');
const app = express();

// Render തരുന്ന പോർട്ട് അല്ലെങ്കിൽ ലോക്കൽ ആയി 3000 ഉപയോഗിക്കാൻ വേണ്ടി

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(PORT, () => {
  console.log('Server is running on port ${PORT}');
});