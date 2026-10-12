// Imports production components into an isolated asset-export page; never mounts an app route.
import { build } from 'esbuild';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url), here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const web=path.join(root,'apps/web/src');
const dashboard=readFileSync(path.join(web,'components/Dashboard.tsx'),'utf8');
const face=dashboard.slice(dashboard.indexOf('function CardFace('),dashboard.indexOf('\nexport function Dashboard'));
const header=readFileSync(path.join(web,'components/SiteHeader.tsx'),'utf8');
const mark=header.match(/<Link className="logo"[^>]*>(.*?)<\/Link>/s)[1];
const entry=`import React from 'react';import {renderToStaticMarkup as render} from 'react-dom/server';
import {PackArtwork} from '${web}/components/PackArtwork';
import {LandingHero} from '${web}/components/LandingHero';
import {CardSpread} from '${web}/components/CardSpread';
import {cardStatus,statusLabels} from '${web}/lib/collection';
${face}
const cards=[
 {question:'Will Bitcoin finish the month above $100,000?',side:'YES',order:{status:'filled',quantity:9,spentCents:495}},
 {question:'Will the home team win the championship?',side:'NO',order:{status:'filled',quantity:12,spentCents:480}},
 {question:'Will Ethereum outperform Bitcoin this week?',side:'YES',order:{status:'filled',quantity:12,spentCents:480}}
];
export const assets=[
...['Crypto','Sports','Chaos'].map(genre=>({name:'pack-'+genre.toLowerCase(),w:600,h:900,html:render(<div style={{position:'absolute',left:0,top:0,transform:'scale(2.5)',transformOrigin:'0 0'}}><PackArtwork genre={genre}/></div>)})),
...cards.map((card,i)=>({name:'card-'+i,w:600,h:760,html:render(<div style={{position:'absolute',left:20,top:20,width:280,transform:'scale(2)',transformOrigin:'0 0'}}><CardFace card={card} genre={['Crypto','Sports','Chaos'][i]} index={i}/></div>)})),
{name:'hero',w:1440,h:900,html:render(<main><LandingHero/></main>)},
{name:'fan',w:1280,h:800,html:render(<div className='category-mixed' style={{position:'absolute',width:620,transform:'scale(2)',transformOrigin:'0 0'}}><CardSpread count={3} genre='Chaos'/></div>)},
{name:'wordmark',w:900,h:240,html:render(<div style={{position:'absolute',top:25,left:25,transform:'scale(5)',transformOrigin:'0 0'}}><a className='logo'>${mark}</a></div>)},
{name:'cta',w:650,h:190,html:render(<div style={{position:'absolute',top:20,left:20,transform:'scale(2.5)',transformOrigin:'0 0'}}><a className='primary open-pack-cta'>Open a pack <span>↗</span></a></div>)}
];`;
await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',outfile:path.join(here,'brand-components.cjs'),plugins:[{name:'css-module',setup(b){b.onLoad({filter:/\.module\.css$/},args=>({contents:'export default '+JSON.stringify(Object.fromEntries([...readFileSync(args.path,'utf8').matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m=>[m[1],m[1]]))),loader:'js'}));}}]});
const {assets}=require(path.join(here,'brand-components.cjs'));
const mime=f=>f.endsWith('.svg')?'image/svg+xml':f.endsWith('.webp')?'image/webp':'image/png';
for(const asset of assets)asset.html=asset.html.replace(/(?:src|href)="(\/images\/[^\"]+)"/g,(match,url)=>match.replace(url,`data:${mime(url)};base64,${readFileSync(path.join(root,'apps/web/public',url)).toString('base64')}`));
let css=readFileSync(path.join(web,'styles.css'),'utf8').replace(/@import[^;]+;/g,'')+'\n'+readFileSync(path.join(web,'components/dashboard.css'),'utf8')+'\n'+readFileSync(path.join(web,'components/PackArtwork.module.css'),'utf8').replace(/:global\(([^)]+)\)/g,'$1');
// Component sprites preserve desktop styles regardless of the SVG export canvas width.
while(css.includes('@media')){const start=css.indexOf('@media');let i=css.indexOf('{',start)+1,depth=1;while(depth&&i<css.length){if(css[i]==='{')depth++;if(css[i]==='}')depth--;i++;}css=css.slice(0,start)+css.slice(i);}
for(const w of [400,500,600,700,800])css+=`@font-face{font-family:Inter;font-weight:${w};src:url(data:font/ttf;base64,${readFileSync(path.join(here,`brand-assets/Inter-${w}.ttf`)).toString('base64')}) format('truetype');}`;
css+='*{animation:none!important;transition:none!important} .foil-pack{transform:none} #asset-root{position:relative;overflow:hidden;background:transparent;font-family:Inter,Arial,sans-serif}';
const html=`<!doctype html><html><head><meta charset='utf-8'><title>ImPacks production component export</title><style>body{font:16px Arial;margin:20px}button{padding:15px}#preview{background:#eee;margin-top:20px;overflow:auto}</style></head><body><h1>ImPacks production component export</h1><p>Local concept-video assets. Illustrative fixture cards; no payment or order requests.</p><button id='export'>Export brand assets</button><p id='status'>Ready</p><div id='preview'></div><script>
const assets=${JSON.stringify(assets)},css=${JSON.stringify(css)};
document.getElementById('export').onclick=async()=>{try{for(const a of assets){
const root=document.createElement('div');root.id='asset-root';root.setAttribute('xmlns','http://www.w3.org/1999/xhtml');root.style.width=a.w+'px';root.style.height=a.h+'px';root.innerHTML='<style>'+css+'</style>'+a.html;
document.getElementById('preview').replaceChildren(root);await document.fonts.ready;
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+a.w+'" height="'+a.h+'"><foreignObject width="100%" height="100%">'+new XMLSerializer().serializeToString(root)+'</foreignObject></svg>';
const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await img.decode();const canvas=document.createElement('canvas');canvas.width=a.w;canvas.height=a.h;canvas.getContext('2d').drawImage(img,0,0);const blob=await new Promise(r=>canvas.toBlob(r));
const res=await fetch('/export/'+a.name,{method:'POST',body:blob});if(!res.ok)throw new Error('Save failed');document.getElementById('status').textContent='Saved '+a.name;
}document.getElementById('status').textContent='Complete: '+assets.length+' brand assets exported';}catch(e){document.getElementById('status').textContent='Error: '+e.message;}};
</script></body></html>`;
writeFileSync(path.join(here,'brand-export.html'),html);console.log('Built production component exporter:',assets.map(a=>a.name).join(', '));
