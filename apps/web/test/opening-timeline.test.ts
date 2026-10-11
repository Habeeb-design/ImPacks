import test from 'node:test';
import assert from 'node:assert/strict';
import { cardMotion, OPENING_DURATION } from '../src/lib/opening-timeline';

test('cards fit the pouch and fully clear the seam before spreading or spinning', () => {
  assert.ok(156 < 192 - 2 * 12, 'card leaves room for side seams');
  for(let time=0;time<=OPENING_DURATION;time+=10) {
    for(let i=0;i<3;i++) {
      const card=cardMotion(time,i,3);
      if(card.fan>0 || card.angle<1260) {
        assert.equal(card.rise,1);
        assert.ok(340+card.y+260 < 300+29, 'bottom of card clears the seam');
      }
      if(card.angle>180) assert.equal(card.reveal,0,'no artwork flashes during the three full turns');
      assert.ok(Number.isFinite(card.x+card.y+card.angle));
    }
  }
});
test('extraction and final reveal progress continuously, with staggered cards', () => {
  assert.equal(cardMotion(3380,0,3).visible,true);
  assert.equal(cardMotion(3380,1,3).visible,false);
  for(let i=0;i<3;i++) {
    let previous=cardMotion(0,i,3);
    for(let time=10;time<=OPENING_DURATION;time+=10) {
      const current=cardMotion(time,i,3);
      assert.ok(current.rise>=previous.rise && current.reveal>=previous.reveal);
      assert.ok(Math.abs(current.y-previous.y)<5,'no extraction jump');
      previous=current;
    }
    assert.equal(previous.angle,0);assert.equal(previous.reveal,1);
  }
});
test('skip and replay deterministically preserve the final card layout', () => {
  const final=Array.from({length:3},(_,i)=>cardMotion(OPENING_DURATION,i,3));
  for(let t=0;t<OPENING_DURATION;t+=37) cardMotion(t,0,3);
  assert.deepEqual(Array.from({length:3},(_,i)=>cardMotion(OPENING_DURATION,i,3)),final);
  assert.deepEqual(final.map(c=>c.x),[0,-165,165]);
});
