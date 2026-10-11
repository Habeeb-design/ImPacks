import { createFoilRenderer } from "./opening-foil";
import { beat, cardMotion, phase } from "./opening-timeline";

export async function createOpeningMotion(root: HTMLElement, palette: readonly string[]) {
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const pack = q('.op-pack'), body = q('.op-pack-body');
  const drawFoil = await createFoilRenderer(body, q<HTMLCanvasElement>('.op-foil-mesh'), palette);
  const cards = Array.from(root.querySelectorAll<HTMLElement>('.op-card-lift'));
  const particles = Array.from(root.querySelectorAll<HTMLElement>('.op-particle'));
  return (time: number) => {
    const tension = beat(time,0,1450), rip1 = beat(time,1250,2250), rip2 = beat(time,1920,2990), snap = beat(time,2670,3380);
    const shake = beat(time,100,500)*(1-beat(time,1020,1450));
    const wiggle = Math.sin(time*.042)*2.7*shake+Math.sin(time*.0032)*.12*tension*(1-beat(time,2780,3380));
    pack.style.transform = `translateX(${Math.sin(time*.048)*4*shake}px) translateY(${-5*tension+3*rip1-3*rip2}px) rotateZ(${-2*tension+wiggle}deg) rotateY(${tension*11}deg) rotateX(${-7*rip1-5*rip2}deg) scale(${1+.025*tension})`;
    drawFoil(time,.22*rip1+.43*rip2+.35*snap,beat(time,3380,3900));
    body.style.opacity = String(1-beat(time,4820,5500));
    q('.op-floor').style.opacity = body.style.opacity;
    const rise = beat(time,3380,4700), bloom = beat(time,3040,4090), tail = beat(time,7300,8400);
    const aura = q('.op-aura'), rays = q('.op-rays');
    aura.style.opacity = String(.10*rip1+.14*rip2+.70*bloom-.46*tail);
    aura.style.transform = `translateY(${-300*rise}px) scale(${.6+.5*bloom-.15*tail})`;
    rays.style.opacity = String(.32*bloom-.18*tail);
    rays.style.transform = `translateY(${-300*rise}px) rotate(${15*bloom+16*tail}deg) scale(${.7+.45*bloom})`;
    q('.op-particles').style.transform = `translateY(${-300*rise}px)`;
    const sparks = phase(time,3400,4800), ease = 1-Math.pow(1-sparks,3);
    particles.forEach((el,i) => {
      const angle=i*2.39996, distance=90+(i%5)*25;
      el.style.opacity=String(Math.sin(Math.PI*sparks)*.55);
      el.style.transform=`translate(${Math.cos(angle)*distance*ease}px,${Math.sin(angle)*distance*ease+35*sparks*sparks}px) rotate(${i*31+120*sparks}deg) scale(${1-sparks*.5})`;
    });
    cards.forEach((el,index) => {
      const m=cardMotion(time,index,cards.length);
      el.style.opacity=m.visible?'1':'0'; el.style.zIndex=String(4-index);
      el.style.transform=`translateX(${m.x}px) translateY(${m.y}px) rotateX(${-12*(1-m.rise)}deg) rotateY(${11*(1-m.rise)}deg)`;
      el.querySelector<HTMLElement>('.op-card-turn')!.style.transform=`rotateY(${m.angle}deg)`;
      el.querySelector<HTMLElement>('.op-card-veil')!.style.opacity=String(1-m.reveal);
      el.style.setProperty('--op-shimmer-x',m.shimmer+'%');
    });
  };
}
