const { validSession } = require('./_auth');
const DEV_SUBMIT_URL = String(process.env.STUDENT_BACKEND_URL || '').trim().replace(/\\\/+$/,'');

module.exports = async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  if(!validSession(req)) return res.status(401).json({error:'Authentication required'});
  try{
    const body=Object.assign({},req.body||{});\n    const secret=String(process.env.STUDENT_API_SECRET||'').trim();\n    if(secret) body.apiSecret=secret;
    const upstream=await fetch(DEV_SUBMIT_URL,{method:'POST',redirect:'follow',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({},body,{action:'submitStudentQuiz'}))});
    if(!upstream.ok) throw new Error('Backend API HTTP '+upstream.status);
    const data=await upstream.json();
    if(!data.ok) return res.status(400).json(data);
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json(data);
  }catch(err){console.error('quiz-submit',err);return res.status(502).json({error:'Nie udało się zapisać wyniku.'});}
};
