/** ISO 8601 → valor de <input type="datetime-local"> en hora local. */
export function toLocalInput(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de datetime-local (hora local) → ISO 8601 UTC; vacío → undefined. */
export function fromLocalInput(local: string): string | undefined {
  return local ? new Date(local).toISOString() : undefined;
}
