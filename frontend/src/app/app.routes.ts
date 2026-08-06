import { Routes } from '@angular/router';
import {
  staffAuthGuard, clientAuthGuard, adminRoleGuard, roleGuard,
  staffMustChangePasswordGuard, clientMustChangePasswordGuard,
} from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'admin/login' },

  // Admin / Staff app
  {
    path: 'admin/login',
    loadComponent: () => import('./staff/login/staff-login.component').then(m => m.StaffLoginComponent),
  },
  {
    path: 'admin/change-password',
    canActivate: [staffMustChangePasswordGuard],
    loadComponent: () => import('./staff/change-password/staff-change-password.component').then(m => m.StaffChangePasswordComponent),
  },
  {
    path: 'admin',
    canActivate: [staffAuthGuard],
    loadComponent: () => import('./staff/shell/staff-shell.component').then(m => m.StaffShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./staff/dashboard/dashboard.component').then(m => m.DashboardComponent) },
      {
        path: 'clients',
        canActivate: [roleGuard(['ItSupport'])],
        loadComponent: () => import('./staff/clients/clients-list.component').then(m => m.ClientsListComponent),
      },
      {
        path: 'clients/:id',
        canActivate: [roleGuard(['ItSupport'])],
        loadComponent: () => import('./staff/clients/client-detail.component').then(m => m.ClientDetailComponent),
      },
      {
        path: 'signup-requests',
        canActivate: [adminRoleGuard],
        loadComponent: () => import('./staff/signup-requests/signup-requests.component').then(m => m.SignupRequestsComponent),
      },
      {
        path: 'password-reset-requests',
        canActivate: [adminRoleGuard],
        loadComponent: () => import('./staff/password-reset-requests/password-reset-requests.component').then(m => m.PasswordResetRequestsComponent),
      },
      {
        path: 'agreements',
        canActivate: [roleGuard(['ItSupport'])],
        loadComponent: () => import('./staff/agreements/agreements.component').then(m => m.AgreementsComponent),
      },
      { path: 'tickets', loadComponent: () => import('./staff/tickets/tickets.component').then(m => m.TicketsComponent) },
      {
        path: 'employees',
        canActivate: [adminRoleGuard],
        loadComponent: () => import('./staff/employees/employees.component').then(m => m.EmployeesComponent),
      },
      {
        path: 'time-tracking',
        canActivate: [roleGuard(['EmployeeTechnician'])],
        loadComponent: () => import('./staff/time-tracking/time-tracking.component').then(m => m.TimeTrackingComponent),
      },
      {
        path: 'employee-performance',
        canActivate: [adminRoleGuard],
        loadComponent: () => import('./staff/employee-performance/employee-performance.component').then(m => m.EmployeePerformanceComponent),
      },
      {
        path: 'maintenance',
        canActivate: [roleGuard(['ItSupport'])],
        loadComponent: () => import('./staff/maintenance/maintenance.component').then(m => m.MaintenanceComponent),
      },
      { path: 'notifications', loadComponent: () => import('./staff/notifications/notifications.component').then(m => m.NotificationsComponent) },
      {
        path: 'reports',
        canActivate: [adminRoleGuard],
        loadComponent: () => import('./staff/reports/reports.component').then(m => m.ReportsComponent),
      },
      {
        path: 'session-activity',
        canActivate: [adminRoleGuard],
        loadComponent: () => import('./staff/session-activity/session-activity.component').then(m => m.SessionActivityComponent),
      },
      { path: 'settings', loadComponent: () => import('./staff/settings/settings.component').then(m => m.SettingsComponent) },
    ],
  },

  // Client Portal
  {
    path: 'portal/login',
    loadComponent: () => import('./portal/login/portal-login.component').then(m => m.PortalLoginComponent),
  },
  {
    path: 'portal/change-password',
    canActivate: [clientMustChangePasswordGuard],
    loadComponent: () => import('./portal/change-password/portal-change-password.component').then(m => m.PortalChangePasswordComponent),
  },
  {
    path: 'portal/signup',
    loadComponent: () => import('./portal/signup/portal-signup.component').then(m => m.PortalSignupComponent),
  },
  {
    path: 'portal',
    canActivate: [clientAuthGuard],
    loadComponent: () => import('./portal/shell/portal-shell.component').then(m => m.PortalShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./portal/dashboard/dashboard.component').then(m => m.PortalDashboardComponent) },
      { path: 'maintenance-history', loadComponent: () => import('./portal/maintenance-history/maintenance-history.component').then(m => m.MaintenanceHistoryComponent) },
      { path: 'reports', loadComponent: () => import('./portal/reports/reports.component').then(m => m.PortalReportsComponent) },
      { path: 'submit-issue', redirectTo: 'maintenance-history', pathMatch: 'full' },
      { path: 'my-tickets', redirectTo: 'maintenance-history', pathMatch: 'full' },
      { path: 'confirm-resolution', loadComponent: () => import('./portal/confirm-resolution/confirm-resolution.component').then(m => m.ConfirmResolutionComponent) },
      { path: 'survey/:ticketId', loadComponent: () => import('./portal/satisfaction-survey/satisfaction-survey.component').then(m => m.SatisfactionSurveyComponent) },
      { path: 'notifications', loadComponent: () => import('./portal/notifications/portal-notifications.component').then(m => m.PortalNotificationsComponent) },
    ],
  },

  { path: '**', redirectTo: 'admin/login' },
];
