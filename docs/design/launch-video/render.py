"""Render the original 10-second ImPacks motion demo. Requires Pillow, numpy, imageio-ffmpeg."""
from pathlib import Path
import math, subprocess, wave, argparse
from functools import lru_cache
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio_ffmpeg

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
W,H,FPS = 1920,1080,60
BG=(255,255,255); INK=(23,23,23); GOLD=(233,160,104)
FONT=str(HERE/'brand-assets/Inter-600.ttf')
REG=str(HERE/'brand-assets/Inter-400.ttf')
@lru_cache(None)
def font(size,bold=True): return ImageFont.truetype(FONT if bold else REG,size)
def ease(v):
 v=max(0,min(1,v)); return 1-(1-v)**4
def smooth(v):
 v=max(0,min(1,v)); return v*v*(3-2*v)
def lerp(a,b,v): return a+(b-a)*v
def text(im,s,x,y,size=60,color=INK,anchor='mm',bold=True):
 ImageDraw.Draw(im).text((round(x),round(y)),s,font=font(size,bold),fill=color,anchor=anchor,stroke_width=0)
def pill(im,box,s,fill=INK,color='white',size=24):
 ImageDraw.Draw(im).rounded_rectangle(tuple(map(round,box)),radius=int((box[3]-box[1])/2),fill=fill)
 text(im,s,(box[0]+box[2])/2,(box[1]+box[3])/2,size,color)
def overlay(im,asset,x,y,scale=1,angle=0,alpha=1):
 if alpha<=0 or scale<=0: return
 a=asset.resize((max(1,int(asset.width*scale)),max(1,int(asset.height*scale))),Image.Resampling.LANCZOS)
 if angle: a=a.rotate(angle,Image.Resampling.BICUBIC,expand=True)
 if alpha<1: a.putalpha(a.getchannel('A').point(lambda v:int(v*max(0,alpha))))
 im.paste(a,(round(x-a.width/2),round(y-a.height/2)),a)
def chrome(im,t,dark=False):
 c=(235,235,230) if dark else INK
 overlay(im,mark_white if dark else mark,171,72,162/mark.width)
 pill(im,(1645,48,1830,94),'CONCEPT DEMO',fill=(36,37,36) if dark else (235,236,231),color=(176,177,170) if dark else (98,101,94),size=17)
 ImageDraw.Draw(im).line((90,1015,1830,1015),fill=(48,49,47) if dark else (216,218,212),width=1)
 ImageDraw.Draw(im).line((90,1015,90+1740*t/10,1015),fill=GOLD,width=3)
 text(im,'YOUR WORLD. YOUR BUDGET. A SURPRISE INSIDE.',90,1041,17,(143,145,139),'lm',False)
 text(im,'IM / 001',1830,1041,17,(143,145,139),'rm',False)

# Exported from production React components and their existing styles.
def asset(name):
 a=Image.open(HERE/'brand-assets'/f'{name}.png').convert('RGBA')
 return a.crop(a.getbbox())
packs=[asset('pack-'+g).resize((484,840),Image.Resampling.LANCZOS) for g in ['crypto','chaos','sports']]
cards=[asset('card-'+str(i)).resize((470,588),Image.Resampling.LANCZOS) for i in range(3)]
hero=asset('hero');mark=asset('wordmark');cta=asset('cta')
mark_white=Image.new('RGBA',mark.size,(247,247,242,0));mark_white.putalpha(mark.getchannel('A'))
cta_white=Image.new('RGBA',cta.size,(0,0,0,0))
# Invert only the CTA's RGB for the dark brand end card, retaining its alpha.
cta_white=Image.fromarray(np.dstack([255-np.array(cta)[:,:,:3],np.array(cta)[:,:,3]]))
shadow=Image.new('RGBA',(800,180));ImageDraw.Draw(shadow).ellipse((80,50,720,130),fill=(0,0,0,48));shadow=shadow.filter(ImageFilter.GaussianBlur(26))

