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

module.exports = async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
  if(!validSession(req)) return res.status(401).json({error:'Authentication required'});
  try{
    const input=req.body||{};
    const body={setWeek:input.setWeek,batch:input.batch,answers:input.answers,testOnly:input.testOnly===true,action:input.testOnly===true?'submitStudentQuizTest':'submitStudentQuiz',apiSecret:apiSecret()};
    const upstream=await fetch(backendUrl(),{method:'POST',redirect:'follow',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!upstream.ok) throw new Error('Backend API HTTP '+upstream.status);
    const data=await upstream.json();
    if(!data.ok) return res.status(400).json(data);
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json(data);
  }catch(err){console.error('quiz-submit',err);return res.status(502).json({error:'Nie udało się zapisać wyniku.'});}
};
