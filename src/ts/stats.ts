import { Step } from './types';
import { addDays, dateKey, parseKey, todayKey } from './dates';
import { KINDS, KindKey, TITLES } from './data';
import { RankState, rankOf } from './wakuwaku';

export function daysBetween(from: string, to: string): number {
  return Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86_400_000);
}

/** 前進した日（1件以上記録した日）の集合 */
export function activeDays(steps: Step[]): Set<string> {
  return new Set(steps.map((s) => s.date));
}

/** 今日（まだなら昨日）から何日続けて前進しているか */
export function dayStreak(steps: Step[], today = todayKey()): number {
  const days = activeDays(steps);
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n += 1;
    d = addDays(d, -1);
  }
  return n;
}

/** これまでで一番長く続いた日数 */
export function bestStreak(steps: Step[]): number {
  const days = Array.from(activeDays(steps)).sort();
  let best = 0;
  let cur = 0;
  let prev = '';
  days.forEach((d) => {
    cur = prev && addDays(prev, 1) === d ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  });
  return best;
}

export function countOn(steps: Step[], date: string): number {
  return steps.filter((s) => s.date === date).length;
}

export function stepsOn(steps: Step[], date: string): Step[] {
  return steps.filter((s) => s.date === date);
}

export function monthSteps(steps: Step[], ym: string): Step[] {
  return steps.filter((s) => s.date.startsWith(ym));
}

export function titleOf(count: number): RankState {
  return rankOf(count, TITLES);
}

export function countByKind(steps: Step[]): Record<KindKey, number> {
  const out = { kaizen: 0, kaiketsu: 0, seicho: 0 } as Record<KindKey, number>;
  steps.forEach((s) => { out[s.kind] += 1; });
  return out;
}

export function countByArea(steps: Step[]): Map<string, number> {
  const m = new Map<string, number>();
  steps.forEach((s) => { if (s.area) m.set(s.area, (m.get(s.area) ?? 0) + 1); });
  return m;
}

/** 直近 n か月の月ごとの件数（古い順） */
export function monthlyCounts(steps: Step[], n: number, now = new Date()): { ym: string; label: string; count: number }[] {
  const out: { ym: string; label: string; count: number }[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = dateKey(d).slice(0, 7);
    out.push({ ym, label: `${d.getMonth() + 1}月`, count: steps.filter((s) => s.date.startsWith(ym)).length });
  }
  return out;
}

/** 「あの日の前進」：1週間前・1か月前・1年前の同じ日 */
export function lookbacks(today = todayKey()): { label: string; date: string }[] {
  const t = parseKey(today);
  const monthAgo = new Date(t.getFullYear(), t.getMonth() - 1, t.getDate());
  const yearAgo = new Date(t.getFullYear() - 1, t.getMonth(), t.getDate());
  return [
    { label: '1週間前の今日', date: addDays(today, -7) },
    // 3/31 の1か月前のように存在しない日は、月末にずれるので同じ日のときだけ使う
    ...(monthAgo.getDate() === t.getDate() ? [{ label: '1か月前の今日', date: dateKey(monthAgo) }] : []),
    ...(yearAgo.getDate() === t.getDate() ? [{ label: '1年前の今日', date: dateKey(yearAgo) }] : []),
  ];
}

export function kindPercent(steps: Step[]): { key: KindKey; label: string; count: number; percent: number }[] {
  const c = countByKind(steps);
  const total = steps.length || 1;
  return KINDS.map((k) => ({ key: k.key, label: k.label, count: c[k.key], percent: Math.round((c[k.key] / total) * 100) }));
}
