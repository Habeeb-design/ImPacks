import { phase, smooth } from "./opening-timeline";

type Vertex = { x: number; y: number; u: number; v: number; z: number; twist: number };
export async function createFoilRenderer(body: HTMLElement, foil: HTMLCanvasElement, palette: readonly string[]) {
 const context = foil.getContext("2d");
 if (!context) throw new Error("Canvas unavailable");
 const ctx: CanvasRenderingContext2D = context;
 const texture=document.createElement("canvas");texture.width=384;texture.height=676;
 const tx=texture.getContext("2d");
 if (!tx) throw new Error("Canvas unavailable");
 const wrapper=new Image(); wrapper.src="/images/impacks-opening-foil.webp";
 await wrapper.decode();
 tx.drawImage(wrapper,-53.76,-37.18,491.52,750.36);
 const textureReady=true;
 let time=0, foilSheen: CanvasGradient | null=null;
 const edge=(x: number)=>29+Math.sin(x*.045)*.9+Math.sin(x*.018+.4)*.45;
 function texturedTriangle(a: Vertex,b: Vertex,c: Vertex,shade: number,back: boolean){
  ctx.save();ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();ctx.clip();
  if(back){ctx.fillStyle=`rgb(${shade},${shade+2},${shade+4})`;ctx.fillRect(-200,-200,650,650);ctx.fillStyle=foilSheen!;ctx.fillRect(-200,-200,650,650);}
  else{
   const u0=a.u,v0=a.v,u1=b.u,v1=b.v,u2=c.u,v2=c.v;
   const den=u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1);
   const coeff=(k: "x" | "y")=>[(a[k]*(v1-v2)+b[k]*(v2-v0)+c[k]*(v0-v1))/den,(a[k]*(u2-u1)+b[k]*(u0-u2)+c[k]*(u1-u0))/den,(a[k]*(u1*v2-u2*v1)+b[k]*(u2*v0-u0*v2)+c[k]*(u0*v1-u1*v0))/den];
   const X=coeff('x'),Y=coeff('y');ctx.transform(X[0],Y[0],X[1],Y[1],X[2],Y[2]);ctx.drawImage(texture,0,0,192,338);
   ctx.fillStyle=`rgba(255,255,255,${shade/800})`;ctx.fillRect(0,0,192,70);
  }
  ctx.restore();
 }
 function drawInterior(front: number,progress: number){
  if(front<3)return;
  ctx.save();
  const settle=0,depth=(4+progress*3)*smooth(Math.min(1,front/32));
  ctx.globalAlpha=1-smooth(phase(time,4820,5500));
  ctx.translate(-14*settle+96,420*settle+169);ctx.rotate(-6*settle*Math.PI/180);ctx.translate(-96,-169);
  const left=2,right=front-1,top=29-depth;
  // Recessed rear foil wall. The offset far rim and folded side gussets give the pouch thickness.
  const lining=ctx.createLinearGradient(0,top,0,34);
  lining.addColorStop(0,'#474b50');lining.addColorStop(.12,'#d2d5d7');lining.addColorStop(.34,'#777e86');lining.addColorStop(.7,'#242a33');lining.addColorStop(1,'#06090e');
  ctx.beginPath();ctx.moveTo(left,edge(left));ctx.lineTo(left+7,top+4);ctx.quadraticCurveTo((left+right)*.5,top+1,right-3,top+3);ctx.lineTo(right,edge(right));ctx.closePath();ctx.fillStyle=lining;ctx.fill();
  ctx.save();ctx.clip();
  const sweep=front*(.2+.65*smooth(phase(time,1450,3370)));
  const sheen=ctx.createLinearGradient(sweep-65,top,sweep+60,30);
  sheen.addColorStop(0,'#ffffff00');sheen.addColorStop(.2,palette[0]+'15');sheen.addColorStop(.43,palette[0]+'55');sheen.addColorStop(.52,palette[2]+'88');sheen.addColorStop(.6,palette[0]+'55');sheen.addColorStop(1,'#ffffff00');
  ctx.fillStyle=palette[0]+'12';ctx.fillRect(0,top-5,192,depth+12);
  ctx.fillStyle=sheen;ctx.fillRect(0,top-5,192,depth+12);
  // Broad, quiet reflective folds on the back wall.
  ctx.strokeStyle='#edf3ff22';ctx.lineWidth=.6;for(let x=18;x<right;x+=38){ctx.beginPath();ctx.moveTo(x,top+2);ctx.quadraticCurveTo(x-5,top+depth*.5,x+3,29);ctx.stroke();}
  ctx.restore();
  ctx.fillStyle='#1a1d24';ctx.beginPath();ctx.moveTo(left,edge(left));ctx.lineTo(left+7,top+4);ctx.lineTo(left+15,edge(left)-3);ctx.closePath();ctx.fill();
  ctx.fillStyle='#4f5660';ctx.beginPath();ctx.moveTo(right,edge(right));ctx.lineTo(right-3,top+5);ctx.lineTo(right-11,edge(right)-3);ctx.closePath();ctx.fill();
  // Deep shadow below the visible inner back, behind the front lip.
  ctx.fillStyle='#080b12';ctx.beginPath();ctx.moveTo(left+5,edge(left));ctx.quadraticCurveTo(front*.5,27,right-4,edge(right));ctx.lineTo(right-4,edge(right)+1);ctx.lineTo(left+5,edge(left)+1);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#dce3ec';ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(left+7,top+4);ctx.quadraticCurveTo((left+right)*.5,top+1,right-3,top+3);ctx.stroke();
  ctx.restore();
 }
 function drawFoil(progress: number,release: number){
  const front=Math.min(192,progress*192);
  const cut=[];for(let x=0;x<front;x++)cut.push(`${x}px ${edge(x).toFixed(2)}px`);cut.push(`${front}px ${edge(front).toFixed(2)}px`);
  body.style.clipPath=front?`polygon(${cut.join(',')},${front}px 0,192px 0,192px 338px,0 338px)`:'none';
  ctx.setTransform(2,0,0,2,340,240);ctx.clearRect(-170,-120,540,500);
  if(!front||!textureReady)return;
  drawInterior(front,progress);
  if(time>=3900){ctx.globalAlpha=1;return;}
  foilSheen=ctx.createLinearGradient(-80+time*.045,0,30+time*.045,35);
  foilSheen.addColorStop(0,'#ffffff00');foilSheen.addColorStop(.4,palette[0]+'55');foilSheen.addColorStop(.53,'#ffffff99');foilSheen.addColorStop(1,'#ffffff00');
  // The intact foil is held in place. Each released column follows a curved 3D surface.
  const project=(x: number,t: number): Vertex=>{
   const distance=front-x,loose=Math.min(1,distance/72),amount=1-Math.exp(-distance/32);
   const twist=amount*(1.35+progress*.85)+release*1.6;
   const y=edge(x)*t,center=edge(x)*.5;
   const X=x-amount*(12+progress*18)+release*175;
   const Y=center+(y-center)*Math.cos(twist)-amount*(12+progress*31)-release*96;
   const Z=(y-center)*Math.sin(twist)+Math.sin(loose*Math.PI*.65)*(18+progress*30)+release*60;
   const perspective=650/(650-Z);
   return {x:96+(X-96)*perspective,y:43+(Y-43)*perspective,u:x,v:y,z:Z,twist};
  };
  ctx.globalAlpha=1-smooth(phase(time,3680,3900));
  const faces=[];
  for(let x=0;x<front;x+=6){
   const right=Math.min(front,x+6);
   for(let row=0;row<3;row++){
    const a=project(x,row/3),b=project(right,row/3),c=project(right,(row+1)/3),d=project(x,(row+1)/3);
    const back=Math.cos((a.twist+c.twist)/2)<0;
    const light=Math.round(100+85*Math.abs(Math.sin(a.twist+.4))+8*Math.sin(x*.025));
    faces.push({a,b,c,d,back,light,z:(a.z+c.z)*.5});
   }
  }
  faces.sort((a,b)=>a.z-b.z).forEach(({a,b,c,d,back,light})=>{texturedTriangle(a,b,c,light,back);texturedTriangle(a,c,d,light,back);});
  // A thin laminate edge follows the gently curved heat-seal boundary.
  ctx.lineWidth=.7;ctx.strokeStyle='#c8cac6';ctx.beginPath();
  for(let x=0;x<=front;x++){const p=project(x,1);x?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.stroke();
  ctx.globalAlpha=(1-release)*.8;ctx.strokeStyle=palette[0];ctx.shadowColor=palette[0];ctx.shadowBlur=7;
  ctx.beginPath();for(let x=0;x<=front;x++)x?ctx.lineTo(x,edge(x)+1):ctx.moveTo(x,edge(x)+1);ctx.stroke();ctx.shadowBlur=0;
  ctx.globalAlpha=1;
 }

 return (at: number, progress: number, release: number) => { time=at; drawFoil(progress,release); };
}
