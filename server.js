// Mr.Speechie backend: zero-dependency Node.js server. Run: node server.js
// Sign-in: email + 6-digit one-time code (OTP). The admin account is ADMIN_EMAIL (default sadhikna03@gmail.com).
// Email delivery uses SMTP over TLS (port 465). Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and optionally SMTP_FROM.
// Without SMTP the code is printed in this console instead (development only).
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),tls=require('tls');
const PORT=process.env.PORT||3000,PUB=path.join(__dirname,'public'),DATA=path.join(__dirname,'data'),BK=path.join(DATA,'backups');
const ADMIN=(process.env.ADMIN_EMAIL||'sadhikna03@gmail.com').toLowerCase();
fs.mkdirSync(BK,{recursive:true});
const MIME={'.html':'text/html','.png':'image/png','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj))};
const body=req=>new Promise((ok,no)=>{let b='',n=0;req.on('data',c=>{n+=c.length;if(n>25e6){no(new Error('too big'));req.destroy()}else b+=c});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch(e){no(e)}});req.on('error',no)});
const log=(type,who,data)=>fs.appendFileSync(path.join(DATA,'requests.jsonl'),JSON.stringify({type,user:who,at:new Date().toISOString(),data})+'\n');
// ---------- sign-in ----------
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const EMAIL=/^[^\s@<>"',;:\\()\[\]]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;
const otps=new Map(),hits=new Map();
const limit=(k,max,ms)=>{const n=Date.now(),a=(hits.get(k)||[]).filter(t=>n-t<ms);if(a.length>=max)return false;a.push(n);hits.set(k,a);return true};
const SF=path.join(DATA,'sessions.json');let sessions={};try{sessions=JSON.parse(fs.readFileSync(SF))}catch(e){}
const saveSessions=()=>fs.writeFileSync(SF,JSON.stringify(sessions));
function sessionOf(req){const m=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'');if(!m)return null;const k=sha(m[1]),s=sessions[k];if(!s||s.exp<Date.now())return null;return{...s,key:k}}
function sendMail(to,subject,text){return new Promise((ok,no)=>{
 const{SMTP_HOST:h,SMTP_PORT:pt='465',SMTP_USER:u,SMTP_PASS:pw}=process.env,from=process.env.SMTP_FROM||u;
 if(!h||!u||!pw)return no(new Error('SMTP is not configured'));
 const sock=tls.connect({host:h,port:+pt,rejectUnauthorized:process.env.SMTP_INSECURE_TLS!=='1'}),b64=s=>Buffer.from(s).toString('base64');
 const msg=['From: '+from,'To: '+to,'Subject: '+subject,'Date: '+new Date().toUTCString(),'Content-Type: text/plain; charset=utf-8','',text.replace(/^\./gm,'..')].join('\r\n');
 const seq=[['EHLO mr-speechie','250'],['AUTH LOGIN','334'],[b64(u),'334'],[b64(pw),'235'],['MAIL FROM:<'+from.replace(/^.*</,'').replace(/>.*$/,'')+'>','250'],['RCPT TO:<'+to+'>','250'],['DATA','354'],[msg+'\r\n.','250'],['QUIT','221']];
 let buf='',step=0,exp='220',done=false;
 const fin=e=>{if(done)return;done=true;try{sock.end()}catch(x){}e?no(e):ok()};
 sock.setTimeout(15000,()=>fin(new Error('SMTP timeout')));sock.on('error',fin);
 sock.on('data',d=>{buf+=d.toString();let i;while((i=buf.indexOf('\r\n'))>=0){const line=buf.slice(0,i);buf=buf.slice(i+2);if(!/^\d{3} /.test(line))continue;
  if(!line.startsWith(exp))return fin(new Error('SMTP: '+line.slice(0,80)));if(step>=seq.length)return fin();const[c,e]=seq[step++];exp=e;sock.write(c+'\r\n')}});
})}
async function auth(route,req,res){
 const ip=req.socket.remoteAddress||'?';
 if(route==='auth/request'){const email=String((await body(req)).email||'').trim().toLowerCase();
  if(!EMAIL.test(email))return send(res,400,{error:'Please enter a valid email address.'});
  if(!limit('e:'+email,5,36e5)||!limit('i:'+ip,30,36e5))return send(res,429,{error:'Too many requests. Please try again later.'});
  const otp=String(crypto.randomInt(0,1000000)).padStart(6,'0');otps.set(email,{h:sha(otp+email),exp:Date.now()+6e5,tries:0});
  let delivery='email';
  try{await sendMail(email,'Your Mr.Speechie sign-in code','Your Mr.Speechie sign-in code is '+otp+'.\r\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.')}
  catch(e){delivery='console';console.log('[OTP] Email not sent ('+e.message+'). Code for '+email+': '+otp)}
  return send(res,200,{ok:true,delivery})}
 if(route==='auth/verify'){const b=await body(req),email=String(b.email||'').trim().toLowerCase(),code=String(b.code||'');
  if(!limit('v:'+ip,60,36e5))return send(res,429,{error:'Too many attempts. Please try again later.'});
  const o=otps.get(email);if(!o||o.exp<Date.now())return send(res,400,{error:'The code has expired. Please ask for a new one.'});
  if(++o.tries>5){otps.delete(email);return send(res,429,{error:'Too many wrong codes. Please ask for a new one.'})}
  if(!/^\d{6}$/.test(code)||!crypto.timingSafeEqual(Buffer.from(sha(code+email)),Buffer.from(o.h)))return send(res,400,{error:'That code is not right.'});
  otps.delete(email);const token=crypto.randomBytes(32).toString('hex'),uid='a'+sha(email).slice(0,20),role=email===ADMIN?'admin':'user';
  for(const k in sessions)if(sessions[k].exp<Date.now())delete sessions[k];
  sessions[sha(token)]={uid,email,role,exp:Date.now()+30*864e5};saveSessions();return send(res,200,{ok:true,token,email,role,uid})}
 return false}
