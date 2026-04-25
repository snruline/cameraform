/** แปลง Date → ISO string + แปลง ISO → รูปแบบ Thai-friendly */

export function nowIso(): string {
  return new Date().toISOString();
}

/** dd/MM/yyyy HH:mm น. (พ.ศ.) */
export function formatThai(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear() + 543;
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${day}/${month}/${year} ${hh}:${mm} น.`;
}