def frame(t):
 dark=3.4<=t<5.0 or t>=7.55
 im=Image.new('RGB',(W,H),(12,13,14) if dark else BG)
 if t<1.5:
  p=ease(t/.65)
  overlay(im,hero,960,530+30*(1-p),1.08+.045*p)
 elif t<3.4:
  u=t-1.5;p=ease(u/.5)
  text(im,'Find your kind of chance.',960,196-35*(1-p),70)
  text(im,'Choose a world you love.',960,274,28,(119,119,119),bold=False)
  select=ease((u-1.35)/.45)
  for i in [0,2,1]:
   x=[490,960,1430][i]; angle=[12,-3,-12][i]
   x=lerp(960,x,p);y=615+120*(1-p)+math.sin(u*2.5+i)*9
   sc=.64 if i!=1 else .71
   if i!=1: x+=(-1 if i==0 else 1)*select*90
   else: sc+=select*.035
   overlay(im,shadow,x,895,.73,alpha=p)
   overlay(im,packs[i],x,y,sc,angle*(1-select*.2),p)
  overlay(im,cta,960,951,.83)
  if select>0:
   r=50*(1-select)+9;ImageDraw.Draw(im).ellipse((1170-r,946-r,1170+r,946+r),outline=GOLD,width=4)
 elif t<5.0:
  u=t-3.4
  text(im,'Open a pack.',960,182,78,(246,246,241))
  p=ease(u/.35); rip=ease((u-.62)/.38); exitp=ease((u-1.12)/.53)
  # A luminous seam precedes a separated foil top, followed by the card extraction.
  sc=.74+.035*math.sin(u*2)
  for i in [0,2,1]:
   q=ease((u-.78-i*.045)/.6)
   overlay(im,cards[i],960+(i-1)*q*345,580-q*115,.25+q*.21,(i-1)*(-8)*q,q)
  body=packs[1].crop((0,84,484,840));top=packs[1].crop((0,0,484,84))
  overlay(im,body,960,606+exitp*450,sc,alpha=1-exitp)
  overlay(im,top,960+300*rip,264-185*rip,sc,-35*rip,1-rip)
  if .35<u<.85:
   glow=Image.new('RGBA',(W,H));gd=ImageDraw.Draw(glow)
   gd.line((794,296,1125,296),fill=(*GOLD,int(240*math.sin((u-.35)/.5*math.pi))),width=9)
   im=Image.alpha_composite(im.convert('RGBA'),glow.filter(ImageFilter.GaussianBlur(9))).convert('RGB')
  for j in range(22):
   v=(u-.65); ang=j*2.399;r=100+v*350
   if v>0:
    x=960+math.cos(ang)*r;y=410+math.sin(ang)*r*.65+v*v*130
    rr=max(1,4-v*3);ImageDraw.Draw(im).ellipse((x-rr,y-rr,x+rr,y+rr),fill=GOLD)
 elif t<7.55:
  u=t-5.0
  text(im,'Reveal your bets.',960,196,84)
  text(im,'Follow what happens next.',960,278,29,(119,119,119),bold=False)
  for i in [0,2,1]:
   p=ease((u-i*.10)/.6);x=lerp(960,[481,960,1439][i],p)
   y=lerp(730,627,p);ang=lerp([12,-5,-12][i],[-5,0,5][i],p)
   overlay(im,shadow,x,920,.78,alpha=p)
   overlay(im,cards[i],x,y,.7+.3*p,ang,p)
  pill(im,(610,937,1310,985),'SIMULATED REVEAL  ·  EXAMPLE MARKETS',fill=(236,236,230),color=(105,108,99),size=19)
 else:
  u=t-7.55
  if u<.65:
   text(im,'Your world.',960,458,118,(247,247,242))
   text(im,'A surprise inside.',960,609,96,GOLD)
  else:
   p=ease((u-.65)/.38)
   overlay(im,mark_white,960,450+45*(1-p),1.32)
   text(im,'Gamble on gambling.',960,622,46,(247,247,242),bold=False)
   overlay(im,cta_white,960,770,1.02)
   text(im,'impacks.vercel.app',960,859,25,(148,151,146),bold=False)
 chrome(im,t,dark)
 return im

