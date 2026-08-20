/* 🔥 fs-calc — 발자국(월·주·일·기록·책) 계산의 클라이언트 포팅 (Firestore P2, 2026-08-20)
   GAS gas/Code.js의 feedRange_/ringsFor_/streak_/getStats/getWeek/getDayFeed/getMemos/bookStats_를 충실 이식.
   순수 함수(파이어베이스 의존 없음) — 골든 테스트가 GAS 결과와 diff=0을 보증. 수정 시 반드시 하네스 재실행.
   ctx = { recs:[{id,code,type,kind,title,start(ms),end(ms),memo}], notes:{date:text}, books:[{key,title,seq,author,status,start,doneDate,rating,review}],
           member:{code,name,practice,goalMin,dday,ddayName,academyDays,academyGoalMin,bookGoal}, subjects:[...], presets:[{name,owner,quota,tQuota}], now:Date } */
(function (root) {
  'use strict';
  var DONE_MARK = '✔완독';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtD(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtHM(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function kindOf(title, names) {
    var k = title.replace(/\s*연습$/, '');
    if (k === '화성학' && names.indexOf('음악이론') >= 0) k = '음악이론';
    return k;
  }
  function make(ctx) {
    var subs = ctx.subjects, names = subs.map(function (s) { return s.name; });
    var m = ctx.member, now = ctx.now || new Date();
    var presets = ctx.presets || [];
    // ── 블록 문서 → 시트 행 등가물(자정 분할, GAS splitAtMidnight_/registerSession과 동일: 분할 행마다 memo·id 동일) ──
    var rows = [];
    (ctx.recs || []).forEach(function (r) {
      var st = Number(r.start), en = Number(r.end);
      if (!(en > st)) return;
      for (var i = 0; i < 5; i++) {
        var d = new Date(st);
        var next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
        var e2 = Math.min(en, next);
        rows.push({ title: r.title || (r.type === 'break' ? '휴식' : r.kind), start: st, end: e2, memo: r.memo || '', id: (r.sid !== undefined && r.sid !== null) ? r.sid : (r.id || '') }); // 표시 id=원본 세션ID(약속은 '') — 문서 id와 분리
        if (en <= next) break;
        st = next;
      }
    });
    function feedRange(startD, endD) {
      var s0 = startD.getTime(), e0 = endD.getTime();
      var days = {};
      rows.forEach(function (r) {
        if (r.start < s0 || r.start >= e0) return;
        var dk = fmtD(new Date(r.start));
        var day = days[dk] || (days[dk] = { totalMin: 0, byKind: {}, segs: [] });
        var title = String(r.title).trim();
        var isBreak = title === '휴식';
        var k = isBreak ? '휴식' : kindOf(title, names);
        var isRoutine = isBreak || title.indexOf('연습') >= 0 || names.indexOf(k) >= 0;
        var min = Math.round((r.end - r.start) / 60000);
        if (isRoutine && !isBreak) { day.totalMin += min; day.byKind[k] = (day.byKind[k] || 0) + min; }
        var seg = { s: fmtHM(r.start), e: fmtHM(r.end), k: k, id: String(r.id || '') };
        if (!isRoutine) { seg.appt = true; seg.k = title; }
        if (isRoutine && !isBreak && String(r.memo || '').trim()) seg.memo = String(r.memo).trim();
        day.segs.push(seg);
      });
      Object.keys(days).forEach(function (dk) { days[dk].segs.sort(function (a, b) { return a.s < b.s ? -1 : a.s > b.s ? 1 : 0; }); });
      return days;
    }
    function notesRange(fromStr, toStr) {
      var out = {};
      Object.keys(ctx.notes || {}).forEach(function (d) { if (d >= fromStr && d <= toStr && String(ctx.notes[d] || '').trim()) out[d] = String(ctx.notes[d]).trim(); });
      return out;
    }
    function goalFor(d) {
      var dow = ['일', '월', '화', '수', '목', '금', '토'][(d || now).getDay()];
      var academy = (m.academyDays || []).indexOf(dow) >= 0;
      return { goalMin: academy && m.academyGoalMin ? m.academyGoalMin : m.goalMin, academy: academy };
    }
    function ringsFor(feed, day) {
      var g = goalFor(day);
      var rings = subs.map(function (s) {
        var goal = s.mode === 'timer' && !s.goalMin ? g.goalMin : s.goalMin;
        var done = feed.byKind[s.name] || 0;
        return { name: s.name, emoji: s.emoji, color: s.color, mode: s.mode, goalMin: goal, doneMin: done,
          pct: goal ? Math.min(100, Math.round(done / goal * 100)) : 0, done: goal > 0 && done >= goal, main: s.mode === 'timer' && s.order === 1 };
      });
      var subsR = rings.filter(function (r) { return !r.main; }), mainR = null;
      for (var i = 0; i < rings.length; i++) if (rings[i].main) { mainR = rings[i]; break; }
      return { rings: rings, academy: g.academy,
        perfect: subsR.length > 0 && subsR.every(function (r) { return r.done; }),
        goalHit: !!(mainR && mainR.done) };
    }
    function streak() {
      var daysPractice = {}, dayMin = {};
      rows.forEach(function (r) {
        var title = String(r.title).trim();
        if (title === '휴식') return;
        var k = kindOf(title, names);
        if (title.indexOf('연습') < 0 && names.indexOf(k) < 0) return;
        var d = fmtD(new Date(r.start));
        var min = Math.round((r.end - r.start) / 60000);
        if (title.indexOf('연습') >= 0) daysPractice[d] = true;
        dayMin[d] = dayMin[d] || {}; dayMin[d][k] = (dayMin[d][k] || 0) + min;
      });
      var streakN = 0;
      for (var i = 0; i < 400; i++) {
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        var key = fmtD(d);
        if (daysPractice[key]) streakN++;
        else if (i === 0) continue;
        else break;
      }
      var perfect = 0, goalDays = 0;
      var ym = fmtD(now).slice(0, 7);
      var mainSub = subs.find(function (s) { return s.mode === 'timer' && s.order === 1; }) || subs.find(function (s) { return s.mode === 'timer'; });
      var subSubs = subs.filter(function (s) { return s !== mainSub && s.goalMin > 0; });
      Object.keys(dayMin).forEach(function (d) {
        if (d.indexOf(ym) !== 0) return;
        var p = d.split('-'), dd = new Date(+p[0], +p[1] - 1, +p[2]);
        var g = goalFor(dd);
        if (subSubs.length && subSubs.every(function (s) { return (dayMin[d][s.name] || 0) >= s.goalMin; })) perfect++;
        if (mainSub) { var goal = mainSub.goalMin || g.goalMin; if (goal > 0 && (dayMin[d][mainSub.name] || 0) >= goal) goalDays++; }
      });
      return { streak: streakN, perfectDays: perfect, goalDays: goalDays };
    }
    function dayFeed(dayStart) {
      var days = feedRange(dayStart, new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + 1));
      return days[fmtD(dayStart)] || { totalMin: 0, byKind: {}, segs: [] };
    }
    function day(dstr) {
      var mm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(dstr || '').trim());
      if (!mm) return { error: '날짜 형식이 잘못됐어요.' };
      var d = new Date(+mm[1], +mm[2] - 1, +mm[3]);
      var dk = fmtD(d);
      var r = dayFeed(d);
      r.date = dk;
      r.rings = ringsFor(r, d);
      r.note = notesRange(dk, dk)[dk] || '';
      r.target = { code: m.code, name: m.name, practice: m.practice };
      return r;
    }
    function week(dstr) {
      var mm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(dstr || '').trim());
      if (!mm) return { error: '날짜 형식이 잘못됐어요.' };
      var base = new Date(+mm[1], +mm[2] - 1, +mm[3]);
      var mon = new Date(base.getFullYear(), base.getMonth(), base.getDate() - ((base.getDay() + 6) % 7));
      var end = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7);
      var startKey = fmtD(mon), endKey = fmtD(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6));
      var out = { start: startKey, end: endKey, target: { code: m.code, name: m.name, practice: m.practice }, days: [], sum: { bassMin: 0, perfectDays: 0, goalDays: 0, byKind: {} } };
      if (!m.practice) return out;
      var feeds = feedRange(mon, end);
      var notes = notesRange(startKey, endKey);
      var todayKey = fmtD(now);
      for (var i = 0; i < 7; i++) {
        var d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
        var dk = fmtD(d);
        var feed = feeds[dk] || { totalMin: 0, byKind: {}, segs: [] };
        var rg = ringsFor(feed, d);
        var mainR = rg.rings.find(function (r) { return r.main; });
        var bass = mainR ? mainR.doneMin : 0;
        out.days.push({ date: dk, dow: d.getDay(), segs: feed.segs, totalMin: feed.totalMin, byKind: feed.byKind,
          bassMin: bass, perfect: rg.perfect, goalHit: rg.goalHit, academy: rg.academy, note: notes[dk] || '', future: dk > todayKey });
        out.sum.bassMin += bass;
        if (rg.perfect) out.sum.perfectDays++;
        if (rg.goalHit) out.sum.goalDays++;
        Object.keys(feed.byKind).forEach(function (k) { out.sum.byKind[k] = (out.sum.byKind[k] || 0) + feed.byKind[k]; });
      }
      return out;
    }
    function stats(off) {
      var offset = Number(off) || 0;
      var mStart = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      var mEnd = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
      var daysInMonth = new Date(mStart.getFullYear(), mStart.getMonth() + 1, 0).getDate();
      var isBreakT = function (x) { return String(x).trim() === '휴식'; };
      var isRoutine = function (title) { title = String(title).trim(); return isBreakT(title) || title.indexOf('연습') >= 0 || (m.practice && names.indexOf(kindOf(title, names)) >= 0); };
      var allRows = rows;
      var mRows = allRows.filter(function (r) { return r.start >= mStart.getTime() && r.start < mEnd.getTime(); });
      var barMap = {};
      mRows.filter(function (r) { return !isRoutine(r.title); }).forEach(function (r) { var k = String(r.title).trim(); barMap[k] = (barMap[k] || 0) + 1; });
      var monthCount = Object.keys(barMap).reduce(function (a, k) { return a + barMap[k]; }, 0);
      var quotaForMonth = function (cell) { var s = String(cell || '').trim(); return s === '매일' ? daysInMonth : (Number(s) || 0); };
      var days, month, subjects, weeks8, mainName;
      var mainSub = subs.find(function (s) { return s.mode === 'timer' && s.order === 1; }) || subs.find(function (s) { return s.mode === 'timer'; });
      if (m.practice) {
        mainName = mainSub ? mainSub.name : '';
        var feeds = feedRange(mStart, mEnd);
        var mNotes = notesRange(fmtD(mStart), fmtD(new Date(mEnd.getTime() - 1)));
        var todayKey = fmtD(now);
        days = []; month = { bassMin: 0, totalMin: 0, perfectDays: 0, goalDays: 0, activeDays: 0, byKind: {}, elapsed: 0 };
        for (var d2 = 1; d2 <= daysInMonth; d2++) {
          var d = new Date(mStart.getFullYear(), mStart.getMonth(), d2);
          var dk = fmtD(d);
          var feed = feeds[dk] || { totalMin: 0, byKind: {}, segs: [] };
          var rg = ringsFor(feed, d);
          var mainR = rg.rings.find(function (r) { return r.main; });
          var bass = mainR ? mainR.doneMin : 0;
          days.push({ bass: bass, total: feed.totalMin, perfect: rg.perfect, goal: rg.goalHit, future: dk > todayKey, memo: !!(mNotes[dk] || feed.segs.some(function (sg) { return sg.memo; })) });
          if (dk <= todayKey) month.elapsed++;
          month.bassMin += bass; month.totalMin += feed.totalMin;
          if (rg.perfect) month.perfectDays++;
          if (rg.goalHit) month.goalDays++;
          if (feed.totalMin > 0) month.activeDays++;
          Object.keys(feed.byKind).forEach(function (k) { month.byKind[k] = (month.byKind[k] || 0) + feed.byKind[k]; });
        }
        subjects = subs.map(function (s) {
          var lessonRow = s.lesson ? presets.find(function (p) { return p.name === s.lesson; }) : null;
          return { name: s.name, color: s.color, emoji: s.emoji, lesson: s.lesson, mode: s.mode, goalMin: s.goalMin,
            quota: lessonRow ? quotaForMonth(lessonRow.quota) : 0, lessonCount: s.lesson ? (barMap[s.lesson] || 0) : 0,
            min: month.byKind[s.name] || 0 };
        });
        subs.forEach(function (s) { if (s.lesson) delete barMap[s.lesson]; });
        var wk = {};
        if (mainSub) allRows.forEach(function (r) {
          if (isBreakT(r.title) || kindOf(String(r.title).trim(), names) !== mainSub.name) return;
          var x = new Date(r.start); x = new Date(x.getFullYear(), x.getMonth(), x.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
          var key = fmtD(x);
          wk[key] = (wk[key] || 0) + Math.round((r.end - r.start) / 60000);
        });
        weeks8 = [];
        var thisMon = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        thisMon.setDate(thisMon.getDate() - ((thisMon.getDay() + 6) % 7));
        for (var i = 7; i >= 0; i--) {
          var ws = new Date(thisMon.getFullYear(), thisMon.getMonth(), thisMon.getDate() - i * 7);
          weeks8.push({ label: (ws.getMonth() + 1) + '/' + ws.getDate(), min: wk[fmtD(ws)] || 0 });
        }
      }
      var events = [];
      var subjectLessons = subs.map(function (s) { return s.lesson; }).filter(Boolean);
      presets.forEach(function (p) {
        var owners = String(p.owner || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
        if (owners.indexOf(m.code) < 0) return;
        var name = String(p.name).trim();
        if (subjectLessons.indexOf(name) >= 0) return;
        var tQuota = Number(p.tQuota) || 0;
        if (tQuota > 0) {
          var used = allRows.filter(function (x) { return String(x.title).trim() === name; }).length;
          events.push({ name: name, count: used, quota: tQuota, total: true });
        } else {
          events.push({ name: name, count: barMap[name] || 0, quota: quotaForMonth(p.quota), total: false });
        }
        delete barMap[name];
      });
      Object.keys(barMap).sort(function (a, b) { return barMap[b] - barMap[a]; }).forEach(function (k) { events.push({ name: k, count: barMap[k], quota: 0, total: false }); });
      return {
        label: mStart.getFullYear() + '년 ' + (mStart.getMonth() + 1) + '월',
        ym: fmtD(mStart).slice(0, 7), offset: offset,
        target: { code: m.code, name: m.name, practice: m.practice, goalMin: m.goalMin, dday: m.dday, ddayName: m.ddayName },
        monthCount: monthCount, subjects: subjects, mainName: mainName, events: events, days: days, month: month, weeks8: weeks8,
      };
    }
    function memos(k, before, n) {
      k = String(k || 'all').trim(); n = Math.max(5, Math.min(90, Number(n) || 30));
      var bf = /^\d{4}-\d{2}-\d{2}$/.test(String(before || '')) ? String(before) : '9999-12-31';
      var byDate = {};
      var push = function (dk, item) { (byDate[dk] = byDate[dk] || []).push(item); };
      if (k !== 'note') rows.forEach(function (r) {
        var title = String(r.title).trim(); if (title === '휴식') return;
        var kind = kindOf(title, names);
        if (names.indexOf(kind) < 0) return;
        var memo = String(r.memo || '').trim();
        if (k === '독서') { if (kind !== '독서') return; }
        else if (k !== 'all') { if (kind !== k || !memo) return; }
        else if (!memo) return;
        var dk = fmtD(new Date(r.start));
        if (dk >= bf) return;
        push(dk, { date: dk, k: kind, s: fmtHM(r.start), e: fmtHM(r.end), min: Math.round((r.end - r.start) / 60000), memo: memo, id: String(r.id || '') });
      });
      if (k === 'all' || k === 'note') {
        var notes = notesRange('0000-01-01', bf < '9999' ? bf : '9999-12-31');
        Object.keys(notes).forEach(function (dk) { if (dk < bf) push(dk, { date: dk, k: 'note', memo: notes[dk] }); });
      }
      var dates = Object.keys(byDate).sort().reverse();
      var take = dates.slice(0, n);
      var items = [];
      take.forEach(function (dk) { byDate[dk].sort(function (a, b) { return (a.s || '99:99') < (b.s || '99:99') ? -1 : 1; }).forEach(function (it) { items.push(it); }); });
      var out = { k: k, target: { code: m.code, name: m.name, practice: m.practice }, items: items, more: dates.length > n, next: take.length ? take[take.length - 1] : '' };
      if (k === '독서') out.book = bookStats(false);
      return out;
    }
    function parseBookM(memo) {
      memo = String(memo || '').trim();
      var done = memo.indexOf(DONE_MARK) >= 0;
      memo = memo.replace(DONE_MARK, '').trim().replace(/\s*｜\s*$/, '');
      var mm = /^《(.+?)》\s*(?:｜\s*(.*))?$/.exec(memo);
      return { title: mm ? mm[1].trim() : '', line: mm ? (mm[2] || '').trim() : memo, done: done };
    }
    function bookStats(withItems) {
      var ym = fmtD(now).slice(0, 7), yy = ym.slice(0, 4);
      var meta = (ctx.books || []).filter(function (b) { return b.title; }).map(function (b) { return { code: m.code, key: b.key, title: b.title, seq: b.seq, author: b.author, status: b.status, start: b.start, doneDate: b.doneDate, rating: b.rating, review: b.review, days: {}, min: 0, first: '', last: '', items: [] }; });
      var byTitle = {};
      meta.forEach(function (b) { (byTitle[b.title] = byTitle[b.title] || []).push(b); });
      Object.keys(byTitle).forEach(function (t) { byTitle[t].sort(function (a, b) { return a.seq - b.seq; }); });
      var monthMin = 0; var untitled = [];
      rows.forEach(function (r) {
        if (String(r.title).trim() !== '독서') return;
        var dk = fmtD(new Date(r.start));
        var min = Math.round((r.end - r.start) / 60000);
        if (dk.indexOf(ym) === 0) monthMin += min;
        var pb = parseBookM(r.memo);
        var item = { date: dk, s: fmtHM(r.start), min: min, memo: pb.line, id: String(r.id || '') };
        if (!pb.title) { untitled.push({ date: dk, s: item.s, min: min, memo: pb.line, id: item.id }); return; }
        var list = byTitle[pb.title];
        if (!list) { var ghost = { code: m.code, key: pb.title + '#1', title: pb.title, seq: 1, author: '', status: '읽는중', start: dk, doneDate: '', rating: 0, review: '', days: {}, min: 0, first: '', last: '', items: [], ghost: true }; list = byTitle[pb.title] = [ghost]; meta.push(ghost); }
        var b = null;
        for (var i = 0; i < list.length; i++) { var x = list[i]; if ((!x.start || dk >= x.start) && (!x.doneDate || dk <= x.doneDate)) b = x; }
        if (!b) { for (var j = list.length - 1; j >= 0; j--) { if (!list[j].start || list[j].start <= dk) { b = list[j]; break; } } }
        if (!b) b = list[0];
        b.days[dk] = 1; b.min += min;
        if (!b.first || dk < b.first) b.first = dk;
        if (!b.last || dk > b.last) b.last = dk;
        if (withItems) b.items.push(item);
      });
      var rank = { '읽는중': 0, '보류': 1, '완독': 2 };
      var list2 = meta.map(function (b) {
        var o = { key: b.key, title: b.title, seq: b.seq, author: b.author, status: b.status, start: b.start || b.first, doneDate: b.doneDate, rating: b.rating, review: b.review,
          days: Object.keys(b.days).length, min: b.min, first: b.first, last: b.last, done: b.status === '완독' };
        if (withItems) o.items = b.items.sort(function (x, y) { return x.date < y.date ? 1 : x.date > y.date ? -1 : (x.s < y.s ? 1 : -1); });
        return o;
      }).sort(function (a, b) {
        if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
        var ka = a.status === '완독' ? a.doneDate : (a.last || a.start), kb = b.status === '완독' ? b.doneDate : (b.last || b.start);
        return ka < kb ? 1 : -1;
      });
      var wg = m.bookGoal || 0;
      var monKey = function (d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); return fmtD(x); };
      var thisMon = monKey(now);
      var doneByWeek = {};
      list2.forEach(function (b) { if (b.done && /^\d{4}-\d{2}-\d{2}$/.test(String(b.doneDate))) { var p = String(b.doneDate).split('-'); var kk = monKey(new Date(+p[0], +p[1] - 1, +p[2])); doneByWeek[kk] = (doneByWeek[kk] || 0) + 1; } });
      var weekDone = doneByWeek[thisMon] || 0;
      var y0 = new Date(now.getFullYear(), 0, 1), weeksElapsed = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y0.getFullYear(), y0.getMonth(), y0.getDate() - ((y0.getDay() + 6) % 7))) / 604800000) + 1;
      var weekStreak = 0;
      if (wg > 0) { var cur = new Date(now.getFullYear(), now.getMonth(), now.getDate()); if ((doneByWeek[thisMon] || 0) < wg) cur.setDate(cur.getDate() - 7);
        for (var i2 = 0; i2 < 200; i2++) { var kk2 = monKey(cur); if ((doneByWeek[kk2] || 0) >= wg) { weekStreak++; cur.setDate(cur.getDate() - 7); } else break; } }
      var recentWeeks = []; for (var i3 = 7; i3 >= 0; i3--) { var dr = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * i3); var kr = monKey(dr); recentWeeks.push({ mon: kr, done: doneByWeek[kr] || 0 }); }
      return { books: list2, yearDone: list2.filter(function (b) { return b.done && String(b.doneDate).indexOf(yy) === 0; }).length,
        monthDone: list2.filter(function (b) { return b.done && String(b.doneDate).indexOf(ym) === 0; }).length, monthMin: monthMin, goal: wg * 52,
        weekGoal: wg, weekDone: weekDone, weeksElapsed: weeksElapsed, pace: weeksElapsed * wg, weekStreak: weekStreak, recentWeeks: recentWeeks,
        untitled: untitled.sort(function (a, b) { return a.date < b.date ? 1 : -1; }) };
    }
    function books() {
      var out = bookStats(false);
      out.target = { code: m.code, name: m.name, practice: m.practice };
      return out;
    }
    function book(key, title) {
      var st = bookStats(true);
      key = String(key || '').trim(); title = String(title || '').trim();
      if (key === '_none') return { book: { key: '_none', title: '제목 없는 독서', status: '', items: st.untitled }, target: { code: m.code, name: m.name, practice: m.practice } };
      var b = null;
      if (key) b = st.books.find(function (x) { return x.key === key; });
      if (!b && title) { var l = st.books.filter(function (x) { return x.title === title; }); b = l.length ? l[0] : null; }
      if (!b) return { error: '책을 찾을 수 없어요.' };
      return { book: b, target: { code: m.code, name: m.name, practice: m.practice } };
    }
    return { stats: stats, week: week, day: day, memos: memos, books: books, book: book, streak: streak, dayFeed: dayFeed, ringsFor: ringsFor };
  }
  root.FSCALC = { make: make };
})(typeof self !== 'undefined' ? self : this);
