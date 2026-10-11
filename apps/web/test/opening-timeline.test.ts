import test from 'node:test';
import assert from 'node:assert/strict';
import { cardMotion, openingTiming, revealLayout } from '../src/lib/opening-timeline';

for (const count of [1, 2, 3, 6, 12, 40]) {
  test(`${count} cards clear the wrapper before growing, arranging or spinning`, () => {
    const timing=openingTiming(count);
    for(let time=0;time<=timing.duration;time+=20) {
      for(let i=0;i<count;i++) {
        const card=cardMotion(time,i,count);
        if(time<timing.fanStart) assert.equal(card.scale,1);
        if(card.fan>0 || card.angle<1260) assert.equal(card.rise,1);
        if(time>=timing.clearAt && time<=timing.fanStart) assert.ok(340+card.y+260<329);
        if(card.angle>180) assert.equal(card.reveal,0,'artwork stays hidden during full turns');
        assert.ok(Number.isFinite(card.x+card.y+card.angle+card.scale));
      }
    }
    assert.ok(timing.duration<11000,'large counts do not create an unbounded wait');
  });
  test(`${count} final cards fit without overlaps on narrow and wide layouts`, () => {
    for(const width of [330,620,1100]) {
      const layout=revealLayout(count,width),end=openingTiming(count).duration;
      const cards=Array.from({length:count},(_,i)=>cardMotion(end,i,count,width));
      for (let i=0;i<count;i++) {
        const card=cards[i]!;
        assert.equal(card.angle,0);assert.equal(card.reveal,1);
        const left=width/2+card.x-layout.cardWidth/2,top=470+card.y-layout.cardHeight/2;
        assert.ok(left>=0 && left+layout.cardWidth<=width+0.01);
        assert.ok(top>=0 && top+layout.cardHeight<=card.contentHeight+0.01);
        for(let j=0;j<i;j++) {
          const other=cards[j]!;
          assert.ok(Math.abs(card.x-other.x)>=layout.cardWidth || Math.abs(card.y-other.y)>=layout.cardHeight,'cards must not overlap');
        }
      }
      assert.deepEqual(cards,Array.from({length:count},(_,i)=>cardMotion(end,i,count,width)),'replay is deterministic');
    }
  });
}
test('small reveals get larger cards; many cards wrap instead of becoming unreadable', () => {
  assert.ok(revealLayout(1,1100).scale>revealLayout(6,1100).scale);
  assert.ok(revealLayout(3,1100).cardWidth>=280);
  assert.ok(revealLayout(40,330).cardWidth>=240);
  assert.ok(revealLayout(40,330).height>700);
});
