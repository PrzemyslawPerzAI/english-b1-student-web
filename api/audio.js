const { validSession } = require('./_auth');

const DEV_AUDIO_URL = 'https://script.google.com/macros/s/AKfycbylZfdAmcwnjMad6CHBZ383HI-RSdiTpGpL9isnUrTaHQvMzo2oiYZfNOilyox9zFd6/exec';

module.exports = async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'Method not allowed'});}
  if(!validSession(req)) return res.status(401).json({error:'Authentication required'});
  const setWeek=Number(req.query.setWeek), batch=Number(req.query.batch);
  if(!setWeek||!batch) return res.status(400).json({error:'Invalid set/batch'});
  try{
    const url=DEV_AUDIO_URL+'?api=audio&setWeek='+encodeURIComponent(setWeek)+'&batch='+encodeURIComponent(batch);
    const upstream=await fetch(url,{redirect:'follow'});
    if(!upstream.ok) throw new Error('DEV audio HTTP '+upstream.status);
    const data=await upstream.json();
    if(!data.ok||!data.base64) return res.status(404).json({error:data.error||'Audio not found'});
    const audio=Buffer.from(data.base64,'base64');
    res.setHeader('Content-Type',data.mimeType||'audio/mpeg');
    res.setHeader('Content-Disposition','inline; filename="'+String(data.fileName||'english-b1.mp3').replace(/"/g,'')+'"');
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    return res.status(200).send(audio);
  }catch(err){console.error('audio-api',err);return res.status(502).json({error:'Nie udało się pobrać audio DEV.'});}
};