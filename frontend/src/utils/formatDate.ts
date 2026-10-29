// "st", "nd", "rd" or "th" for a day of the month.
function ordinalSuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) {
    return 'th';
  }
  return day % 10 === 1
    ? 'st'
    : day % 10 === 2
    ? 'nd'
    : day % 10 === 3
    ? 'rd'
    : 'th';
}

// The full date, e.g. "September 7th 2026" ('' for an invalid time).
export function formatFullDate(time: number): string {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'long' });
  return `${month} ${day}${ordinalSuffix(day)} ${date.getFullYear()}`;
}
