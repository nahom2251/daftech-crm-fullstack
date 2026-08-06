import { Component, computed, effect, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { EmployeeRole, NotificationRecipientType } from '../../core/models';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  rolesAllowed?: EmployeeRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/admin/dashboard', icon: '📊' },
  { label: 'Clients', path: '/admin/clients', icon: '🏢', rolesAllowed: ['Admin', 'ItSupport'] },
  { label: 'Signup Requests', path: '/admin/signup-requests', icon: '📥', rolesAllowed: ['Admin'] },
  { label: 'Password Reset Requests', path: '/admin/password-reset-requests', icon: '🔑', rolesAllowed: ['Admin'] },
  { label: 'Agreements', path: '/admin/agreements', icon: '📄', rolesAllowed: ['Admin', 'ItSupport'] },
  { label: 'Tickets', path: '/admin/tickets', icon: '🎫' },
  { label: 'Employees', path: '/admin/employees', icon: '👥', rolesAllowed: ['Admin'] },
  { label: 'Time Tracking', path: '/admin/time-tracking', icon: '⏱️', rolesAllowed: ['Admin', 'EmployeeTechnician'] },
  { label: 'Employee Performance', path: '/admin/employee-performance', icon: '📈', rolesAllowed: ['Admin'] },
  { label: 'Maintenance History', path: '/admin/maintenance', icon: '🛠️', rolesAllowed: ['Admin', 'ItSupport'] },
  { label: 'Notifications', path: '/admin/notifications', icon: '🔔' },
  { label: 'Reports', path: '/admin/reports', icon: '📈', rolesAllowed: ['Admin'] },
  { label: 'Session Activity', path: '/admin/session-activity', icon: '🟢', rolesAllowed: ['Admin'] },
  { label: 'Settings', path: '/admin/settings', icon: '⚙️' },
];

