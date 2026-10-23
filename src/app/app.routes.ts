import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'eventos',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'eventos',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/eventos/lista/event-list.page').then((m) => m.EventListPage),
  },
  {
    path: 'eventos/nuevo',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/eventos/formulario/event-form.page').then((m) => m.EventFormPage),
  },
  {
    path: 'eventos/:id/editar',
    canActivate: [authGuard, roleGuard],
    loadComponent: () =>
      import('./features/eventos/formulario/event-form.page').then((m) => m.EventFormPage),
  },
  {
    path: 'eventos/:id/panel',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/eventos/panel/event-dashboard.page').then((m) => m.EventDashboardPage),
  },
  {
    path: 'eventos/:id/invitaciones',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/invitaciones/lista/invitation-list.page').then(
        (m) => m.InvitationListPage,
      ),
  },
  {
    path: 'eventos/:id/invitaciones/:invitationId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/invitaciones/detalle/invitation-detail.page').then(
        (m) => m.InvitationDetailPage,
      ),
  },
  {
    path: 'eventos/:id/regalos',
    canActivate: [authGuard, roleGuard],
    loadComponent: () =>
      import('./features/regalos/lista/gift-list.page').then((m) => m.GiftListPage),
  },
  {
    path: 'i/:code',
    loadComponent: () =>
      import('./features/invitado/invitacion/guest-invitation.page').then(
        (m) => m.GuestInvitationPage,
      ),
  },
  {
    path: 'i/:code/regalos',
    loadComponent: () =>
      import('./features/invitado/regalos/guest-gifts.page').then((m) => m.GuestGiftsPage),
  },
  {
    path: '**',
    redirectTo: 'eventos',
  },
];