http.createServer(async(req,res)=>{
 try{
  const u=new URL(req.url,'http://x');
  if(u.pathname.startsWith('/api/')){
   const route=u.pathname.slice(5);
   if(req.method==='POST'&&(route==='auth/request'||route==='auth/verify'))return await auth(route,req,res);
   const sess=sessionOf(req);if(!sess)return send(res,401,{error:'Please sign in.'});
   const user=sess.uid,file=path.join(DATA,user+'.json');
   if(route==='auth/me')return send(res,200,{email:sess.email,role:sess.role,uid:user});
   if(route==='auth/logout'&&req.method==='POST'){delete sessions[sess.key];saveSessions();return send(res,200,{ok:true})}
   if(route==='admin/requests'){if(sess.role!=='admin')return send(res,403,{error:'Admins only.'});
    let items=[];try{items=fs.readFileSync(path.join(DATA,'requests.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)).reverse().slice(0,200)}catch(e){}
    return send(res,200,{items})}
   if(route==='state'&&req.method==='GET')return send(res,200,fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{});
   if(route==='state'&&req.method==='PUT'){const b=await body(req);if(!Array.isArray(b.items))return send(res,400,{error:'invalid state'});fs.writeFileSync(file,JSON.stringify(b));return send(res,200,{ok:true})}
   if(route==='backup'&&req.method==='POST'){const b=await body(req);const name=user+'-'+Date.now()+'.json';fs.writeFileSync(path.join(BK,name),JSON.stringify(b));return send(res,200,{ok:true,name})}
   if(route==='backups'){const names=fs.readdirSync(BK).filter(n=>n.startsWith(user+'-')).sort().reverse().slice(0,10);return send(res,200,{names})}
   if(route==='restore'){const n=path.basename(u.searchParams.get('name')||'');if(!n.startsWith(user+'-'))return send(res,403,{error:'forbidden'});const f=path.join(BK,n);return fs.existsSync(f)?send(res,200,JSON.parse(fs.readFileSync(f))):send(res,404,{error:'not found'})}
   if(['support','teletherapy','subscribe'].includes(route)&&req.method==='POST'){log(route,sess.email,await body(req));return send(res,200,{ok:true})}
   return send(res,404,{error:'no route'});
  }
  let p=path.normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[\/\\])+/,'');if(p==='/'||p==='\\')p='/index.html';
  const f=path.join(PUB,p);if(!f.startsWith(PUB)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('Not found')}
  res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);
 }catch(e){send(res,500,{error:String(e.message||e)})}
}).listen(PORT,()=>console.log('Mr.Speechie running at http://localhost:'+PORT+'  (admin: '+ADMIN+')'));