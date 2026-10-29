import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'pases' },
  { path: 'pases', loadComponent: () => import('./pages/passes/pass-list').then((m) => m.PassList) },
  { path: 'pases/nuevo', loadComponent: () => import('./pages/passes/pass-new').then((m) => m.PassNew) },
  { path: 'pases/:serial', loadComponent: () => import('./pages/passes/pass-detail').then((m) => m.PassDetail) },
  { path: 'plantillas', loadComponent: () => import('./pages/templates/template-list').then((m) => m.TemplateList) },
  { path: 'plantillas/nueva', loadComponent: () => import('./pages/templates/template-editor').then((m) => m.TemplateEditor) },
  { path: 'plantillas/:id', loadComponent: () => import('./pages/templates/template-editor').then((m) => m.TemplateEditor) },
  { path: 'ajustes', loadComponent: () => import('./pages/settings/settings').then((m) => m.Settings) },
  { path: '**', redirectTo: 'pases' },
];
