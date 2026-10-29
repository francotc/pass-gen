import type { Pass } from '../types';

/** Reemplaza {{clave}} por su valor; las claves faltantes quedan vacías. */
export function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}

export function passVars(pass: Pick<Pass, 'serial' | 'holderName' | 'data'>): Record<string, string> {
  return { ...pass.data, serial: pass.serial, holderName: pass.holderName };
}
