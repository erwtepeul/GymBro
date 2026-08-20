// GymBro logic test harness — lightweight, dependency-free.
// Extracts the pure date/streak/momentum functions straight out of index.html
// and runs them in an isolated scope, so tests exercise the REAL source.
//
//   node test.mjs
//
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = (src.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
if (!script) { console.error('Could not find <script> in index.html'); process.exit(1); }

// Pull a `function NAME(...){ ... }` block out by brace-matching.
function extract(name) {
  const sig = 'function ' + name + '(';
  const start = script.indexOf(sig);
  if (start === -1) throw new Error('Function not found in index.html: ' + name);
  let i = script.indexOf('{', start), depth = 0;
  for (; i < script.length; i++) {
    const c = script[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return script.slice(start, i);
}

const NAMES = ['todayKey','mondayOf','vol','e1rm','workoutsInWeek','weekVolume','weekAllAway',
  'weeklyStreak','currentShakeStreak','volWin','momoLevel','computeMomentum'];

// Assemble the functions into one scope that shares mutable app state.
const factory = new Function(`
  let exercises={}, weights={}, shakes={}, away={}, weeklyGoal=3, weeklyKg=0;
  ${NAMES.map(extract).join('\n')}
  return {
    set:(o={})=>{ if(o.exercises)exercises=o.exercises; if(o.weights)weights=o.weights;
      if(o.shakes)shakes=o.shakes; if(o.away)away=o.away; if('weeklyGoal'in o)weeklyGoal=o.weeklyGoal; if('weeklyKg'in o)weeklyKg=o.weeklyKg; },
    reset:()=>{ exercises={}; weights={}; shakes={}; away={}; weeklyGoal=3; weeklyKg=0; },
    fns:{ ${NAMES.join(', ')} }
  };
`);
const M = factory();
const F = M.fns;

// ---- tiny assert framework ----
let pass = 0, fail = 0;
const approx = (a,b,eps=0.01)=>Math.abs(a-b)<=eps;
function test(name, fn){ try { fn(); console.log('  \x1b[32m✓\x1b[0m ' + name); pass++; }
  catch(e){ console.log('  \x1b[31m✗\x1b[0m ' + name + '\n      ' + e.message); fail++; } }
function eq(a,b,msg){ if(a!==b) throw new Error((msg||'')+' expected '+JSON.stringify(b)+', got '+JSON.stringify(a)); }
function ok(c,msg){ if(!c) throw new Error(msg||'expected truthy'); }

// Helpers to build data relative to "this week" so tests are date-independent.
const K = F.todayKey;
const monday = F.mondayOf();
const dayInWeek = (weeksAgo,offset)=>{ const d=new Date(monday); d.setDate(monday.getDate()-7*weeksAgo+offset); return K(d); };
const dayAgo = n=>{ const d=new Date(); d.setDate(d.getDate()-n); return K(d); };

console.log('\nGymBro logic tests\n');

// ---- date helpers ----
test('todayKey formats YYYY-MM-DD, zero-padded, local', ()=>{
  eq(F.todayKey(new Date(2026,0,5)), '2026-01-05');
  eq(F.todayKey(new Date(2026,10,30)), '2026-11-30');
});
test('mondayOf returns the Monday of that week', ()=>{
  // 2026-07-29 is a Wednesday -> Monday is 2026-07-27
  const m = F.mondayOf(new Date(2026,6,29));
  eq(m.getDay(), 1, 'is a Monday');
  eq(F.todayKey(m), '2026-07-27');
});
test('mondayOf on a Sunday goes back to the prior Monday', ()=>{
  const m = F.mondayOf(new Date(2026,7,2)); // Sun 2026-08-02
  eq(F.todayKey(m), '2026-07-27');
});

// ---- volume / 1RM ----
test('vol = weight × reps × sets', ()=>{
  eq(F.vol({weight:100,reps:5,sets:3}), 1500);
  eq(F.vol({weight:60,reps:10,sets:1}), 600);
});
test('vol treats missing weight as 0, missing reps/sets as 1', ()=>{
  eq(F.vol({}), 0);
  eq(F.vol({weight:50}), 50);
});
test('e1rm uses Brzycki w×36/(37−reps), exact at 1 rep, capped at 12 reps', ()=>{
  eq(F.e1rm({weight:100,reps:1}), 100);                       // exact bodyweight at 1 rep
  ok(approx(F.e1rm({weight:100,reps:5}), 112.5), '100×5 ≈ 112.5');
  ok(F.e1rm({weight:100,reps:5}) > F.e1rm({weight:100,reps:1}), 'more reps → higher e1rm');
  eq(F.e1rm({weight:100,reps:20}), F.e1rm({weight:100,reps:12}), 'reps capped at 12 (no runaway)');
  eq(F.e1rm({weight:null}), null);
});

// ---- weekly aggregates ----
test('workoutsInWeek counts distinct training days in the week', ()=>{
  M.reset();
  M.set({ exercises:{ [dayInWeek(0,0)]:[{name:'a',weight:1}], [dayInWeek(0,2)]:[{name:'b',weight:1}] } });
  eq(F.workoutsInWeek(F.mondayOf()), 2);
});
test('weekVolume sums volume across the week', ()=>{
  M.reset();
  M.set({ exercises:{ [dayInWeek(0,0)]:[{name:'a',weight:100,reps:5,sets:2}], // 1000
                      [dayInWeek(0,3)]:[{name:'b',weight:50,reps:10,sets:1}] } }); // 500
  eq(F.weekVolume(F.mondayOf()), 1500);
});

// ---- streaks ----
test('weeklyStreak counts consecutive weeks meeting the goal', ()=>{
  M.reset();
  const ex={};
  // current + previous 2 weeks each hit goal of 2
  for (let w=0; w<3; w++){ ex[dayInWeek(w,0)]=[{name:'a',weight:1}]; ex[dayInWeek(w,2)]=[{name:'b',weight:1}]; }
  M.set({ exercises:ex, weeklyGoal:2 });
  eq(F.weeklyStreak(), 3);
});
test('weeklyStreak stops at a missed week', ()=>{
  M.reset();
  const ex={};
  ex[dayInWeek(0,0)]=[{name:'a',weight:1}]; ex[dayInWeek(0,2)]=[{name:'b',weight:1}]; // this week: 2
  // last week: only 1 workout -> misses goal of 2
  ex[dayInWeek(1,0)]=[{name:'c',weight:1}];
  // two weeks ago: 2 (but streak already broken)
  ex[dayInWeek(2,0)]=[{name:'d',weight:1}]; ex[dayInWeek(2,3)]=[{name:'e',weight:1}];
  M.set({ exercises:ex, weeklyGoal:2 });
  eq(F.weeklyStreak(), 1);
});
test('currentShakeStreak counts back from today', ()=>{
  M.reset();
  M.set({ shakes:{ [dayAgo(0)]:true, [dayAgo(1)]:true, [dayAgo(2)]:true } });
  eq(F.currentShakeStreak(), 3);
});
test('currentShakeStreak counts from yesterday if today not logged', ()=>{
  M.reset();
  M.set({ shakes:{ [dayAgo(1)]:true, [dayAgo(2)]:true } });
  eq(F.currentShakeStreak(), 2);
});
test('currentShakeStreak is 0 with a gap', ()=>{
  M.reset();
  M.set({ shakes:{ [dayAgo(3)]:true, [dayAgo(4)]:true } });
  eq(F.currentShakeStreak(), 0);
});
test('away days bridge the shake streak (do not break, do not count)', ()=>{
  M.reset();
  // shake today & yesterday, 2 days ago away, then shakes before that
  M.set({ shakes:{ [dayAgo(0)]:true, [dayAgo(1)]:true, [dayAgo(3)]:true, [dayAgo(4)]:true },
          away:{ [dayAgo(2)]:true } });
  eq(F.currentShakeStreak(), 4); // 4 shakes counted, the away gap bridged
});
test('a missing non-away day still breaks the shake streak', ()=>{
  M.reset();
  M.set({ shakes:{ [dayAgo(0)]:true, [dayAgo(1)]:true, [dayAgo(3)]:true } }); // day 2 missing, not away
  eq(F.currentShakeStreak(), 2);
});

// ---- momentum ----
test('momoLevel thresholds map to the right tier', ()=>{
  eq(F.momoLevel(0)[1], 'Rookie');
  eq(F.momoLevel(19)[1], 'Rookie');
  eq(F.momoLevel(20)[1], 'Grinder');
  eq(F.momoLevel(40)[1], 'Contender');
  eq(F.momoLevel(60)[1], 'Savage');
  eq(F.momoLevel(80)[1], 'Beast');
  eq(F.momoLevel(100)[1], 'Beast');
});
test('computeMomentum stays within 0..100', ()=>{
  M.reset();
  const r = F.computeMomentum();
  ok(r.score>=0 && r.score<=100, 'score in range, got '+r.score);
});
test('empty history scores low, strong history scores high', ()=>{
  M.reset();
  const low = F.computeMomentum().score;
  // Build 6 weeks of goal-hitting, growing volume, plus a shake streak.
  const ex={}, sh={};
  for (let w=0; w<6; w++){
    const load = 100 + (5-w)*20; // more recent weeks = heavier
    ex[dayInWeek(w,0)]=[{name:'a',weight:load,reps:5,sets:3}];
    ex[dayInWeek(w,2)]=[{name:'b',weight:load,reps:5,sets:3}];
    ex[dayInWeek(w,4)]=[{name:'c',weight:load,reps:5,sets:3}];
  }
  for (let i=0;i<14;i++) sh[dayAgo(i)]=true;
  M.set({ exercises:ex, shakes:sh, weeklyGoal:3 });
  const high = F.computeMomentum().score;
  ok(high>low, 'strong ('+high+') should beat empty ('+low+')');
  ok(high>=60, 'strong history should reach Savage+, got '+high);
});

// ---- summary ----
console.log('\n' + (fail? '\x1b[31m':'\x1b[32m') + pass+' passed, '+fail+' failed\x1b[0m\n');
process.exit(fail ? 1 : 0);
