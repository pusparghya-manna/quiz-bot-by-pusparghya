/** Escape Telegram Markdown V1 special characters in user-controlled text */
export function escapeMd(text: string): string {
  return String(text || '').replace(/([_*`\[\]()])/g, '\\$1');
}

export function clampStr(s: unknown, max: number): string {
  return String(s ?? '').trim().slice(0, max);
}

export function isSafeUsername(u: string): boolean {
  return /^[a-zA-Z0-9_]{3,32}$/.test(u);
}

/** CSV cell escape + neutralize spreadsheet formula injection */
export function csvCell(value: unknown): string {
  let s = String(value ?? '');
  // Prevent formula injection in Excel/Sheets
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}
