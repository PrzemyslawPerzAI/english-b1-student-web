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
    if(!data.ok||!data.fileId) return res.status(404).json({error:data.error||'Audio not found'});
    const driveUrl='https://drive.usercontent.google.com/download?id='+encodeURIComponent(data.fileId)+'&export=download&confirm=t';
    const audioUpstream=await fetch(driveUrl,{redirect:'follow'});
    if(!audioUpstream.ok) throw new Error('Drive audio HTTP '+audioUpstream.status);
    const contentType=audioUpstream.headers.get('content-type')||data.mimeType||'audio/mpeg';
    if(!contentType.toLowerCase().startsWith('audio/')) throw new Error('Drive did not return audio content');
    const audio=Buffer.from(await audioUpstream.arrayBuffer());
    res.setHeader('Content-Type',contentType);
    res.setHeader('Content-Length',String(audio.length));
    res.setHeader('Content-Disposition','inline; filename="'+String(data.fileName||'english-b1.mp3').replace(/"/g,'')+'"');
    res.setHeader('Cache-Control','private, max-age=300');
    return res.status(200).send(audio);
  }catch(err){console.error('audio-api',err);return res.status(502).json({error:'Nie udało się pobrać audio DEV.'});}
};