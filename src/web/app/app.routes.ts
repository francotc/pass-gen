import { CanDeactivateFn, Routes } from '@angular/router';

/** Avisa antes de salir de una página con cambios sin guardar. */
const confirmLeave: CanDeactivateFn<{ dirty?: () => boolean }> = (c) =>
  !c?.dirty?.() || confirm('You have unsaved changes. Leave without saving?');

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'passes' },
  { path: 'passes', loadComponent: () => import('./pages/passes/pass-list').then((m) => m.PassList) },
  { path: 'passes/new', loadComponent: () => import('./pages/passes/pass-new').then((m) => m.PassNew) },
  { path: 'passes/:serial', loadComponent: () => import('./pages/passes/pass-detail').then((m) => m.PassDetail) },
  { path: 'templates', loadComponent: () => import('./pages/templates/template-list').then((m) => m.TemplateList) },
  { path: 'templates/new', loadComponent: () => import('./pages/templates/template-editor').then((m) => m.TemplateEditor), canDeactivate: [confirmLeave] },
  { path: 'templates/:id', loadComponent: () => import('./pages/templates/template-editor').then((m) => m.TemplateEditor), canDeactivate: [confirmLeave] },
  { path: 'notifications', loadComponent: () => import('./pages/notifications/notifications').then((m) => m.Notifications) },
  { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
  { path: '**', redirectTo: 'passes' },
];