def audio():
 sr=48000;n=sr*10;t=np.arange(n)/sr;rng=np.random.default_rng(12);a=np.zeros(n)
 # Original 120 BPM electronic sting: soft sub, short percussion and a pentatonic pluck.
 for beat in np.arange(0,9.6,.5):
  dt=t-beat;env=np.exp(-np.maximum(dt,0)*18)*(dt>=0)*(dt<.4)
  a+=.22*np.sin(2*np.pi*(48*dt+3.5*(1-np.exp(-np.maximum(dt,0)*35))))*env
  for off in [0,.25]:
   ht=t-beat-off;he=np.exp(-np.maximum(ht,0)*100)*(ht>=0)*(ht<.1)
   a+=rng.standard_normal(n)*he*.016
 for j,on in enumerate(np.arange(0,9.6,.25)):
  dt=t-on;freq=[293.66,440,587.33,659.25,880,659.25,587.33,440][j%8]
  env=np.exp(-np.maximum(dt,0)*13)*(dt>=0)*(dt<.7)
  a+=(np.sin(2*np.pi*freq*dt)+.22*np.sin(2*np.pi*freq*2*dt))*.044*env
 for on in [1.5,3.4,5.0,7.55,8.2]:
  dt=t-on;env=np.exp(-np.maximum(dt,0)*10)*(dt>=0)*(dt<.65)
  noise=rng.standard_normal(n);noise=np.convolve(noise,np.ones(14)/14,mode='same')
  a+=noise*env*.21
 # Sparkling upward reveal tones.
 for j in range(3):
  dt=t-(4.4+j*.12);env=np.exp(-np.maximum(dt,0)*6)*(dt>=0)*(dt<1.1)
  a+=.055*np.sin(2*np.pi*[587.33,739.99,880][j]*dt)*env
 a*=np.minimum(1,t/.02)*np.minimum(1,np.maximum(0,(10-t)/.3))
 a=np.tanh(a*1.3)*.83
 stereo=np.stack([a,np.concatenate([np.zeros(150),a[:-150]])*.97],axis=1)
 with wave.open(str(HERE/'soundtrack.wav'),'wb') as f:
  f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((stereo*32767).astype('<i2').tobytes())

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--preview',action='store_true');args=parser.parse_args()
 if args.preview:
  sheet=Image.new('RGB',(1280,1080))
  for j,t in enumerate([.5,1.4,2.2,3.1,4.1,4.8,5.8,7.0,7.8,8.7,9.3,9.98]):
   im=frame(t);im.thumbnail((426,240));sheet.paste(im,((j%3)*426,(j//3)*270));text(sheet,f'{t:.2f}s',(j%3)*426+15,(j//3)*270+251,18,'white','lm')
  sheet.save(HERE/'storyboard.jpg');frame(6.5).save(HERE/'poster.jpg');return
 audio();ff=imageio_ffmpeg.get_ffmpeg_exe()
 cmd=[ff,'-y','-f','rawvideo','-vcodec','rawvideo','-s',f'{W}x{H}','-pix_fmt','rgb24','-r',str(FPS),'-i','-','-i',str(HERE/'soundtrack.wav'),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t','10','-movflags','+faststart',str(HERE/'impacks-demo-10s.mp4')]
 with open(HERE/'render.log','w') as log:
  p=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
  for j in range(FPS*10):
   p.stdin.write(frame(j/FPS).tobytes())
   if j%60==0:print(f'Rendered {j//60}/10 seconds',flush=True)
  p.stdin.close();status=p.wait()
  if status:raise RuntimeError('Encoder failed; inspect render.log')
 print('Finished: impacks-demo-10s.mp4',flush=True)
if __name__=='__main__':main()
