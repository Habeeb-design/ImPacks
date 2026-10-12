import test from "node:test";
import assert from "node:assert/strict";
import { resolveCardVisual as resolve } from "../src/lib/resolve-card-visual";
test('sport language resolves to subject-specific artwork',()=>{
 for(const [question,icon] of [['Premier League winner?','soccer'],['Football final?','soccer'],['NFL overtime?','football'],['NBA overtime?','basketball'],['WNBA winner?','basketball'],['MLB home run?','baseball'],['NHL Stanley Cup?','hockey'],['Wimbledon tennis?','tennis'],['Overtime tonight?','sports'],['NBA versus NFL ratings?','sports']])assert.equal(resolve({question},'sports').icon,icon);
});
test('confident crypto/company matches use local logos',()=>{
 for(const [question,file] of [['Bitcoin price?','btc.svg'],['Ethereum price?','eth.svg'],['Solana price?','sol.svg'],['Nvidia earnings?','nvidia.svg']])assert.equal(resolve({question}).src,`/images/brands/${file}`);
 assert.equal(resolve({question:'Bitcoin versus Ethereum?'}).src,null);
 assert.equal(resolve({question:'UnknownCo stock price?'}).icon,'business');
});
test('category fallbacks and ambiguous wording never invent a subject',()=>{
 for(const [category,icon] of [['sports','sports'],['crypto','crypto'],['politics','politics'],['economics','business'],['weather','weather'],['tech','technology'],['culture','culture'],['unsupported','news']])assert.equal(resolve({},category).icon,icon);
 assert.equal(resolve({question:'Will the president win the election?'}).icon,'politics');
 assert.equal(resolve({question:'Will overtime pay increase?'},'business').src,null);
 assert.deepEqual(resolve({question:'NBA winner?'}),resolve({question:'NBA winner?'}));
});
