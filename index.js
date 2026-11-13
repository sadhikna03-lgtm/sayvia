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
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(PORT, () => {
  console.log(Server is running on port ${PORT});
});
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://x');
  if(u.pathname.startsWith('/api/')){
   const user=req.headers['x-user'];if(!okUser(user))return send(res,400,{error:'bad user'});
   const route=u.pathname.slice(5),file=path.join(DATA,user+'.json');
   if(route==='state'&&req.method==='GET')return send(res,200,fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{});
   if(route==='state'&&req.method==='PUT'){const b=await body(req);if(!Array.isArray(b.items))return send(res,400,{error:'invalid state'});fs.writeFileSync(file,JSON.stringify(b));return send(res,200,{ok:true})}
   if(route==='backup'&&req.method==='POST'){const b=await body(req);const name=user+'-'+Date.now()+'.json';fs.writeFileSync(path.join(BK,name),JSON.stringify(b));return send(res,200,{ok:true,name})}
   if(route==='backups'){const names=fs.readdirSync(BK).filter(n=>n.startsWith(user+'-')).sort().reverse().slice(0,10);return send(res,200,{names})}
   if(route==='restore'){const n=path.basename(u.searchParams.get('name')||'');if(!n.startsWith(user+'-'))return send(res,403,{error:'forbidden'});const f=path.join(BK,n);return fs.existsSync(f)?send(res,200,JSON.parse(fs.readFileSync(f))):send(res,404,{error:'not found'})}
   if(['support','teletherapy','subscribe'].includes(route)&&req.method==='POST'){log(route,user,await body(req));return send(res,200,{ok:true})}
   return send(res,404,{error:'no route'});
  }
  let p=path.normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[\/\\])+/,'');if(p==='/'||p==='\\')p='/index.html';
  const f=path.join(PUB,p);if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('Not found')}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
 }catch(e){send(res,500,{error:String(e.message||e)})}
}).listen(PORT,()=>console.log('Mr.Speechie running at http://localhost:'+PORT));