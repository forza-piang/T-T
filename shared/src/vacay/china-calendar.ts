/** Published State Council calendar; do not extrapolate unpublished years.
 * Source: https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
 * Verified copy: https://www.beijing.gov.cn/cs/gncs/zcwj/202603/t20260327_4568275.html
 */
export interface ChinaCalendarDay {
  date: string;
  name: string;
  localName: string;
  global: true;
  counties: null;
  isWorkday: boolean;
}

const PERIODS_2026: readonly [string, number, number][] = [
  ['元旦', 101, 103], ['春节', 215, 223], ['清明节', 404, 406],
  ['劳动节', 501, 505], ['端午节', 619, 621], ['中秋节', 925, 927], ['国庆节', 1001, 1007],
];
const WORKDAYS_2026 = ['01-04', '02-14', '02-28', '05-09', '09-20', '10-10'];

export function getChinaCalendar(year: number): ChinaCalendarDay[] | undefined {
  if (year !== 2026) return undefined;
  const days: ChinaCalendarDay[] = [];
  for (const [name, start, end] of PERIODS_2026) {
    for (let day = start; day <= end; day++) {
      const md = String(day).padStart(4, '0');
      days.push({ date: `2026-${md.slice(0, 2)}-${md.slice(2)}`, name, localName: name,
        global: true, counties: null, isWorkday: false });
    }
  }
  for (const md of WORKDAYS_2026) {
    days.push({ date: `2026-${md}`, name: '调休补班', localName: '调休补班',
      global: true, counties: null, isWorkday: true });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

export function chinaCalendarDay(date: string): ChinaCalendarDay | undefined {
  return getChinaCalendar(Number(date.slice(0, 4)))?.find(day => day.date === date);
}
