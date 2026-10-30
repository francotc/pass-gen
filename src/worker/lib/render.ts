import type { Pass } from '../types';

/** Reemplaza {{clave}} por su valor; las claves faltantes quedan vacías (o intactas con `keepMissing`). */
export function render(tpl: string, vars: Record<string, string>, keepMissing = false): string {
  return tpl.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k: string) => vars[k] ?? (keepMissing ? m : ''));
}

export function passVars(pass: Pick<Pass, 'serial' | 'holderName' | 'data'>): Record<string, string> {
  return { ...pass.data, serial: pass.serial, holderName: pass.holderName };
}
