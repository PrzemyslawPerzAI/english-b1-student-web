'use strict';
// Default runs real bundled Chromium. Codex must invoke only --vm-only.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const front=path.resolve(__dirname,'..'),root=path.resolve(front,'..');
const html=fs.readFileSync(path.join(front,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const visualBaseline=require('./progress-visual-baseline.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
// Independent UI fixtures: this repository never reads private backend source.
function fixture(second=true){
 const sets=[];
 for(const [setWeek,sizes,day] of [[2,[10,20,10,10,10,10,10],3],[9,[1000,10,1000],2],[4,[10],1],[10,[1],null]]){
  const batches=sizes.map((sentWords,i)=>{
   const batch=i+1,masteredWords=!day?null:setWeek===9?[699,7,899][i]:setWeek===4?(second?9:10):(second?6:4);
   const known=masteredWords!==null;
   const trendPp=day&&second&&setWeek!==9?(setWeek===4?-10:2/sentWords*100):null;
   return {batch,plannedWords:sentWords,sentWords:day?sentWords:0,fullySent:Boolean(day),quizCompleted:Boolean(day),completed:Boolean(day),masteredWords,difficultWords:known?sentWords-masteredWords:null,masteryPercent:known?masteredWords/sentWords*100:null,trendPp,trendReason:trendPp===null?'Pierwsza próba lub brak historii prób.':'',historyComplete:known,incomplete:false,availabilityReason:known?'':'Brak potwierdzonych wysłanych słów.'};
  });
  const sentWords=batches.reduce((n,b)=>n+b.sentWords,0),masteredWords=day?batches.reduce((n,b)=>n+b.masteredWords,0):null;
  sets.push({setWeek,sentWords,masteredWords,difficultWords:day?sentWords-masteredWords:null,masteryPercent:day?masteredWords/sentWords*100:null,fullySent:Boolean(day),quizzesCompleted:day?batches.length:0,plannedBatches:batches.length,lastSentAt:day?`2026-03-0${day}T00:00:00.000Z`:null,incomplete:false,availabilityReason:day?'':'Brak kompletnej historii opanowania wysłanych słów.',batches});
 }
 return {learner:'Synthetic',setWeek:2,batch:1,words:[{word:'fixture',meaning:'synthetic',level:'B1'}],currentSetWords:[],allSentWords:[],audioUrl:'',quizUrl:'',stats:{quizzesCompleted:1,latestQuizPercent:80,masteredTotal:4},quizQuestions:[{sourceNr:'1',word:'fixture',type:'FILL_GAP',number:1,question:'synthetic question',options:[],points:1}],learningProgress:{summary:{setsCompleted:3,batchesSent:11,quizzesCompleted:11},sets,incomplete:false}};
}
// New-contract fixtures are independent of backend aggregation and learner data.
function partialFixture(assessed=1){
 const d=fixture();
 d.dataGeneratedAt='2026-01-15T09:15:00.000Z';
 d.learningProgress.sets=[2,9,4,7].map((setWeek,index)=>{
  const batches=Array.from({length:5},(_,i)=>{
   const known=i<assessed,masteredWords=known?(i===0?2:0):null;
   return {batch:i+1,plannedWords:20,sentWords:20,fullySent:true,quizCompleted:known,completed:known,
    masteredWords,difficultWords:known?20-masteredWords:null,masteryPercent:known?masteredWords/20*100:null,
    trendPp:null,trendReason:'Pierwsza próba lub brak historii prób.',historyComplete:known,incomplete:false,
    availabilityReason:known?'':'Brak zatwierdzonej próby.'};
  });
  return {setWeek,batches,sentWords:100,masteredWords:assessed?2:0,difficultWords:assessed?20*assessed-2:0,
   unassessedWords:100-20*assessed,masteryPercent:assessed?2:0,fullySent:true,quizzesCompleted:assessed,
   plannedBatches:5,lastSentAt:`2026-01-0${4-index}T00:00:00.000Z`,incomplete:false,
   availabilityReason:assessed<5?'Brak kompletnej historii opanowania wysłanych słów.':''};
 });
 d.learningProgress.summary={setsCompleted:4,batchesSent:20,quizzesCompleted:4*assessed};
 return d;
}
// Values from the reference are confined to this independent synthetic fixture.
function visualFixture(count=4){
 const d=fixture();
 const make=(setWeek,values,day)=>{
  const batches=values.map((masteryPercent,i)=>({batch:i+1,sentWords:50,plannedWords:50,masteredWords:masteryPercent/2,difficultWords:50-masteryPercent/2,masteryPercent,trendPp:setWeek===8?[6,3,0,12][i%4]:[2,1,4,-3][i%4],trendReason:'',fullySent:true,completed:true,quizCompleted:true,incomplete:false,availabilityReason:''}));
  const masteredWords=batches.reduce((n,b)=>n+b.masteredWords,0),sentWords=50*values.length;
  return {setWeek,batches,sentWords,masteredWords,difficultWords:sentWords-masteredWords,masteryPercent:masteredWords/sentWords*100,fullySent:true,quizzesCompleted:values.length,plannedBatches:values.length,lastSentAt:`2026-03-0${day}T00:00:00.000Z`,incomplete:false,availabilityReason:''};
 };
 d.learningProgress={summary:{setsCompleted:3,batchesSent:count+5,quizzesCompleted:count+5},sets:[make(8,Array.from({length:count},(_,i)=>[96,86,72,58,100,0,50][i]),3),make(7,[96,94,90,92],2),make(3,[50],1)],incomplete:false};
 return d;
}
const response=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let tests=0;
async function test(name,fn){await fn();tests++;console.log('PASS '+name);}
function domBox(fetchAdapter){
 const elements={};
 for(const m of html.matchAll(/id="([^"]+)"/g)){
  const classes=new Set(m[0].includes('hidden')?['hidden']:[]);
  // Initial hidden state is extracted from the full element tag.
  const tag=html.slice(html.lastIndexOf('<',m.index),html.indexOf('>',m.index)+1);
  if(/class="[^"]*\bhidden\b/.test(tag))classes.add('hidden');
  const initialText=html.slice(html.indexOf('>',m.index)+1,html.indexOf('<',html.indexOf('>',m.index)+1));
  elements[m[1]]={id:m[1],tagName:tag.startsWith('<a ')?'A':'DIV',textContent:initialText,innerHTML:'',style:{},value:'',attrs:{},listeners:{},
   classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c)}},
   focus(){elements.focused=this.id},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},addEventListener(k,fn){this.listeners[k]=fn},scrollIntoView(){}};
 }
 const calls=[];
 const box={...elements,document:{getElementById:id=>elements[id]},window:{scrollTo(){}},fetch:async(url,options)=>{calls.push({url,options});assert.equal(url,'/api/student');return response(200,fixture());}};
 if(fetchAdapter)box.fetch=fetchAdapter;
 const forbiddenStorage=new Proxy({}, {get(){throw Error('Unexpected persistent storage access')},set(){throw Error('Unexpected persistent storage write')}});
 box.localStorage=box.sessionStorage=forbiddenStorage;
 Object.defineProperty(box.document,'cookie',{get(){return 'synthetic_auth=preserved'},set(){throw Error('Unexpected cookie write')}});
 vm.createContext(box);vm.runInContext(script,box);return {box,elements,calls};
}
async function vmTests(){
 const {box,elements:e,calls}=domBox();await tick();
 await test('AC-01/10 semantic button, back, language, zoom and focus',async()=>{
  assert.match(html,/<button id="learningProgressBtn"[^>]*onclick="showLearningProgress\(\)"/);
  assert.match(html,/lang="pl"/);assert.match(html,/<meta charset="utf-8">/);assert.doesNotMatch(html,/maximum-scale/);
  assert.match(html,/aria-label="Powrót do ekranu głównego"/);
  await box.showLearningProgress();assert.equal(e.focused,'learningProgressTitle');assert.equal(e.home.classList.contains('hidden'),true);
  box.returnFromLearningProgress();assert.equal(e.focused,'learningProgressBtn');assert.equal(e.home.classList.contains('hidden'),false);
 });
 await test('AC-02/03/04/07 API/UI parity, chronology, distinct counters and dynamic 1/3/7 batches',()=>{
  const d=fixture();box.renderLearningProgress(d.learningProgress);const h=e.learningProgressContent.innerHTML;
  for(const [key,value] of Object.entries(d.learningProgress.summary))assert.ok(h.includes(`data-progress-counter="${key}">${value}<`));
  assert.ok(h.indexOf('data-progress-set="2"')<h.indexOf('data-progress-set="9"'));
  assert.ok(h.indexOf('data-progress-set="9"')<h.indexOf('<details id="learningProgressHistory"'));
  assert.match(h,/<details id="learningProgressHistory"><summary>Pokaż wcześniejsze sety/);
  assert.doesNotMatch(h,/data-progress-set="10"/);assert.equal((h.match(/data-progress-batch=/g)||[]).length,11);
  assert.match(h,/Wykonany/);assert.match(h,/Wysłany w całości/);assert.match(h,/Quizy: 7\/7/);
  assert.match(h,new RegExp(box.progressCounts(d.learningProgress.sets[0])+' opanowanych/wysłanych'));
  box.renderLearningProgress({summary:d.learningProgress.summary,sets:[d.learningProgress.sets[0]]});assert.doesNotMatch(e.learningProgressContent.innerHTML,/id="learningProgressHistory"/);
 });
 await test('AC-05/06/08 unrounded levels, independently signed trends and unavailable history',()=>{
  for(const [n,level] of [[69.9,'low'],[70,'mid'],[89.9,'mid'],[90,'high'],[69.99,'low'],[89.99,'mid'],[null,'unknown']])assert.equal(box.progressLevel(n),level);
  assert.match(box.progressTrend({trendPp:20}),/lp-up.*Wzrost .*\+20 pp/);assert.match(box.progressTrend({trendPp:0}),/lp-flat.*Bez zmiany .*0 pp/);assert.match(box.progressTrend({trendPp:-30}),/lp-down.*Spadek .*-30 pp/);
  assert.match(box.progressTrend({trendPp:null,trendReason:'Niekompletna historia'}),/lp-trend-word">Trend: <\/span>—/);assert.match(box.progressDataDetails({trendPp:null,trendReason:'Niekompletna historia'},false),/Trend: —.*Niekompletna/);
  assert.match(box.progressBar({masteryPercent:90,masteredWords:9,sentWords:10},'set',false),/lp-high/);
  assert.match(box.progressTrend({trendPp:-10}),/lp-down/);
  const d=fixture(),s=d.learningProgress.sets[0];s.masteryPercent=null;s.masteredWords=null;s.difficultWords=null;s.incomplete=true;s.batches[0].availabilityReason='Niekompletna historia';s.batches[0].masteryPercent=null;
  box.renderLearningProgress(d.learningProgress);assert.match(e.learningProgressContent.innerHTML,/Opanowanie: —/);assert.match(e.learningProgressContent.innerHTML,/Niekompletne dane/);assert.match(e.learningProgressContent.innerHTML,/Niekompletna historia/);
  assert.match(box.progressBar({masteryPercent:null,masteredWords:null,sentWords:0},'set',false),/—\/0/);assert.doesNotMatch(box.progressBar({masteryPercent:null,masteredWords:null,sentWords:0},'set',false),/aria-valuenow|NaN/);
 });
 await test('AC-09 loading, empty, unavailable contract, 502 and 401',async()=>{
  let release;box.fetch=()=>new Promise(resolve=>release=resolve);const pending=box.showLearningProgress();assert.equal(e.learningProgressState.textContent,'Ładowanie postępu…');assert.equal(e.learningProgressContent.innerHTML,'');assert.equal(e.learningProgress.attrs['aria-busy'],'true');
  release(response(200,{...fixture(),learningProgress:{summary:{setsCompleted:0,batchesSent:0,quizzesCompleted:0},sets:[]}}));await pending;
  assert.match(e.learningProgressState.textContent,/Brak potwierdzonych/);assert.match(e.learningProgressContent.innerHTML,/setsCompleted">0/);
  box.fetch=async()=>response(502,{});await box.showLearningProgress();assert.match(e.learningProgressState.textContent,/Nie udało/);assert.doesNotMatch(e.learningProgressContent.innerHTML,/data-progress-counter/);
  box.fetch=async()=>{throw Error('synthetic offline')};await box.showLearningProgress();assert.match(e.learningProgressState.textContent,/Nie udało/);
  box.fetch=async()=>response(200,{...fixture(),learningProgress:undefined});await box.showLearningProgress();assert.match(e.learningProgressState.textContent,/Nie udało/);
  box.fetch=async()=>response(401,{});await box.showLearningProgress();assert.equal(e.login.classList.contains('hidden'),false);assert.equal(e.learningProgress.classList.contains('hidden'),true);assert.equal(e.focused,'pin');
 });
 await test('AC-11 fresh noncached reads on revisit, persisted retry and stale response cancellation',async()=>{
  let second=false;box.fetch=async(url,options)=>{assert.equal(url,'/api/student');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');return response(200,fixture(second));};
  await box.showLearningProgress();assert.match(e.learningProgressContent.innerHTML,/40%/);box.returnFromLearningProgress();second=true;await box.showLearningProgress();assert.match(e.learningProgressContent.innerHTML,/60%/);const rendered=e.learningProgressContent.innerHTML;
  await box.showLearningProgress();assert.equal(e.learningProgressContent.innerHTML,rendered);
  let release;box.fetch=()=>new Promise(resolve=>release=resolve);const pending=box.showLearningProgress();box.returnFromLearningProgress();release(response(200,fixture(false)));await pending;assert.equal(e.home.classList.contains('hidden'),false);assert.equal(e.learningProgress.classList.contains('hidden'),true);
  assert.match(script,/WYNIK ZAPISANY';refreshStudentProgress\(\)/);assert.ok(calls.every(c=>c.options.cache==='no-store'));
  let releaseOlder;box.fetch=()=>new Promise(resolve=>releaseOlder=resolve);const older=box.refreshStudentProgress();
  box.fetch=async()=>response(200,fixture(true));await box.refreshStudentProgress();releaseOlder(response(200,fixture(false)));assert.equal(await older,null);
  assert.equal(vm.runInContext('DATA.learningProgress.sets[0].batches[0].masteryPercent',box),60,'Older response must not overwrite newer data');
 });
 await test('AC-10 accessible labels, percentages and direction without relying on color',()=>{
  box.renderLearningProgress(fixture().learningProgress);const h=e.learningProgressContent.innerHTML;
  assert.match(h,/role="progressbar".*aria-valuemin="0" aria-valuemax="100"/);assert.match(h,/aria-valuenow="60"/);assert.match(h,/aria-valuetext="60%; opanowane\/wysłane 6\/10"/);assert.match(h,/Poziom: niski/);assert.match(h,/Wzrost/);assert.match(h,/Spadek/);assert.match(html,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 });
 await test('AC-11 regression: actual quiz save refreshes data and refresh failure does not undo saved result',async()=>{
  box.document.querySelector=()=>({value:'synthetic answer'});box.init(fixture(false));
  let failRefresh=false,failSave=false,submitted=0,refreshed=0;
  box.fetch=async(url,options)=>{
   if(url==='/api/quiz-submit'){
    submitted++;assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body).answers,['synthetic answer']);
    return response(failSave?502:200,failSave?{error:'synthetic save failure'}:{ok:true,percent:80,score:4,maxScore:5,attemptNo:2});
   }
   assert.equal(url,'/api/student');refreshed++;assert.equal(options.cache,'no-store');
   if(failRefresh)throw Error('synthetic refresh failure');return response(200,fixture(true));
  };
  box.checkQuiz();await tick();assert.equal(e.checkQuizBtn.textContent,'WYNIK ZAPISANY');assert.equal(submitted,1);assert.equal(refreshed,1);
  assert.equal(vm.runInContext('DATA.learningProgress.sets[0].batches[0].masteryPercent',box),60);
  failSave=true;box.checkQuiz();await tick();assert.match(e.quizResult.innerHTML,/Nie zapisano wyniku/);assert.equal(refreshed,1);assert.equal(e.checkQuizBtn.disabled,false);
  failSave=false;failRefresh=true;box.checkQuiz();await tick();assert.equal(e.checkQuizBtn.textContent,'WYNIK ZAPISANY');assert.match(e.quizResult.innerHTML,/zapisano próbę 2/);assert.equal(refreshed,2);
 });
 await test('LP-01/02/06/07 reference hierarchy, exact sums and presentation order',()=>{
  const d=visualFixture();box.renderLearningProgress(d.learningProgress);const h=e.learningProgressContent.innerHTML;
  assert.match(html,/Sprawdź swój postęp w nauce słówek\./);assert.match(html,/lp-heading-icon/);assert.match(html,/id="learningProgressBtn" class="menu-card purple"/);
  assert.match(h,/\(aktualny\)/);assert.match(h,/\(poprzedni\)/);assert.match(h,/lp-score lp-mid"><strong>78%/);assert.match(h,/lp-score lp-high"><strong>93%/);
  for(const n of [156,44,200,186,14])assert.ok(h.includes('<strong>'+n+'</strong>'));
  const batch=h.slice(h.indexOf('data-progress-batch="1"'),h.indexOf('data-progress-batch="2"'));
  assert.ok(batch.indexOf('lp-batch-percent')<batch.indexOf('lp-column'));assert.ok(batch.indexOf('lp-column')<batch.indexOf('lp-trend'));assert.ok(batch.indexOf('lp-trend')<batch.indexOf('lp-counts'));
  for(const k of Object.keys(d.learningProgress.summary))assert.ok(h.includes(`data-progress-counter="${k}">${d.learningProgress.summary[k]}</strong>`));
  assert.match(h,/aria-label="Legenda postępu"/);assert.match(h,/difficult — słowa wymagające powtórki/);
 });
 await test('LP-05/14/15/17 0, 1, 2, 5 sent sets; ties and 1/3/4/5/7 batch fixtures',()=>{
  for(const count of [1,3,4,5,7]){const d=visualFixture(count);box.renderLearningProgress(d.learningProgress);assert.equal((e.learningProgressContent.innerHTML.match(/data-progress-batch=/g)||[]).length,count+5);}
  const all=fixture().learningProgress;
  for(const count of [0,1,2]){box.renderLearningProgress({...all,sets:all.sets.slice(0,count)});assert.doesNotMatch(e.learningProgressContent.innerHTML,/learningProgressHistory/);assert.equal((e.learningProgressContent.innerHTML.match(/data-progress-set=/g)||[]).length,count);}
  const d=visualFixture().learningProgress;d.sets.push({...d.sets[2],setWeek:1},{...d.sets[2],setWeek:5});box.renderLearningProgress(d);let h=e.learningProgressContent.innerHTML;
  assert.equal((h.match(/class="lp-history-set"/g)||[]).length,3);assert.doesNotMatch(h,/<details[^>]* open/);
  const tied=fixture().learningProgress;tied.sets[1].lastSentAt=tied.sets[0].lastSentAt;box.renderLearningProgress(tied);h=e.learningProgressContent.innerHTML;assert.ok(h.indexOf('data-progress-set="9"')<h.indexOf('data-progress-set="2"'));
  box.renderLearningProgress({...all,sets:[all.sets[3]]});assert.doesNotMatch(e.learningProgressContent.innerHTML,/data-progress-set=/);assert.match(e.learningProgressState.textContent,/Brak potwierdzonych/);
 });
 await test('LP-10/11/12/13 unknown, zero and threshold precision preserve semantic information',()=>{
  assert.equal(box.progressCounts({sentWords:0,masteredWords:null}),'—/0');assert.equal(box.progressCounts({sentWords:0,masteredWords:0}),'0/0');
  assert.equal(box.progressCounts({sentWords:10,masteredWords:0}),'0/10');
  for(const [value,level,label] of [[69.99,'low','70%'],[70,'mid','70%'],[86,'mid','86%'],[89.99,'mid','90%'],[90,'high','90%'],[100,'high','100%'],[null,'unknown','—']]){
   assert.equal(box.progressLevel(value),level);assert.equal(box.progressPercent(value),label);
   const bar=box.progressBar({masteryPercent:value,masteredWords:null,sentWords:50},'test',true);assert.match(bar,new RegExp('lp-'+level));if(value===null)assert.doesNotMatch(bar,/aria-valuenow/);
  }
  for(const reason of ['Pierwsza próba','Luka AttemptNo 1→3','Zmiana SourceNr','Niekompletna najnowsza próba'])assert.ok(box.progressDataDetails({trendPp:null,trendReason:reason},false).includes(reason));
  assert.match(box.progressBar({masteryPercent:58,sentWords:50,masteredWords:29},'test',true),/lp-low/);assert.match(box.progressTrend({trendPp:12}),/lp-up/);
 });
 await test('LP-20/21 invalid JSON and invalid summary retry without fabricated counters',async()=>{
  for(const value of [undefined,null,-1,1.5,'3',NaN]){
   const d=fixture();d.learningProgress.summary.setsCompleted=value;box.fetch=async()=>response(200,d);await box.showLearningProgress();assert.match(e.learningProgressState.textContent,/Nie udało/);assert.doesNotMatch(e.learningProgressContent.innerHTML,/data-progress-counter/);
  }
  box.fetch=async()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('synthetic JSON')}});await box.showLearningProgress();assert.match(e.learningProgressState.textContent,/Nie udało/);
  box.fetch=async()=>response(200,visualFixture());await box.showLearningProgress();assert.match(e.learningProgressContent.innerHTML,/data-progress-counter="setsCompleted">3/);
 });
 await test('LP-22 leaving progress cancels late success, error and 401 including timestamp and session routing',async()=>{
  const {box,elements:e}=domBox();await tick();
  for(const kind of ['ok','http','auth','json','network']){
   box.fetch=async()=>response(200,timed(winter));await box.showLearningProgress();const before=plain(vm.runInContext('DATA',box));
   const gate=deferred();box.fetch=async()=>{await gate.promise;if(kind==='network')throw Error('synthetic offline');if(kind==='json')return {ok:true,status:200,json:async()=>{throw Error('synthetic JSON')}};return response(kind==='http'?502:kind==='auth'?401:200,timed(later,2));};
   const pending=box.showLearningProgress();box.returnFromLearningProgress();gate.release();await pending;
   assert.deepEqual(plain(vm.runInContext('DATA',box)),before);assert.equal(e.dataRefreshTime.textContent,'Dane odświeżono: 10:15');assert.equal(e.home.classList.contains('hidden'),false);assert.equal(e.login.classList.contains('hidden'),true);assert.equal(e.focused,'learningProgressBtn');
  }
 });
 await partialVmTests();
 await proxyTests();
 await timeTests(vmDriver,'VM');
}
async function partialVmTests(){
 const {box,elements:e}=domBox();await tick();
 await test('NEW LP-01–05/10 partial, complete, unassessed and historical set labels and aria',()=>{
  for(const assessed of [0,1,4,5]){
   const d=partialFixture(assessed);box.renderLearningProgress(d.learningProgress);const h=e.learningProgressContent.innerHTML;
   assert.equal((h.match(/data-progress-set=/g)||[]).length,4);
   assert.ok(h.indexOf('data-progress-set="2"')<h.indexOf('data-progress-set="9"'));
   for(const set of d.learningProgress.sets){
    const card=box.progressSetHtml(set,'');
    assert.match(card,new RegExp('<strong>'+set.masteredWords+'</strong><span>mastered'));
    assert.match(card,new RegExp('<strong>'+set.difficultWords+'</strong><span>difficult'));
    if(assessed<5){
     assert.match(card,/potwierdzonego opanowania/);assert.match(card,new RegExp('Ocena częściowa: '+assessed*20+' z 100 słów ocenionych'));
     assert.match(card,new RegExp('Nieocenione: '+(100-assessed*20)));
     const bar=box.progressBar(set,'set',false);assert.match(bar,new RegExp('aria-valuenow="'+(assessed?2:0)+'"'));
     assert.match(bar,/aria-valuetext="[^"]*potwierdzonego opanowania[^"]*Ocena częściowa:/);
     assert.match(box.progressDataDetails(set,true),/Potwierdzone opanowanie:/);
     assert.equal(card.includes('Brak ocen; wszystkie wysłane słowa nieocenione'),assessed===0);
     assert.match(h,/<summary><span>Set 4<\/span><strong class="lp-history-partial">[\s\S]*?<span>potwierdzonego opanowania<\/span><\/strong><\/summary>/);
    }else{
     assert.doesNotMatch(card,/potwierdzonego|Ocena częściowa|Nieocenione:|Brak ocen;/);assert.match(card,/<span>opanowania<\/span>/);
    }
    set.batches.forEach((b,i)=>{assert.equal(b.masteryPercent,i<assessed?(i?0:10):null);if(i>=assessed)assert.doesNotMatch(box.progressBar(b,'batch',true),/aria-valuenow|potwierdzonego/);});
   }
  }
  const weighted={...partialFixture(1).learningProgress.sets[0],sentWords:60,masteredWords:10,difficultWords:20,unassessedWords:30,masteryPercent:10/60*100};
  assert.match(box.progressSetHtml(weighted,''),/<strong>16,7%<\/strong>/);assert.match(box.progressSetHtml(weighted,''),/Ocena częściowa: 30 z 60 słów ocenionych/);
  assert.match(box.progressSetHtml(weighted,''),/aria-label="Potwierdzone opanowanie setu 2"/);
  const zero={...partialFixture(0).learningProgress.sets[0],sentWords:0,masteredWords:0,difficultWords:0,unassessedWords:0,masteryPercent:null,lastSentAt:null,batches:[]};
  assert.match(box.progressSetHtml(zero,''),/<strong>—<\/strong>/);assert.doesNotMatch(box.progressSetHtml(zero,''),/NaN|Infinity|<strong>0%|aria-valuenow|Ocena częściowa/);
  box.renderLearningProgress({summary:{setsCompleted:0,batchesSent:0,quizzesCompleted:0},sets:[zero]});assert.doesNotMatch(e.learningProgressContent.innerHTML,/data-progress-set=/);assert.match(e.learningProgressState.textContent,/Brak potwierdzonych/);
 });
 await test('NEW LP-09/11 contradictory reasons and independent old API are retained',()=>{
  const full=fixture().learningProgress.sets[0],modern={...full,unassessedWords:0};
  assert.equal(box.progressSetHtml(full,''),box.progressSetHtml(modern,''),'Full appearance and batch markup must remain identical');
  const unknown={...full,masteredWords:null,difficultWords:null,masteryPercent:null,incomplete:true,availabilityReason:'Niekompletna lub nierozstrzygalna historia próby.'};
  const h=box.progressSetHtml(unknown,'');assert.match(h,/<strong>—<\/strong>/);assert.match(h,/Niekompletna lub nierozstrzygalna/);assert.doesNotMatch(h,/Nieocenione:|Ocena częściowa|potwierdzonego|Brak ocen;/);
  const contradictory={...partialFixture(0).learningProgress.sets[0],incomplete:true,availabilityReason:'Niekompletny plan lub potwierdzenie wysyłki.'};
  const c=box.progressSetHtml(contradictory,'');assert.match(c,/Brak ocen; wszystkie wysłane słowa nieocenione/);assert.match(c,/Niekompletny plan lub potwierdzenie/);assert.match(c,/Niekompletne dane historyczne/);
 });
 await test('NEW LP-13/14 partial refresh, stale responses, failures and quiz DOM isolation',async()=>{
  const quizSnapshot=()=>JSON.stringify(['quizList','quizResult','quizScore','quizFeedback'].map(k=>e[k]&&{html:e[k].innerHTML,text:e[k].textContent}));
  const before=quizSnapshot();box.fetch=async()=>response(200,partialFixture(1));await box.showLearningProgress();assert.match(e.learningProgressContent.innerHTML,/Ocena częściowa: 20 z 100/);
  let release;box.fetch=()=>new Promise(r=>release=r);const older=box.showLearningProgress();
  box.fetch=async()=>response(200,partialFixture(4));await box.showLearningProgress();const accepted=e.learningProgressContent.innerHTML;
  release(response(200,partialFixture(0)));await older;assert.equal(e.learningProgressContent.innerHTML,accepted);assert.match(accepted,/Ocena częściowa: 80 z 100/);
  for(const status of [502,401]){
   box.fetch=async()=>response(status,{});await box.showLearningProgress();assert.doesNotMatch(e.learningProgressContent.innerHTML,/data-progress-set=/);
   if(status===401)assert.equal(e.login.classList.contains('hidden'),false);else assert.match(e.learningProgressState.textContent,/Nie udało/);
   box.fetch=async()=>response(200,partialFixture(1));await box.showLearningProgress();
  }
  box.fetch=async()=>{throw Error('synthetic offline')};await box.showLearningProgress();assert.doesNotMatch(e.learningProgressContent.innerHTML,/data-progress-set=/);
  box.fetch=async()=>response(200,partialFixture(5));await box.showLearningProgress();assert.doesNotMatch(e.learningProgressContent.innerHTML,/Ocena częściowa|Nieocenione:/);assert.equal(quizSnapshot(),before);
  const snapshot=e.learningProgressContent.innerHTML;await box.showLearningProgress();assert.equal(e.learningProgressContent.innerHTML,snapshot);
 });
}
const winter='2026-01-15T09:15:00.000Z',later='2026-01-15T09:20:00.000Z';
const timeLabel=t=>'Dane odświeżono: '+t;
function timed(value=winter,marker=1){
 const d=fixture(marker!==1);d.dataGeneratedAt=value;d.generatedAt=later;
 d.stats={quizzesCompleted:marker,latestQuizPercent:marker===1?80:90,masteredTotal:marker};
 return d;
}
const ok=data=>({kind:'ok',data});
const failureKinds=['network','http','json'];
const invalidTimes=[undefined,null,'',0,'invalid','2026-02-30T09:15:00.000Z','2026-01-15T09:15:00+00:00','2026-01-15T09:15:00','2026-01-15T24:00:00Z','2026-01-15T09:60:00Z','2026-13-15T09:15:00Z','2026-01-15T09:15:60Z',' 2026-01-15T09:15:00Z',{},true];
function deferred(){let release;const promise=new Promise(r=>release=r);return {promise,release};}
function networkPlan(initial){
 const p={student:[initial],save:[],login:[],counts:{student:0,save:0,login:0},unexpected:[]};
 p.take=(url,options={})=>{
  const key={'/api/student':'student','/api/quiz-submit':'save','/api/login':'login'}[url];
  assert.ok(key,'Unexpected request '+url);p.counts[key]++;
  assert.equal(options.credentials,'same-origin');
  if(key==='student'){assert.equal(options.method||'GET','GET');assert.equal(options.cache,'no-store');}
  else {assert.equal(options.method,'POST');const body=JSON.parse(options.body);if(key==='save')assert.deepEqual(body,{setWeek:2,batch:1,answers:['synthetic answer']});else assert.deepEqual(body,{pin:'synthetic-pin'});}
  const entry=p[key].shift();assert.ok(entry,'Unplanned request '+url);if(entry.started)entry.started.release();return entry;
 };
 p.check=()=>{assert.deepEqual(p.unexpected,[]);for(const key of ['student','save','login'])assert.equal(p[key].length,0,'Unconsumed '+key+' mock');};
 return p;
}
async function vmDriver(initial=ok(timed())){
 const plan=networkPlan(initial);
 const fetchAdapter=async(url,options)=>{
  const entry=plan.take(url,options);if(entry.gate)await entry.gate.promise;
  if(entry.kind==='network')throw Error('synthetic offline');
  if(entry.kind==='json')return {status:200,ok:true,json:async()=>{throw SyntaxError('synthetic malformed JSON')}};
  const status=entry.kind==='http'?502:entry.kind==='auth'?401:200;
  return response(status,entry.kind==='ok'?entry.data:{error:'synthetic failure'});
 };
 const {box,elements}=domBox(fetchAdapter);box.document.querySelector=()=>({value:'synthetic answer'});
 Object.defineProperty(box.document,'activeElement',{get:()=>elements[elements.focused]});
 box.__readSettled=0;const original=box.refreshStudentProgress;
 box.refreshStudentProgress=async function(){try{return await original()}finally{box.__readSettled++}};
 await tick();
 const d={plan,evaluate:async expr=>vm.runInContext(expr,box),
  async wait(expr){await tick();assert.equal(Boolean(vm.runInContext(expr,box)),true,expr)},
  async startSubmit(){box.showQuiz();box.checkQuiz();await tick()},
  async submit(){await this.startSubmit()},
  async login(){elements.pin.value='synthetic-pin';elements.loginForm.listeners.submit({preventDefault(){}});await tick()},
  async close(){plan.check()},box};
 return d;
}
const snapshotExpr=`({label:document.getElementById('dataRefreshTime').textContent,
 data:DATA,progress:progressText.textContent,result:quizResult.innerHTML,
 button:checkQuizBtn.textContent,disabled:checkQuizBtn.disabled,
 homeHidden:home.classList.contains('hidden'),quizHidden:quiz.classList.contains('hidden'),
 loginHidden:login.classList.contains('hidden'),error:error.textContent,state:learningProgressState.textContent})`;
async function snapshot(d){return plain(await d.evaluate(snapshotExpr));}
async function expectLabel(d,time){await d.wait(`document.getElementById('dataRefreshTime').textContent===${JSON.stringify(timeLabel(time))}`);}
async function readThrough(d,entry,path='progress'){
 d.plan.student.push(entry);
 await d.evaluate(path==='load'?'loadData()':'showLearningProgress()');
}
async function assertSaved(d){
 const s=await snapshot(d);assert.equal(s.button,'WYNIK ZAPISANY');assert.equal(s.disabled,true);
 assert.match(s.result,/Wynik: 80%/);assert.match(s.result,/4 \/ 5 pkt/);assert.match(s.result,/zapisano próbę 2/);
 assert.doesNotMatch(s.result,/Nie zapisano wyniku/);return s;
}
async function timeTests(create,prefix){
 await test(prefix+' TIME-03 pending first read has initial placeholder and loading screen',async()=>{
  const gate=deferred(),started=deferred();const d=await create({...ok(timed()),gate,started});
  try{
   await started.promise;await expectLabel(d,'—');const s=await snapshot(d);assert.equal(s.data,null);assert.equal(s.homeHidden,true);
   assert.equal(await d.evaluate(`loading.classList.contains('hidden')`),false);
   gate.release();await d.wait(`!home.classList.contains('hidden')`);await expectLabel(d,'10:15');
  }finally{gate.release();await d.close()}
 });
 await test(prefix+' TIME-04 valid leap day, seconds and fractional seconds',async()=>{
  const d=await create();try{
   for(const stamp of ['2024-02-29T09:15:00Z','2024-02-29T09:15:00.1Z','2024-02-29T09:15:00.12Z','2024-02-29T09:15:00.123Z','2024-02-29T09:15:00.123456Z']){
    await readThrough(d,ok(timed(stamp)));await expectLabel(d,'10:15');
   }
   await readThrough(d,ok(timed('2026-02-29T09:15:00Z')));await expectLabel(d,'—');
   await readThrough(d,{kind:'http'});await expectLabel(d,'10:15');
  }finally{await d.close()}
 });
 await test(prefix+' TIME-17 empty and incomplete history update home time while retaining progress view',async()=>{
  const d=await create();try{
   const empty=timed(later,2);empty.learningProgress={summary:{setsCompleted:0,batchesSent:0,quizzesCompleted:0},sets:[]};
   await readThrough(d,ok(empty));await expectLabel(d,'10:20');assert.match((await snapshot(d)).state,/Brak potwierdzonych/);
   const incomplete=timed(winter,3);incomplete.learningProgress.incomplete=true;
   Object.assign(incomplete.learningProgress.sets[0],{masteryPercent:null,masteredWords:null,difficultWords:null,incomplete:true,availabilityReason:'Niekompletna historia'});
   await readThrough(d,ok(incomplete));await expectLabel(d,'10:15');assert.match((await snapshot(d)).state,/Niektóre dane/);
   assert.equal((await snapshot(d)).homeHidden,true);assert.match((await snapshot(d)).progress,/3 quizy/);
   await readThrough(d,{kind:'http'});await expectLabel(d,'10:15');assert.equal((await snapshot(d)).data.stats.masteredTotal,3);
  }finally{await d.close()}
 });
 await test(prefix+' TIME-04/05/17 winter, summer, midnight, subsequent read and restored latest time',async()=>{
  const d=await create();try{
   await expectLabel(d,'10:15');
   for(const [stamp,label] of [['2026-07-15T08:15:00.000Z','10:15'],['2026-01-15T23:05:00.000Z','00:05'],[later,'10:20']]){
    await readThrough(d,ok(timed(stamp,2)));await expectLabel(d,label);
    const s=await snapshot(d);assert.equal(s.homeHidden,true);assert.match(s.progress,/2 quizy/);assert.equal(s.data.dataGeneratedAt,stamp);
   }
   await readThrough(d,{kind:'http'});await expectLabel(d,'10:20');assert.match((await snapshot(d)).state,/Nie udało/);
   await d.evaluate('returnFromLearningProgress()');assert.equal((await snapshot(d)).homeHidden,false);
  }finally{await d.close()}
 });
 await test(prefix+' TIME-06/08 complete invalid-time matrix accepts data, avoids generatedAt fallback and retains memory',async()=>{
  const d=await create();try{
   for(const [i,value] of invalidTimes.entries()){
    const data=timed(value,i+2);if(value===undefined)delete data.dataGeneratedAt;
    await readThrough(d,ok(data));await expectLabel(d,'—');
    let s=await snapshot(d);assert.equal(s.data.stats.masteredTotal,i+2);assert.match(s.progress,new RegExp((i+2)+' opanowanych'));
    await readThrough(d,{kind:'http'});await expectLabel(d,'10:15');s=await snapshot(d);assert.equal(s.data.stats.masteredTotal,i+2);
   }
  }finally{await d.close()}
 });
 for(const kind of failureKinds){
  for(const path of ['load','progress'])for(const remembered of [false,true]){
   await test(`${prefix} TIME-07 ${path} ${kind} remembered=${remembered}`,async()=>{
    const d=await create(ok(timed(remembered?winter:null)));try{
     if(remembered)await readThrough(d,ok(timed(null,2)),path);
     const before=(await snapshot(d)).data;
     await readThrough(d,{kind},path);await expectLabel(d,remembered?'10:15':'—');
     const s=await snapshot(d);assert.deepEqual(s.data,before);
     assert.match(path==='load'?s.error:s.state,/Nie udało/);
    }finally{await d.close()}
   });
  }
  await test(`${prefix} TIME-07 initial ${kind} leaves DATA empty`,async()=>{
   const d=await create({kind});try{await expectLabel(d,'—');const s=await snapshot(d);assert.equal(s.data,null);assert.equal(s.homeHidden,true);assert.match(s.error,/Nie udało/);}finally{await d.close()}
  });
 }
 await test(prefix+' TIME-09 initial 401, focus, later login and 401 after invalid success',async()=>{
  const d=await create({kind:'auth'});try{
   await expectLabel(d,'—');assert.equal((await snapshot(d)).loginHidden,false);await d.wait(`typeof document.activeElement==='undefined'?focused==='pin':document.activeElement.id==='pin'`);
   d.plan.login.push(ok({ok:true}));d.plan.student.push(ok(timed()));await d.login();await expectLabel(d,'10:15');
   assert.equal((await snapshot(d)).homeHidden,false);
   await readThrough(d,ok(timed(null,2)));await expectLabel(d,'—');
   await readThrough(d,{kind:'auth'});await expectLabel(d,'10:15');
   const s=await snapshot(d);assert.equal(s.homeHidden,true);assert.equal(s.loginHidden,false);assert.equal(s.data.stats.masteredTotal,2);
   await d.wait(`typeof document.activeElement==='undefined'?focused==='pin':document.activeElement.id==='pin'`);
   d.plan.login.push(ok({ok:true}));d.plan.student.push(ok(timed(later,3)));await d.login();await expectLabel(d,'10:20');
   assert.deepEqual(d.plan.counts,{student:5,save:0,login:2});
  }finally{await d.close()}
 });
 for(const outcome of ['valid','invalid',...failureKinds,'auth'])for(const remembered of [true,false]){
  await test(`${prefix} TIME-10–13 saved quiz read=${outcome} remembered=${remembered}`,async()=>{
   const d=await create(ok(timed(remembered?winter:null)));try{
    // Make the currently displayed time invalid; failures must use separate memory.
    await readThrough(d,ok(timed(null)));await d.evaluate('showHome()');
    const before=(await snapshot(d)).data;
    const entry=outcome==='valid'?ok(timed(later,2)):outcome==='invalid'?ok(timed('2026-02-30T09:15:00.000Z',2)):{kind:outcome};
    d.plan.save.push(ok({ok:true,percent:80,score:4,maxScore:5,attemptNo:2}));d.plan.student.push(entry);
    const reads=d.plan.counts.student;await d.submit();
    const expected=outcome==='valid'?'10:20':outcome==='invalid'?'—':remembered?'10:15':'—';await expectLabel(d,expected);
    const s=await assertSaved(d);assert.equal(d.plan.counts.save,1);assert.equal(d.plan.counts.student,reads+1);
    if(outcome==='valid'||outcome==='invalid'){
     assert.equal(s.data.stats.masteredTotal,2);assert.match(s.progress,/2 quizy/);assert.match(s.progress,/90%/);assert.equal(s.data.learningProgress.sets[0].batches[0].masteryPercent,60);
    }else assert.deepEqual(s.data,before);
    if(outcome==='auth'){
     assert.equal(s.loginHidden,false);assert.equal(s.homeHidden,true);assert.equal(s.quizHidden,true);
     await d.wait(`typeof document.activeElement==='undefined'?focused==='pin':document.activeElement.id==='pin'`);
    }else{assert.equal(s.quizHidden,false);assert.equal(s.homeHidden,true);}
    if(outcome==='invalid'){
     await d.evaluate('showHome()');assert.match((await snapshot(d)).progress,/2 quizy/);await expectLabel(d,'—');
     await readThrough(d,{kind:'http'});await expectLabel(d,remembered?'10:15':'—');assert.equal((await snapshot(d)).result,s.result);
    }
    if(outcome==='valid'){await d.evaluate('showHome()');await expectLabel(d,'10:20');assert.match((await snapshot(d)).progress,/2 quizy/);}
   }finally{await d.close()}
  });
 }
 for(const kind of [...failureKinds,'rejected']){
  await test(`${prefix} TIME-14 unconfirmed POST ${kind} does not GET or touch timestamp memory`,async()=>{
   const d=await create();try{
    await readThrough(d,ok(timed(null)));await expectLabel(d,'—');await d.evaluate('showHome()');
    d.plan.save.push(kind==='rejected'?ok({ok:false,error:'synthetic rejection'}):{kind});
    const before=await snapshot(d),reads=d.plan.counts.student;
    await d.submit();const s=await snapshot(d);assert.match(s.result,/Nie zapisano wyniku/);assert.equal(s.disabled,false);
    assert.equal(s.label,before.label);assert.deepEqual(s.data,before.data);assert.equal(d.plan.counts.student,reads);assert.equal(d.plan.counts.save,1);
    await readThrough(d,{kind:'http'});await expectLabel(d,'10:15');assert.equal(d.plan.counts.save,1);
   }finally{await d.close()}
  });
 }
 for(const kind of [...failureKinds,'auth']){
  await test(`${prefix} TIME-12/13 exact saved result DOM survives delayed ${kind} read`,async()=>{
   const d=await create();const gate=deferred(),started=deferred();try{
    await readThrough(d,ok(timed(null)));await d.evaluate('showHome()');
    const settled=await d.evaluate('__readSettled'),reads=d.plan.counts.student;
    d.plan.save.push(ok({ok:true,percent:80,score:4,maxScore:5,attemptNo:2}));d.plan.student.push({kind,gate,started});
    await d.startSubmit();await started.promise;const before=await assertSaved(d);await expectLabel(d,'—');
    gate.release();await d.wait(`__readSettled===${settled+1}`);await expectLabel(d,'10:15');
    const after=await assertSaved(d);assert.equal(after.result,before.result);assert.deepEqual(after.data,before.data);
    assert.equal(after.button,before.button);assert.equal(after.disabled,before.disabled);
    assert.equal(d.plan.counts.student,reads+1);assert.equal(d.plan.counts.save,1);
   }finally{gate.release();await d.close()}
  });
 }
 await test(prefix+' TIME-16 older success and older failure cannot change accepted data/time/memory',async()=>{
  const d=await create();try{
   for(const kind of ['ok',...failureKinds,'auth']){
    const gate=deferred(),started=deferred();d.plan.student.push(kind==='ok'?{...ok(timed(winter,1)),gate,started}:{kind,gate,started});
    const older=d.evaluate('refreshStudentProgress()');
    await started.promise;
    await readThrough(d,ok(timed(later,2)));await expectLabel(d,'10:20');
    gate.release();assert.equal(await older,null);await expectLabel(d,'10:20');
    assert.equal((await snapshot(d)).data.stats.masteredTotal,2);assert.equal((await snapshot(d)).loginHidden,true);
   }
   await readThrough(d,ok(timed(null,3)));await readThrough(d,{kind:'http'});await expectLabel(d,'10:20');
   assert.equal((await snapshot(d)).data.stats.masteredTotal,3);
  }finally{await d.close()}
 });
}
async function proxyTests(){
 await test('AC-12 real proxy/auth source with synthetic config and fully mocked upstream',async()=>{
  const env={STUDENT_PIN:'synthetic-pin',SESSION_SECRET:'synthetic-secret',STUDENT_BACKEND_URL:'https://synthetic.invalid/backend',STUDENT_API_SECRET:'synthetic-api-key'};
  const auth={module:{exports:{}},require:n=>{assert.equal(n,'crypto');return crypto;},process:{env},Buffer};vm.createContext(auth);vm.runInContext(fs.readFileSync(path.join(front,'api/_auth.js'),'utf8'),auth);
  let upstream=0,reject=false,payload=fixture();
  const proxy={module:{exports:{}},require:n=>{assert.equal(n,'./_auth');return auth.module.exports;},process:{env},console:{error(){}},fetch:async(url,options)=>{
   upstream++;assert.equal(url,'https://synthetic.invalid/backend');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{action:'getStudentData',apiSecret:'synthetic-api-key'});
   return response(200,reject?{ok:false,error:'Unauthorized.'}:{ok:true,data:payload});
  }};vm.createContext(proxy);vm.runInContext(fs.readFileSync(path.join(front,'api/student.js'),'utf8'),proxy);
  const res=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(data){this.data=data;return this}});
  let r=res();await proxy.module.exports({method:'GET',headers:{}},r);assert.equal(r.statusCode,401);assert.equal(r.data.learningProgress,undefined);assert.equal(upstream,0);assert.equal(r.headers['Cache-Control'],'no-store');
  r=res();await proxy.module.exports({method:'GET',headers:{cookie:'student_session=ok.invalid'}},r);assert.equal(r.statusCode,401);assert.equal(upstream,0);
  const headers={cookie:auth.module.exports.sessionCookie()};r=res();await proxy.module.exports({method:'GET',headers},r);assert.equal(r.statusCode,200);assert.match(r.headers['Cache-Control'],/no-store/);assert.deepEqual(plain(r.data.learningProgress),fixture().learningProgress);
  payload=partialFixture();r=res();await proxy.module.exports({method:'GET',headers},r);assert.equal(r.statusCode,200);assert.deepEqual(plain(r.data.learningProgress),payload.learningProgress);
  reject=true;r=res();await proxy.module.exports({method:'GET',headers},r);assert.equal(r.statusCode,502);assert.equal(r.data.learningProgress,undefined);assert.equal(r.data.diagnostic,'BACKEND_UNAUTHORIZED');
  r=res();await proxy.module.exports({method:'POST',headers},r);assert.equal(r.statusCode,405);
 });
}
async function browserTests(){
 const {chromium}=require('playwright');
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  let data=fixture(false),status=200,pause=null,requests=0,submitCount=0;
  const unexpected=[],errors=[];
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!=='https://synthetic.invalid'){unexpected.push(req.url());return route.abort();}
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
   if(url.pathname==='/api/student'){
    requests++;assert.equal(req.method(),'GET');
    if(pause)await pause.promise;
    return route.fulfill({status,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:JSON.stringify(status===200?data:{error:'synthetic rejection'})});
   }
   if(url.pathname==='/api/quiz-submit'){
    assert.equal(req.method(),'POST');const body=req.postDataJSON();assert.equal(body.setWeek,2);assert.equal(body.batch,1);submitCount++;data=fixture(true);
    return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,percent:80,score:4,maxScore:5,attemptNo:2})});
   }
   unexpected.push(req.url());return route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const visible=async selector=>page.locator(selector).first().waitFor({state:'visible'});
  const open=async()=>{await page.locator('#learningProgressBtn').click();await visible('[data-progress-counter="setsCompleted"]');};
  await page.goto('https://synthetic.invalid/');await visible('#home');
  await test('Browser AC-01 click, keyboard Enter, back and focus',async()=>{
   await open();assert.equal(await page.locator('#learningProgressTitle').evaluate(e=>e===document.activeElement),true);
   await page.locator('#learningProgressBack').click();await visible('#home');assert.equal(await page.locator('#learningProgressBtn').evaluate(e=>e===document.activeElement),true);
   await page.keyboard.press('Enter');await visible('#learningProgress');await visible('[data-progress-counter="setsCompleted"]');
  });
  await test('Browser AC-02–08 API parity, charts, two sent sets, collapsed history and dynamic batches',async()=>{
   const d=data.learningProgress;
   for(const [k,n] of Object.entries(d.summary))assert.equal(await page.locator(`[data-progress-counter="${k}"]`).textContent(),String(n));
   assert.equal(await page.locator('[data-progress-set]').count(),3);
   const ids=await page.locator('[data-progress-set]').evaluateAll(es=>es.map(e=>Number(e.dataset.progressSet)));assert.deepEqual(ids,[2,9,4]);
   assert.equal(await page.locator('[data-progress-set="4"]').isVisible(),false);assert.equal(await page.locator('#learningProgressHistory').getAttribute('open'),null);
   await page.locator('#learningProgressHistory > summary').click();assert.equal(await page.locator('[data-progress-set="4"]').isVisible(),false);await page.locator('.lp-history-set > summary').click();assert.equal(await page.locator('[data-progress-set="4"]').isVisible(),true);
   for(const [s,n] of [[2,7],[9,3],[4,1]])assert.equal(await page.locator(`[data-progress-set="${s}"] [data-progress-batch]`).count(),n);
   const s2=page.locator('[data-progress-set="2"]');assert.ok((await s2.textContent()).includes(`${d.sets[0].masteredWords}/${d.sets[0].sentWords}`));
   const chart=s2.locator('[role="progressbar"]').first();assert.equal(Number(await chart.getAttribute('aria-valuenow')),d.sets[0].masteryPercent);
   assert.ok(await page.locator('[role="progressbar"][aria-label][aria-valuetext]').count()>10);
   for(const [b,level,value] of [[1,'low',69.9],[2,'mid',70],[3,'mid',89.9]]){
    const bar=page.locator(`[data-progress-set="9"] [data-progress-batch="${b}"] [role="progressbar"]`);
    assert.ok((await bar.getAttribute('class')).includes('lp-'+level));assert.ok(Math.abs(Number(await bar.getAttribute('aria-valuenow'))-value)<1e-10);
   }
   for(const text of ['Wykonany','Wysłany w całości','Pierwsza próba'])assert.ok((await page.locator('#learningProgressContent').textContent()).includes(text));
  });
  await test('Browser AC-10 widths 320/1280 and 200% zoom without horizontal overflow',async()=>{
   for(const width of [320,1280]){
    await page.setViewportSize({width,height:900});
    for(const zoom of [1,2]){
     await page.evaluate(z=>document.body.style.zoom=String(z),zoom);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`overflow ${width} zoom ${zoom}`);
     for(const el of await page.locator('.lp-counter').all())assert.equal(await el.isVisible(),true);
     const bounds=await page.locator('[data-progress-set="2"]').boundingBox();assert.ok(bounds.width<=width+1);
    }
   }
   await page.evaluate(()=>document.body.style.zoom='1');
  });
  await test('Browser AC-11 saved quiz triggers refresh; revisit and reload preserve updated data',async()=>{
   await page.locator('#learningProgressBack').click();await page.locator('#quizBtn').click();await visible('#checkQuizBtn');
   await page.locator('input.quiz-input').fill('synthetic answer');
   const before=requests;await page.locator('#checkQuizBtn').click();await page.waitForFunction(()=>document.getElementById('checkQuizBtn').textContent==='WYNIK ZAPISANY');
   await page.waitForFunction(()=>DATA.learningProgress.sets[0].batches[0].masteryPercent===60);
   assert.equal(submitCount,1);assert.ok(requests>before);
   await page.evaluate(()=>showHome());await open();const text=await page.locator('#learningProgressContent').textContent();assert.ok(text.includes('↑ Wzrost +20 pp'));
   assert.equal(await page.locator('[data-progress-set="4"] .lp-batch .lp-column.lp-high').count(),1);assert.equal(await page.locator('[data-progress-set="4"] .lp-down').count(),1);
   await page.locator('#learningProgressBack').click();await open();assert.equal(await page.locator('#learningProgressContent').textContent(),text);
   await page.reload();await visible('#home');await open();assert.equal(await page.locator('#learningProgressContent').textContent(),text);
  });
  await test('Browser AC-06/09 loading, incomplete history, empty, zero denominator, 502 and expired session',async()=>{
   await page.locator('#learningProgressBack').click();
   let release;pause={promise:new Promise(r=>release=r)};
   await page.locator('#learningProgressBtn').click();await page.getByText('Ładowanie postępu…',{exact:true}).waitFor();assert.equal(await page.locator('#learningProgress').getAttribute('aria-busy'),'true');assert.equal(await page.locator('[data-progress-counter]').count(),0);release();pause=null;await visible('[data-progress-counter]');
   const incomplete=fixture();incomplete.learningProgress.incomplete=true;const s=incomplete.learningProgress.sets[0];s.incomplete=true;s.masteredWords=null;s.difficultWords=null;s.masteryPercent=null;s.availabilityReason='Niekompletna historia';s.batches[0].masteryPercent=null;s.batches[0].masteredWords=null;s.batches[0].trendPp=null;s.batches[0].trendReason='Niekompletna historia';
   data=incomplete;await page.locator('#learningProgressBack').click();await open();assert.ok((await page.locator('#learningProgressContent').textContent()).includes('Opanowanie: —'));assert.ok((await page.locator('#learningProgressContent').textContent()).includes('Niekompletna historia'));
   data={...fixture(),learningProgress:{summary:{setsCompleted:0,batchesSent:0,quizzesCompleted:0},sets:[]}};await page.locator('#learningProgressBack').click();await open();assert.ok((await page.locator('#learningProgressState').innerText()).includes('Brak potwierdzonych'));assert.equal(await page.locator('[data-progress-set]').count(),0);
   const zero=fixture();const z=zero.learningProgress.sets[0];Object.assign(z,{sentWords:0,masteredWords:null,difficultWords:null,masteryPercent:null});zero.learningProgress.sets=[z];data=zero;await page.locator('#learningProgressBack').click();await open();assert.ok((await page.locator('#learningProgressContent').textContent()).includes('—/0'));assert.ok(!(await page.locator('#learningProgressContent').innerText()).includes('NaN'));
   status=502;await page.locator('#learningProgressBack').click();await page.locator('#learningProgressBtn').click();await page.getByText('Nie udało się pobrać postępu. Spróbuj ponownie.',{exact:true}).waitFor();assert.equal(await page.locator('[data-progress-counter]').count(),0);
   status=200;data=fixture();await page.getByRole('button',{name:'Spróbuj ponownie'}).click();await visible('[data-progress-counter]');
   status=401;await page.locator('#learningProgressBack').click();await page.locator('#learningProgressBtn').click();await visible('#login');assert.equal(await page.locator('#learningProgress').isVisible(),false);assert.equal(await page.locator('#pin').evaluate(e=>e===document.activeElement),true);
  });
  assert.deepEqual(unexpected,[],'all requests must be locally mocked');assert.deepEqual(errors,[],'no page errors');await context.close();
  const create=(initial,options)=>browserDriver(browser,initial,options);
  await timeTests(create,'Chromium UTC');
  await browserTimeLifecycle(create);
  await browserVisualTests(browser);
 }finally{await browser.close();}
}
async function browserDriver(browser,initial=ok(timed()),options={}){
 const plan=networkPlan(initial),errors=[];
 const context=await browser.newContext({viewport:{width:1280,height:900},timezoneId:options.timezone||'UTC',serviceWorkers:'block'});
 await context.addCookies([{name:'synthetic_auth',value:'preserved',url:'https://synthetic.invalid',httpOnly:true,sameSite:'Lax'}]);
 await context.addInitScript(()=>{
  window.__syntheticRequests=[];window.__storageWrites=[];
  const original=window.fetch;
  window.fetch=function(url,options){window.__syntheticRequests.push({url,options});return original.call(this,url,options)};
  const store=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){window.__storageWrites.push({key,value});return store.call(this,key,value)};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  try{
   assert.equal(url.origin,'https://synthetic.invalid','external request');
   if(url.pathname==='/'){assert.equal(req.method(),'GET');return await route.fulfill({contentType:'text/html',body:html});}
   const recorded=await page.evaluate(()=>window.__syntheticRequests.shift());
   assert.ok(recorded,'Request must originate from the app fetch');assert.equal(recorded.url,url.pathname);
   assert.equal(req.method(),recorded.options.method||'GET');
   const entry=plan.take(url.pathname,recorded.options);
   if(entry.gate)await entry.gate.promise;
   if(entry.kind==='network')return await route.abort('failed');
   const status=entry.kind==='http'?502:entry.kind==='auth'?401:200;
   return await route.fulfill({status,contentType:'application/json',headers:{'Cache-Control':'no-store'},body:entry.kind==='json'?'{malformed':JSON.stringify(entry.kind==='ok'?entry.data:{error:'synthetic failure'})});
  }catch(e){plan.unexpected.push(e.message);await route.abort();}
 });
 await page.goto('https://synthetic.invalid/',{waitUntil:'domcontentloaded'});
 if(!initial.gate)await page.waitForFunction(()=>loading.classList.contains('hidden'));
 // Observe completion without changing the application's requests or response handling.
 await page.evaluate(()=>{
  window.__readSettled=0;const original=refreshStudentProgress;
  refreshStudentProgress=async function(){try{return await original()}finally{window.__readSettled++}};
 });
 return {plan,page,context,
  evaluate:expr=>page.evaluate(expr),wait:expr=>page.waitForFunction(expr),
  async startSubmit(){
   await page.evaluate(()=>showHome());await page.locator('#quizBtn').click();
   await page.locator('input.quiz-input').fill('synthetic answer');await page.locator('#checkQuizBtn').click();
   await page.waitForFunction(()=>checkQuizBtn.textContent!=='ZAPISUJĘ WYNIK…');
  },
  async submit(){
   const reads=await page.evaluate(()=>window.__readSettled),willRefresh=plan.save[0].kind==='ok'&&plan.save[0].data.ok;
   await this.startSubmit();
   if(willRefresh)await page.waitForFunction(n=>window.__readSettled===n+1,reads);
  },
  async login(){
   await page.locator('#pin').fill('synthetic-pin');await page.locator('#loginForm button').click();
   await page.waitForFunction(()=>login.classList.contains('hidden')&&loading.classList.contains('hidden'));
  },
  async close(){
   try{
    plan.check();assert.deepEqual(errors,[],'no page errors');
    const stores=await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage},writes:window.__storageWrites}));
    assert.deepEqual(stores,{local:{},session:{},writes:[]});
    const cookies=await context.cookies();assert.equal(cookies.length,1);assert.equal(cookies[0].name,'synthetic_auth');assert.equal(cookies[0].value,'preserved');
   }finally{await context.close()}
  }
 };
}
async function browserTimeLifecycle(create){
 await test('Chromium TIME-03/15 initial HTML, pending read, reload resets memory and preserves auth cookie',async()=>{
  const initial=deferred(),started=deferred();const d=await create({...ok(timed()),gate:initial,started});
  let next;
  try{
   await started.promise;await expectLabel(d,'—');assert.equal(await d.page.locator('#home').isVisible(),false);
   assert.equal(await d.page.locator('#loading').isVisible(),true);assert.match(await d.page.locator('#loading').innerText(),/Ładowanie/);
   initial.release();await d.page.locator('#home').waitFor({state:'visible'});await expectLabel(d,'10:15');
   next=deferred();const nextStarted=deferred();d.plan.student.push({kind:'http',gate:next,started:nextStarted});
   await d.page.reload({waitUntil:'domcontentloaded'});await nextStarted.promise;await expectLabel(d,'—');
   assert.equal(await d.page.locator('#home').isVisible(),false);assert.equal(await d.page.locator('#loading').isVisible(),true);
   next.release();await d.page.locator('#error').waitFor({state:'visible'});await expectLabel(d,'—');assert.equal((await snapshot(d)).data,null);
  }finally{initial.release();if(next)next.release();await d.close()}
 });
 await test('Chromium TIME-04 browser Europe/Warsaw agrees on winter, summer and midnight',async()=>{
  const d=await create(ok(timed()),{timezone:'Europe/Warsaw'});try{
   await expectLabel(d,'10:15');
   for(const [stamp,label] of [['2026-07-15T08:15:00.000Z','10:15'],['2026-01-15T23:05:00.000Z','00:05']]){
    await readThrough(d,ok(timed(stamp)));await expectLabel(d,label);
   }
  }finally{await d.close()}
 });
 await test('Chromium TIME-03/17 time label accessible at widths 320/1280 and zoom 200%',async()=>{
  const d=await create();try{
   assert.equal(await d.page.locator('#dataRefreshTime').getAttribute('role'),'status');
   for(const width of [320,1280])for(const zoom of [1,2]){
    await d.page.setViewportSize({width,height:900});await d.page.evaluate(z=>document.body.style.zoom=String(z),zoom);
    await expectLabel(d,'10:15');assert.equal(await d.page.locator('#dataRefreshTime').isVisible(),true);
    const fits=await d.page.locator('#dataRefreshTime').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&e.scrollWidth<=e.clientWidth+1});
    assert.equal(fits,true,`label overflow width=${width} zoom=${zoom}`);
   }
  }finally{await d.close()}
 });
}
// The browser branch writes synthetic screenshots only to an OS temporary dir.
// CSS zoom and half-width reflow are stress checks, not proof of native browser
// zoom. Native 200% zoom and visual baseline approval still require a reviewer.
async function browserVisualTests(browser){
 const os=require('node:os');
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'learning-progress-qa-'));
 const proof={reference:visualBaseline.reference,chromiumVersion:browser.version(),screenshots:[],measurements:[],goldenCompared:[],humanReviewRequired:!visualBaseline.humanReviewed,zoomMethod:'CSS zoom=2 plus half-width layout reflow; native browser zoom review pending'};
 const capture=async(page,key)=>{
  const png=await page.locator('#learningProgress').screenshot({path:path.join(output,key+'.png'),animations:'disabled'});
  proof.screenshots.push(key+'.png');
  if (/^reference-[45]-(320|375|540|1280)$/.test(key)) {
   const encoded=png.toString('base64');
   for(let i=0;i<encoded.length;i+=2048)console.log('FACTORY_VISUAL_PNG:'+key+':'+i+':'+encoded.slice(i,i+2048));
  }
  if(visualBaseline.humanReviewed){
   assert.equal(browser.version(),visualBaseline.chromiumVersion,'Golden requires the reviewed Chromium version');
   assert.ok(visualBaseline.pngs[key],'Missing reviewed golden '+key);
   assert.deepEqual(png,Buffer.from(visualBaseline.pngs[key],'base64'),'Screenshot differs from reviewed golden '+key);
   proof.goldenCompared.push(key);
  }
 };
 const open=async(d,data)=>{d.plan.student.push(ok(data));await d.page.locator('#learningProgressBtn').click();await d.page.locator('[data-progress-counter]').first().waitFor();};
 const noOverflow=async(page)=>{
  const bad=await page.locator('#learningProgress').evaluate(root=>{
   const bad=[];
   for(const e of [root,...root.querySelectorAll('*')]){
    if(e.closest('svg')||e.classList.contains('lp-trend-word'))continue;
    let ancestor=e.parentElement,closed=false;
    while(ancestor&&ancestor!==root){if(ancestor.tagName==='DETAILS'&&!ancestor.open&&e.closest('summary')!==ancestor.querySelector(':scope > summary')){closed=true;break;}ancestor=ancestor.parentElement;}
    if(closed)continue;
    const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;
    // Closed details descendants have no client rects in Chromium.
    if(r.left<-1||r.right>innerWidth+1||e.scrollWidth>e.clientWidth+1)bad.push({tag:e.tagName,cls:e.className,left:r.left,right:r.right,scroll:e.scrollWidth,client:e.clientWidth});
   }
   return bad;
  });assert.deepEqual(bad,[],'Internal overflow or clipping, including when global overflow-x is hidden');
 };
 try{
  for(const assessed of [0,1,4,5]){
   await test(`NEW Chromium LP-01–04/10/15 partial contract assessed batches=${assessed}`,async()=>{
    const data=partialFixture(assessed),d=await browserDriver(browser,ok(data));try{
     const quizBefore=await d.page.locator('#quiz').innerHTML();
     d.plan.student.push(ok(data));await d.page.locator('#learningProgressBtn').focus();await d.page.keyboard.press('Enter');await d.page.locator('[data-progress-counter]').first().waitFor();
     assert.equal(await d.page.locator('#learningProgressTitle').evaluate(e=>e===document.activeElement),true);
     assert.deepEqual(await d.page.locator('[data-progress-set]').evaluateAll(es=>es.map(e=>Number(e.dataset.progressSet))),[2,9,4,7]);
     const current=d.page.locator('[data-progress-set="2"]');
     assert.equal(await current.locator('.lp-metrics > div').count(),3);
     assert.deepEqual(await current.locator('.lp-metrics strong').allTextContents(),['100',assessed?'2':'0',assessed?String(20*assessed-2):'0']);
     const aria=await current.locator(':scope > [role="progressbar"]').getAttribute('aria-valuetext');
     if(assessed<5){
      assert.match(aria,/potwierdzonego opanowania/);assert.ok(aria.includes(`Ocena częściowa: ${20*assessed} z 100 słów ocenionych`));
      assert.ok((await current.locator('.lp-assessment').innerText()).includes(`Nieocenione: ${100-20*assessed}`));
      assert.equal((await current.locator('.lp-assessment').innerText()).includes('Brak ocen; wszystkie wysłane słowa nieocenione'),assessed===0);
      assert.equal(await current.locator(':scope > [role="progressbar"]').getAttribute('aria-valuenow'),assessed?'2':'0');
      assert.equal(await current.locator('.lp-batch [role="progressbar"]:not([aria-valuenow])').count(),5-assessed);
     }else{assert.doesNotMatch(aria,/potwierdzonego/);assert.equal(await current.locator('.lp-assessment').count(),0);}
     const history=d.page.locator('#learningProgressHistory');await history.locator(':scope > summary').focus();await d.page.keyboard.press('Enter');assert.equal(await history.evaluate(e=>e.open),true);
     const older=history.locator('.lp-history-set').first(),summary=older.locator(':scope > summary');
     assert.equal((await summary.innerText()).includes('potwierdzonego opanowania'),assessed<5);
     await summary.focus();await d.page.keyboard.press('Enter');assert.equal(await older.evaluate(e=>e.open),true);
     for(const width of [320,375,540,1280])for(const zoom of [1,2]){
      await d.page.setViewportSize({width,height:1000});await d.page.evaluate(z=>document.body.style.zoom=String(z),zoom);await noOverflow(d.page);
      // Confirm score/header and metric cells cannot overlap at any stress width.
      const layout=await current.evaluate(e=>{
       const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}};
       return {head:[rect(e.querySelector('h2')),rect(e.querySelector('.lp-score'))],metrics:[...e.querySelector('.lp-metrics').children].map(rect)};
      });
      const separated=(a,b)=>a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1;
      assert.ok(separated(...layout.head),`heading collision ${width}/${zoom}`);
      layout.metrics.forEach((a,i)=>layout.metrics.slice(i+1).forEach(b=>assert.ok(separated(a,b),'metric collision')));
      const key=`partial-${assessed}-${width}-zoom-${zoom}.png`;await d.page.locator('#learningProgress').screenshot({path:path.join(output,key),animations:'disabled'});proof.screenshots.push(key);proof.measurements.push({assessed,width,zoom,layout});
     }
     await d.page.evaluate(()=>document.body.style.zoom='1');await d.page.locator('#learningProgressBack').focus();await d.page.keyboard.press('Enter');assert.equal(await d.page.locator('#learningProgressBtn').evaluate(e=>e===document.activeElement),true);
     assert.equal(await d.page.locator('#quiz').innerHTML(),quizBefore);
     const updated=partialFixture(5);d.plan.student.push(ok(updated));await d.page.keyboard.press('Enter');await d.page.locator('[data-progress-counter]').first().waitFor();assert.equal(await d.page.locator('.lp-assessment').count(),0);
    }finally{await d.close()}
   });
  }
  for(const count of visualBaseline.batchCounts){
   const data=visualFixture(count),d=await browserDriver(browser,ok(data));
   try{
    await open(d,data);
    for(const width of visualBaseline.widths){
     await test(`Chromium LP-14/15 columns and internal overflow width=${width} batches=${count}`,async()=>{
      await d.page.setViewportSize({width,height:1000});
      if(count===4||count===5)await capture(d.page,`reference-${count}-${width}`);
      assert.equal(await d.page.locator('.lp-counters > .lp-counter').count(),3);
      assert.equal(await d.page.locator('.lp-counters > .lp-set').count(),0,'Set cards must not become columns in the counter grid');
      await noOverflow(d.page);
      const grid=d.page.locator('[data-progress-set="8"] .lp-batches');
      const layout=await grid.evaluate(e=>({columns:getComputedStyle(e).gridTemplateColumns.split(' ').length,boxes:[...e.children].map(c=>{const r=c.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,width:r.width,font:parseFloat(getComputedStyle(c.querySelector('h3')).fontSize)}})}));
      const columns=width<540?2:Math.min(5,count);assert.equal(layout.columns,columns);
      layout.boxes.forEach((b,i)=>{assert.equal(b.font,visualBaseline.batchFont);assert.ok(b.width>=50);if(i%columns)assert.ok(b.x>layout.boxes[i-1].x);if(i>=columns)assert.ok(b.y>=layout.boxes[i-columns].bottom);});
      proof.measurements.push({width,count,layout});
      await d.page.locator('[data-progress-set="8"] .lp-data').first().evaluate(e=>e.open=true);await noOverflow(d.page);await d.page.locator('[data-progress-set="8"] .lp-data').first().evaluate(e=>e.open=false);
     });
    }
   }finally{await d.close()}
  }
  await test('Chromium LP-01/02/06/07/16/26 reference geometry, hierarchy, fonts and contrast',async()=>{
   const data=visualFixture(),d=await browserDriver(browser,ok(data));try{
    await open(d,data);await d.page.setViewportSize({width:540,height:1000});
    const metrics=await d.page.locator('#learningProgress').evaluate(root=>{
     const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
     const lum=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
     const contrast=[];
     for(const e of root.querySelectorAll('h1,h2,h3,p,strong,span,summary')){
      if(!e.getClientRects().length||e.classList.contains('lp-trend-word'))continue;
      const style=getComputedStyle(e);let parent=e,bg;
      while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)')break;parent=parent.parentElement;}
      const fg=lum(style.color),back=lum(bg||'rgb(255, 255, 255)');contrast.push({text:e.textContent,ratio:(Math.max(fg,back)+.05)/(Math.min(fg,back)+.05),large:parseFloat(style.fontSize)>=24||parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700});
     }
     const sets=[...root.querySelectorAll('.lp-set')].slice(0,2).map(set=>({title:rect(set.querySelector('h2')),score:rect(set.querySelector('.lp-score')),bar:rect(set.querySelector('.lp-track')),fill:rect(set.querySelector('.lp-track .lp-fill')),metrics:rect(set.querySelector('.lp-metrics')),percent:Number(set.querySelector('.lp-track').getAttribute('aria-valuenow')),counts:[...set.querySelectorAll('.lp-metrics strong')].map(e=>e.textContent)}));
     const batches=[...root.querySelector('[data-progress-set="8"] .lp-batches').children].map(e=>({title:rect(e.querySelector('h3')),percent:rect(e.querySelector('.lp-batch-percent')),track:rect(e.querySelector('.lp-column')),fill:rect(e.querySelector('.lp-fill')),trend:rect(e.querySelector('.lp-trend')),counts:rect(e.querySelector('.lp-counts')),color:getComputedStyle(e.querySelector('.lp-fill')).backgroundColor,font:getComputedStyle(e.querySelector('.lp-batch-percent')).fontSize}));
     const counters=[...root.querySelectorAll('.lp-counter')].map(e=>({icon:rect(e.querySelector('svg')),number:rect(e.querySelector('strong')),label:rect(e.querySelector('span'))}));
     return {sets,batches,counters,contrast,background:getComputedStyle(root).backgroundColor,ink:getComputedStyle(root).color,font:getComputedStyle(root).fontFamily};
    });
    proof.measurements.push({reference:metrics});
    assert.equal(metrics.background,visualBaseline.background);assert.equal(metrics.ink,visualBaseline.ink);assert.match(metrics.font,/Arial/);
    assert.deepEqual(metrics.sets.map(s=>s.counts),[['200','156','44'],['200','186','14']]);
    for(const s of metrics.sets){assert.ok(s.title.x<s.score.x);assert.ok(s.score.bottom<=s.bar.y);assert.ok(s.bar.bottom<=s.metrics.y);assert.ok(Math.abs(s.fill.width-s.bar.width*s.percent/100)<=1);}
    for(const c of metrics.counters){assert.ok(c.icon.bottom<=c.number.y);assert.ok(c.number.bottom<=c.label.y);}
    metrics.batches.forEach((b,i)=>{assert.equal(b.track.height,visualBaseline.trackHeight);assert.equal(b.track.width,visualBaseline.trackWidth);assert.equal(b.font,visualBaseline.percentFont+'px');assert.ok(b.title.bottom<=b.percent.y);assert.ok(b.percent.bottom<=b.track.y);assert.ok(b.track.bottom<=b.trend.y);assert.ok(b.trend.bottom<=b.counts.y);assert.ok(Math.abs(b.fill.height-b.track.height*[.96,.86,.72,.58][i])<=1);assert.ok(Math.abs(b.fill.bottom-b.track.bottom)<=1);assert.equal(b.color,visualBaseline.colors[i===0?'high':i===3?'low':'mid']);});
    for(const c of metrics.contrast)assert.ok(c.ratio>=(c.large?visualBaseline.largeContrast:visualBaseline.normalContrast),`Contrast ${c.ratio}: ${c.text}`);
    assert.equal(await d.page.locator('[data-progress-batch="4"] .lp-column.lp-low').count(),1);assert.equal(await d.page.locator('[data-progress-set="8"] [data-progress-batch="4"] .lp-up').count(),1);
   }finally{await d.close()}
  });
  await test('Chromium LP-11/12/16/18 thresholds, null ARIA, common scales and signed trends',async()=>{
   const data=visualFixture(5),values=[0,25,50,75,100],d=await browserDriver(browser,ok(data));try{
    const set=data.learningProgress.sets[0];values.forEach((v,i)=>Object.assign(set.batches[i],{masteryPercent:v,masteredWords:v/2,difficultWords:50-v/2}));await open(d,data);
    for(const [i,value] of values.entries()){
     const bar=d.page.locator(`[data-progress-set="8"] [data-progress-batch="${i+1}"] .lp-column`);
     assert.equal(await bar.getAttribute('role'),'progressbar');assert.equal(await bar.getAttribute('aria-valuemin'),'0');assert.equal(await bar.getAttribute('aria-valuemax'),'100');assert.equal(Number(await bar.getAttribute('aria-valuenow')),value);
     const geometry=await bar.evaluate(e=>({height:e.getBoundingClientRect().height,fill:e.firstElementChild.getBoundingClientRect().height,bottom:e.getBoundingClientRect().bottom-e.firstElementChild.getBoundingClientRect().bottom}));assert.ok(Math.abs(geometry.fill-geometry.height*value/100)<=1);assert.ok(Math.abs(geometry.bottom)<=1);
    }
    for(const [value,level] of [[69.99,'low'],[70,'mid'],[86,'mid'],[89.99,'mid'],[90,'high'],[100,'high'],[null,'unknown']]){
     await d.page.evaluate(({value})=>{const b=DATA.learningProgress.sets[0].batches[0];b.masteryPercent=value;b.masteredWords=value===null?null:0;b.trendPp=null;b.trendReason='Niekompletna próba';renderLearningProgress(DATA.learningProgress)},{value});
     const bar=d.page.locator('[data-progress-set="8"] [data-progress-batch="1"] .lp-column');assert.ok((await bar.getAttribute('class')).includes('lp-'+level));assert.equal(await bar.locator('.lp-fill').evaluate(e=>getComputedStyle(e).backgroundColor),visualBaseline.colors[level]);
     assert.equal(await bar.getAttribute('aria-valuenow'),value===null?null:String(value));assert.ok(await bar.getAttribute('aria-label'));if(value===null)assert.match(await bar.getAttribute('aria-valuetext'),/—/);
    }
    const details=d.page.locator('[data-progress-set="8"] [data-progress-batch="1"] .lp-data');await details.locator('summary').focus();await d.page.keyboard.press('Space');assert.equal(await details.getAttribute('open'),'');assert.match(await details.innerText(),/Niekompletna próba/);await noOverflow(d.page);await capture(d.page,'unknown-expanded-data');
    await d.page.locator('#learningProgressBack').focus();const outline=await d.page.locator('#learningProgressBack').evaluate(e=>getComputedStyle(e).outlineWidth);assert.ok(parseFloat(outline)>=3);
   }finally{await d.close()}
  });
  await test('Chromium LP-17 older sets expand individually by keyboard',async()=>{
   const data=visualFixture(),d=await browserDriver(browser,ok(data));try{
    data.learningProgress.sets.push({...data.learningProgress.sets[2],setWeek:1},{...data.learningProgress.sets[2],setWeek:2});await open(d,data);
    const history=d.page.locator('#learningProgressHistory');assert.equal(await history.getAttribute('open'),null);
    await history.locator(':scope > summary').focus();await d.page.keyboard.press('Enter');assert.equal(await history.getAttribute('open'),'');
    const rows=history.locator('.lp-history-set');assert.equal(await rows.count(),3);for(const row of await rows.all()){assert.equal(await row.locator('.lp-batch').isVisible(),false);assert.match(await row.locator(':scope > summary').innerText(),/Set [123].*50%/s);}
    await rows.first().locator(':scope > summary').focus();await d.page.keyboard.press('Space');assert.equal(await rows.first().locator('.lp-batch').isVisible(),true);assert.equal(await rows.nth(1).getAttribute('open'),null);await noOverflow(d.page);await capture(d.page,'history-expanded-individually');
   }finally{await d.close()}
  });
  await test('Chromium LP-05/17/20/21 0/1/2 sets, planned only, contract errors and retry',async()=>{
   const data=visualFixture(),d=await browserDriver(browser,ok(data));try{
    for(const count of [0,1,2]){
     const next=plain(data);next.learningProgress.sets=next.learningProgress.sets.slice(0,count);if(count===0)next.learningProgress.summary={setsCompleted:0,batchesSent:0,quizzesCompleted:0};
     await open(d,next);assert.equal(await d.page.locator('[data-progress-set]').count(),count);assert.equal(await d.page.locator('#learningProgressHistory').count(),0);await d.page.locator('#learningProgressBack').click();
    }
    const planned=fixture();planned.learningProgress={summary:{setsCompleted:0,batchesSent:0,quizzesCompleted:0},sets:[planned.learningProgress.sets[3]],incomplete:false};await open(d,planned);assert.equal(await d.page.locator('[data-progress-set]').count(),0);await capture(d.page,'planned-only');await d.page.locator('#learningProgressBack').click();
    for(const progress of [undefined,{summary:{setsCompleted:-1,batchesSent:0,quizzesCompleted:0},sets:[]},{summary:{},sets:[]}]){
     d.plan.student.push(ok({...data,learningProgress:progress}));await d.page.locator('#learningProgressBtn').click();await d.page.getByRole('button',{name:'Spróbuj ponownie'}).waitFor();assert.equal(await d.page.locator('[data-progress-counter]').count(),0);
     d.plan.student.push(ok(data));await d.page.getByRole('button',{name:'Spróbuj ponownie'}).click();await d.page.locator('[data-progress-counter]').first().waitFor();await d.page.locator('#learningProgressBack').click();
    }
   }finally{await d.close()}
  });
  await test('Chromium LP-22 leaving during pending GET prevents late data, time and login changes',async()=>{
   const d=await browserDriver(browser,ok(timed()));try{
    for(const kind of ['ok','http','auth','json','network']){
     const gate=deferred(),started=deferred();const before=await snapshot(d);const settled=await d.evaluate('__readSettled');
     d.plan.student.push(kind==='ok'?{...ok(timed(later,2)),gate,started}:{kind,gate,started});
     await d.page.locator('#learningProgressBtn').click();await started.promise;
     assert.equal(await d.page.locator('#learningProgress').getAttribute('aria-busy'),'true');assert.equal(await d.page.locator('[data-progress-set]').count(),0);
     await d.page.locator('#learningProgressBack').click();gate.release();await d.wait(`__readSettled===${settled+1}`);
     const after=await snapshot(d);assert.deepEqual(after.data,before.data);assert.equal(after.label,before.label);assert.equal(after.homeHidden,false);assert.equal(after.loginHidden,true);assert.equal(await d.page.locator('#learningProgressBtn').evaluate(e=>e===document.activeElement),true);
    }
   }finally{await d.close()}
  });
  await test('Chromium LP-19 CSS 200% stress and equivalent half-width reflow (native zoom pending)',async()=>{
   const data=visualFixture(5),d=await browserDriver(browser,ok(data));try{
    await open(d,data);
    for(const width of visualBaseline.widths){
     await d.page.setViewportSize({width,height:1000});await d.page.evaluate(()=>document.body.style.zoom='2');await noOverflow(d.page);await capture(d.page,`css-zoom-200-${width}`);
     await d.page.evaluate(()=>document.body.style.zoom='1');await d.page.setViewportSize({width:Math.floor(width/2),height:1000});await noOverflow(d.page);await capture(d.page,`reflow-half-width-${width}`);
    }
   }finally{await d.close()}
  });
 }finally{
  fs.writeFileSync(path.join(output,'proof.json'),JSON.stringify(proof,null,2));
  console.log('Synthetic screenshots and measurement context: '+output);
  if(!visualBaseline.humanReviewed)console.log('Golden comparison NOT performed: no independently reviewed PNG baseline. Native browser zoom and SVG screenshot review remain pending.');
 }
}
(async()=>{
 const args=process.argv.slice(2);assert.ok(args.every(a=>a==='--vm-only'),'unknown argument');
 await vmTests();
 if(args.includes('--vm-only'))console.log('VM-only: Chromium was not launched; browser acceptance remains for independent runner.');
 else await browserTests();
 console.log(`PASS ${tests} frontend acceptance groups (${args.includes('--vm-only')?'VM only':'VM + real Chromium'}).`);
})().catch(e=>{console.error(e);process.exitCode=1;});

