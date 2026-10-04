const { validSession } = require('./_auth');

function backendUrl(){
 const v=String(process.env.STUDENT_BACKEND_URL||'').trim();
 if(!v)throw new Error('STUDENT_BACKEND_URL is required');
 return v.replace(/\/+$/,'');
}
function apiSecret(){
 const v=String(process.env.STUDENT_API_SECRET||'').trim();
 if(!v)throw new Error('STUDENT_API_SECRET is required');
 return v;
}

module.exports=async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 if(!validSession(req)){res.setHeader('Cache-Control','no-store');return res.status(401).json({error:'Authentication required'});}
 try{
  const upstream=await fetch(backendUrl(),{method:'POST',redirect:'follow',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'getStudentData',apiSecret:apiSecret()})});
  if(!upstream.ok)throw new Error('Backend API HTTP '+upstream.status);
  const payload=await upstream.json();
  if(!payload.ok){
   const code=String(payload.error||'').toLowerCase().includes('unauthorized')?'BACKEND_UNAUTHORIZED':'BACKEND_REJECTED';
   const err=new Error(code);err.code=code;throw err;
  }
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(200).json(payload.data);
 }catch(err){
  const code=err&&err.code?err.code:(String(err&&err.message||'').startsWith('Backend API HTTP')?'BACKEND_HTTP':'BACKEND_ERROR');
  console.error('student-api',code,err);
  return res.status(502).json({error:'Nie udało się pobrać danych.',diagnostic:code});
 }
};
