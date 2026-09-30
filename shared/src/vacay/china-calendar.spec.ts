import { describe, expect, it } from 'vitest';
import { getChinaCalendar, chinaCalendarDay } from './china-calendar';
describe('China official 2026 calendar', () => {
  it('contains 33 rest days and six make-up workdays without duplicates', () => {
    const days = getChinaCalendar(2026)!;
    expect(days.filter(d => !d.isWorkday)).toHaveLength(33);
    expect(days.filter(d => d.isWorkday).map(d => d.date)).toEqual(['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10']);
    expect(new Set(days.map(d => d.date)).size).toBe(days.length);
    expect(chinaCalendarDay('2026-02-23')?.localName).toBe('春节');
    expect(chinaCalendarDay('2026-10-07')?.isWorkday).toBe(false);
    expect(chinaCalendarDay('2026-10-08')).toBeUndefined();
  });
  it('does not invent schedules for unsupported years or mutate shared data', () => {
    expect(getChinaCalendar(2027)).toBeUndefined();
    getChinaCalendar(2026)!.pop();
    expect(getChinaCalendar(2026)).toHaveLength(39);
  });
});