@Component({
  selector: 'app-staff-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="shell">
      <!-- Backdrop — clicking outside the open mobile sidebar closes it -->
      @if (sidebarOpen()) {
        <div class="backdrop" (click)="closeSidebar()"></div>
      }

      <aside class="sidebar" [class.open]="sidebarOpen()">
        <div class="brand">
          <img src="assets/daftech-logo.png" alt="DAFTECH" class="brand-logo-img brand-logo-sm" />
          <div>
            <div class="brand-name">DAFTECH</div>
            <div class="brand-sub">Admin / Staff</div>
          </div>
          <button class="close-btn" (click)="closeSidebar()" aria-label="Close menu">✕</button>
        </div>
        <nav>
          @for (item of visibleNavItems(); track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active" class="nav-link" (click)="closeSidebar()">
              <span class="nav-icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
        <div class="sidebar-footer">
          <div class="who">
            <div class="who-name">{{ auth.currentEmployee()?.fullName }}</div>
            <div class="who-role">{{ auth.currentEmployee()?.roles?.join(', ') }}</div>
          </div>
          <button class="btn btn-outline btn-sm" (click)="logout()">Log out</button>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <button class="hamburger" (click)="toggleSidebar()" aria-label="Open menu">
            <span></span><span></span><span></span>
          </button>
          <a routerLink="/admin/notifications" class="bell">
            🔔
            @if (unread() > 0) {
              <span class="bell-count">{{ unread() }}</span>
            }
          </a>
        </header>
        <main class="content">
          <router-outlet></router-outlet>
        </main>
        <footer class="app-footer">© {{ year }} DAFTECH Computer Engineering. All rights reserved.</footer>
      </div>
    </div>
  `,
  styles: [`
    .shell { display: flex; min-height: 100vh; }
    .backdrop {
      display: none;
    }
    .sidebar {
      width: 248px; flex-shrink: 0; color: #fff;
      background:
        radial-gradient(24rem 18rem at 0% 0%, rgba(52, 87, 178, 0.22), transparent 70%),
        radial-gradient(20rem 16rem at 100% 100%, rgba(224, 52, 43, 0.12), transparent 70%),
        var(--navy-950);
      display: flex; flex-direction: column; padding: 1.15rem 0.85rem;
      position: sticky; top: 0; height: 100vh;
      border-right: 1px solid rgba(255, 255, 255, 0.07);
    }
    .brand {
      display: flex; align-items: center; gap: 0.65rem;
      padding: 0.3rem 0.45rem 1.05rem; margin-bottom: 0.85rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .brand .brand-logo-img {
      background: #fff; border-radius: 9px; padding: 3px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
    }
    .brand-name { font-weight: 700; font-size: 0.95rem; color: #fff; letter-spacing: 0.055em; }
    .brand-sub { font-size: 0.69rem; color: var(--slate-400); letter-spacing: 0.03em; }
    .close-btn { display: none; margin-left: auto; background: none; border: none; color: #fff; font-size: 1.1rem; padding: 0.3rem; }
    nav { display: flex; flex-direction: column; gap: 0.12rem; flex: 1; overflow-y: auto; padding-right: 0.15rem; }
    .nav-link {
      display: flex; align-items: center; gap: 0.65rem; padding: 0.55rem 0.7rem; border-radius: 9px;
      color: rgba(255, 255, 255, 0.66); font-size: 0.855rem; font-weight: 500;
      position: relative; transition: background 0.18s var(--ease), color 0.18s var(--ease);
    }
    .nav-link:hover { background: rgba(255, 255, 255, 0.07); color: #fff; }
    .nav-link.active {
      background: linear-gradient(90deg, rgba(52, 87, 178, 0.95), rgba(52, 87, 178, 0.62));
      color: #fff; font-weight: 600;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
    }
    .nav-link.active::before {
      content: ''; position: absolute; left: -0.85rem; top: 0.42rem; bottom: 0.42rem;
      width: 3px; border-radius: 0 3px 3px 0; background: var(--brand-red);
    }
    .nav-icon { font-size: 0.95rem; width: 1.2rem; text-align: center; opacity: 0.9; }
    .sidebar-footer {
      display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
      padding-top: 0.9rem; margin-top: 0.6rem; border-top: 1px solid rgba(255, 255, 255, 0.09);
    }
    .sidebar-footer .btn-outline {
      background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.82);
      border-color: rgba(255, 255, 255, 0.16); box-shadow: none;
    }
    .sidebar-footer .btn-outline:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12); color: #fff; border-color: rgba(255, 255, 255, 0.28);
    }
    .who-name { font-size: 0.82rem; font-weight: 600; color: #fff; }
    .who-role { font-size: 0.7rem; color: var(--slate-400); }
    .main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .topbar {
      height: 60px; flex-shrink: 0; background: rgba(255, 255, 255, 0.82);
      backdrop-filter: saturate(150%) blur(10px);
      border-bottom: 1px solid var(--slate-200);
      display: flex; align-items: center; justify-content: space-between; padding: 0 1.75rem;
      position: sticky; top: 0; z-index: 20;
    }
    .hamburger {
      display: none; flex-direction: column; justify-content: center; gap: 4px;
      background: none; border: none; padding: 0.4rem; cursor: pointer;
    }
    .hamburger span { width: 20px; height: 2px; background: var(--navy-800); border-radius: 2px; }
    .bell {
      position: relative; font-size: 1.05rem; margin-left: auto;
      display: inline-flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 10px;
      transition: background 0.18s var(--ease);
    }
    .bell:hover { background: var(--slate-100); }
    .bell-count {
      position: absolute; top: -6px; right: -8px; background: var(--red); color: #fff;
      font-size: 0.65rem; font-weight: 700; border-radius: 999px; padding: 0.05rem 0.35rem;
    }
    .content { padding: 1.9rem 1.75rem 2.25rem; flex: 1; }
    .app-footer {
      padding: 0.9rem 1.75rem; font-size: 0.75rem; color: var(--slate-400);
      border-top: 1px solid var(--slate-200); text-align: center;
    }

    /* Mobile: sidebar becomes an off-canvas drawer, opened by the hamburger */
    @media (max-width: 860px) {
      .sidebar {
        position: fixed; left: 0; top: 0; z-index: 40;
        transform: translateX(-100%);
        transition: transform 0.2s ease-out;
        box-shadow: 2px 0 12px rgba(0,0,0,0.15);
      }
      .sidebar.open { transform: translateX(0); }
      .close-btn { display: block; }
      .hamburger { display: flex; }
      .backdrop {
        display: block; position: fixed; inset: 0; background: rgba(15,23,42,0.5); z-index: 30;
      }
      .content { padding: 1.1rem; }
      .app-footer { padding: 0.8rem 1.1rem; }
    }
  `],
})
export class StaffShellComponent {
  sidebarOpen = signal(false);
  readonly year = new Date().getFullYear();

  constructor(
    public auth: AuthService,
    private notifications: NotificationService,
    private router: Router
  ) {
    effect(() => {
      const key = this.recipientKey();
      if (key) void this.notifications.loadFor(key.type, key.id);
    });

    // Close the mobile drawer automatically on every navigation, so tapping
    // a link doesn't leave the overlay open behind the new page.
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.sidebarOpen.set(false));
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.sidebarOpen.set(false);
  }

  private recipientKey = computed((): { type: NotificationRecipientType; id: string } | null => {
    const emp = this.auth.currentEmployee();
    if (!emp) return null;
    if (emp.roles.includes('Admin')) return { type: 'Admin', id: 'ALL_ADMIN' };
    if (emp.roles.includes('ItSupport')) return { type: 'ItSupport', id: 'ALL_IT_SUPPORT' };
    return { type: 'Employee', id: emp.id };
  });

  unread = computed(() => {
    const key = this.recipientKey();
    return key ? this.notifications.unreadCountFor(key.type, key.id) : 0;
  });

  visibleNavItems = computed(() => {
    const emp = this.auth.currentEmployee();
    if (!emp) return [];
    return NAV_ITEMS.filter(item => !item.rolesAllowed || item.rolesAllowed.some(r => emp.roles.includes(r)));
  });

  async logout() {
    await this.auth.logoutStaff();
    this.router.navigateByUrl('/admin/login');
  }
}