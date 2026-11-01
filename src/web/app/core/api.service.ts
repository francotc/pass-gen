import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ImageMeta,
  NotificationInput,
  OtpVerifyResult,
  NotificationRecord,
  Pass,
  PassInput,
  SettingsStatus,
  SyncResult,
  Template,
  TemplateInput,
} from '../../../worker/types';

export interface TemplateSummary {
  id: string;
  name: string;
  kind: Template['kind'];
  updatedAt: string;
}

export interface PassSummary {
  serial: string;
  templateId: string;
  holderName: string;
  updatedAt: string;
  voided: boolean;
}

export interface NotificationSummary {
  id: string;
  createdAt: string;
  header: string;
  target: NotificationRecord['target'];
  passes: number;
  apple: boolean;
  google: boolean;
  failed: number;
}

export interface GoogleStatus {
  exists: boolean;
  state?: string;
  hasUsers?: boolean;
  smartTap?: boolean;
  barcode?: { type?: string; value?: string } | null;
  rotatingBarcode?: { type?: string; valuePattern?: string; periodSeconds: number } | null;
  otpEnabledInTemplate?: boolean;
}

export interface PassWithSync {
  pass: Pass;
  sync: SyncResult;
}

/** Extrae el mensaje de error que devuelve la API ({ error, detail }). */
export function errorMessage(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    const body = e.error as { error?: string; detail?: string } | null;
    if (body?.error) return body.detail ? `${body.error}: ${body.detail}` : body.error;
    if (e.status === 0) return 'Cannot reach the server';
    return `Error ${e.status}`;
  }
  return e instanceof Error ? e.message : String(e);
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  private get<T>(url: string) {
    return firstValueFrom(this.http.get<T>(url));
  }

  // Settings
  settings() {
    return this.get<SettingsStatus>('/api/settings');
  }
  saveApple(form: FormData) {
    return firstValueFrom(this.http.put<{ ok: true }>('/api/settings/apple', form));
  }
  saveGoogle(body: { issuerId: string; serviceAccount?: string }) {
    return firstValueFrom(this.http.put<{ ok: true }>('/api/settings/google', body));
  }

  // Imágenes
  uploadImage(file: File) {
    const form = new FormData();
    form.set('file', file);
    return firstValueFrom(this.http.post<ImageMeta>('/api/images', form));
  }
  imageUrl(id: string) {
    return `/api/images/${encodeURIComponent(id)}`;
  }

  // Plantillas
  templates() {
    return this.get<TemplateSummary[]>('/api/templates');
  }
  template(id: string) {
    return this.get<Template>(`/api/templates/${encodeURIComponent(id)}`);
  }
  createTemplate(t: TemplateInput) {
    return firstValueFrom(this.http.post<Template>('/api/templates', t));
  }
  updateTemplate(id: string, t: TemplateInput) {
    return firstValueFrom(this.http.put<Template>(`/api/templates/${encodeURIComponent(id)}`, t));
  }
  deleteTemplate(id: string) {
    return firstValueFrom(this.http.delete<{ ok: true }>(`/api/templates/${encodeURIComponent(id)}`));
  }
  publishTemplate(id: string) {
    return firstValueFrom(this.http.post<SyncResult & { passes: number }>(`/api/templates/${encodeURIComponent(id)}/publish`, {}));
  }

  // Pases
  passes() {
    return this.get<PassSummary[]>('/api/passes');
  }
  pass(serial: string) {
    return this.get<Pass>(`/api/passes/${encodeURIComponent(serial)}`);
  }
  issuePass(input: PassInput) {
    return firstValueFrom(this.http.post<PassWithSync>('/api/passes', input));
  }
  updatePass(
    serial: string,
    body: { holderName?: string; data?: Record<string, string>; voided?: boolean; notify?: boolean; email?: string },
  ) {
    return firstValueFrom(this.http.put<PassWithSync>(`/api/passes/${encodeURIComponent(serial)}`, body));
  }
  syncPass(serial: string) {
    return firstValueFrom(this.http.post<SyncResult>(`/api/passes/${encodeURIComponent(serial)}/sync`, {}));
  }
  googleStatus(serial: string) {
    return this.get<GoogleStatus>(`/api/passes/${encodeURIComponent(serial)}/google-status`);
  }
  googleLink(serial: string) {
    return this.get<{ url: string }>(`/api/passes/${encodeURIComponent(serial)}/google-link`);
  }
  pkpassUrl(serial: string) {
    return `/api/passes/${encodeURIComponent(serial)}/pkpass`;
  }
  // Notificaciones
  notifications() {
    return this.get<NotificationSummary[]>('/api/notifications');
  }
  notification(id: string) {
    return this.get<NotificationRecord>(`/api/notifications/${encodeURIComponent(id)}`);
  }
  sendNotification(input: NotificationInput) {
    return firstValueFrom(this.http.post<NotificationRecord>('/api/notifications', input));
  }

  holderPageUrl(pass: Pass) {
    return `${location.origin}/public/p/${encodeURIComponent(pass.serial)}/${pass.authToken}`;
  }
  verifyOtp(value: string) {
    return firstValueFrom(this.http.post<OtpVerifyResult>('/api/otp/verify', { value }));
  }

  publicPkpassUrl(pass: Pass) {
    return `${location.origin}/public/passes/${encodeURIComponent(pass.serial)}/${pass.authToken}.pkpass`;
  }
}
