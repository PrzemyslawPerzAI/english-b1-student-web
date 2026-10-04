'use strict';
const fs=require('node:fs'),vm=require('node:vm');
for(const file of fs.readdirSync('api').filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync('api/'+file,'utf8'),{filename:file});
const html=fs.readFileSync('index.html','utf8');
for(const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(script);
console.log('PASS frontend API and inline UI JavaScript syntax');
