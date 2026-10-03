const { validSession } = require('./_auth');
function backendUrl(){const v=String(process.env.STUDENT_BACKEND_URL||'').trim();if(!v)throw new Error('STUDENT_BACKEND_URL is required');return v.replace(/\/+$/,'');}
function apiSecret(){return String(process.env.STUDENT_API_SECRET||'').trim();}
module.exports=async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
 if(!validSession(req))return res.status(401).json({error:'Authentication required'});
 const setWeek=Number(req.query.setWeek),batch=Number(req.query.batch);if(!setWeek||!batch)return res.status(400).json({error:'Invalid set/batch'});
 try{
  const secret=apiSecret();let data;
  if(secret){const u=await fetch(backendUrl(),{method:'POST',redirect:'follow',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'getAudio',setWeek,batch,apiSecret:secret})});if(!u.ok)throw new Error('Backend audio HTTP '+u.status);data=await u.json();}
  else{const u=await fetch(backendUrl()+'?api=audio&setWeek='+encodeURIComponent(setWeek)+'&batch='+encodeURIComponent(batch),{redirect:'follow'});if(!u.ok)throw new Error('Backend audio HTTP '+u.status);data=await u.json();}
  if(!data.ok||!data.base64)return res.status(404).json({error:data.error||'Audio not found'});
  const audio=Buffer.from(data.base64,'base64');res.setHeader('Content-Type',data.mimeType||'audio/mpeg');res.setHeader('Content-Length',String(audio.length));res.setHeader('Content-Disposition','inline; filename="'+String(data.fileName||'english-b1.mp3').replace(/"/g,'')+'"');res.setHeader('Cache-Control','private, max-age=300');return res.status(200).send(audio);
 }catch(err){console.error('audio-api',err);return res.status(502).json({error:'Nie udało się pobrać audio.'});}
};