'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
process.env.STUDENT_PIN='fixture';
process.env.SESSION_SECRET='test-secret';
process.env.STUDENT_BACKEND_URL='https://example.invalid/backend';
process.env.STUDENT_API_SECRET='fixture-server-key';
const handler=require('../api/quiz-submit');
const signature=crypto.createHmac('sha256',process.env.SESSION_SECRET).update('ok').digest('hex');
let upstream;
global.fetch=async (url,options)=>{upstream=JSON.parse(options.body);return {ok:true,json:async()=>({ok:true})};};
function response(){return {statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(x){this.data=x;return this;}};}
(async()=>{
 const auth={cookie:'student_session=ok.'+signature};
 let res=response();
 await handler({method:'POST',headers:{},body:{testOnly:true}},res);
 assert.equal(res.statusCode,401);assert.equal(upstream,undefined);
 res=response();
 await handler({method:'POST',headers:auth,body:{setWeek:1,batch:1,answers:['A'],testOnly:true,action:'getAudio',apiSecret:'spoof',testContext:{spreadsheet:'spoof'}}},res);
 assert.equal(res.statusCode,200);
 assert.equal(upstream.action,'submitStudentQuizTest');
 assert.equal(upstream.apiSecret,'fixture-server-key');
 assert.equal(upstream.testContext,undefined);
 res=response();
 await handler({method:'POST',headers:auth,body:{setWeek:1,batch:1,answers:['A'],testOnly:'true'}},res);
 assert.equal(upstream.action,'submitStudentQuiz');
 assert.equal(upstream.testOnly,false);
 console.log('PASS session authentication, isolated action routing and payload whitelist');
})().catch(err=>{console.error(err);process.exitCode=1;});
