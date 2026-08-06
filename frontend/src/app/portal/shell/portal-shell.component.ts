import { Component, computed, effect, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { TicketService } from '../../core/services/ticket.service';

@Component({
  selector: 'app-portal-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="shell">
      @if (menuOpen()) {
        <div class="backdrop" (click)="closeMenu()"></div>
      }

      <header class="topbar">
        <div class="brand">
          <img src="assets/daftech-logo.png" alt="DAFTECH" class="brand-logo-img brand-logo-sm" />
          <span class="brand-name">DAFTECH Client Portal</span>
        </div>

        <button class="hamburger" (click)="toggleMenu()" aria-label="Open menu">
          <span></span><span></span><span></span>
        </button>

        <nav [class.open]="menuOpen()">
          <a routerLink="/portal/dashboard" routerLinkActive="active" (click)="closeMenu()">Dashboard</a>
          <a routerLink="/portal/maintenance-history" routerLinkActive="active" (click)="closeMenu()">Maintenance History</a>
          <a routerLink="/portal/confirm-resolution" routerLinkActive="active" class="bell" (click)="closeMenu()">
            Confirm Resolution
            @if (awaitingCount() > 0) { <span class="bell-count">{{ awaitingCount() }}</span> }
          </a>
          <a routerLink="/portal/notifications" routerLinkActive="active" class="bell" (click)="closeMenu()">
            Notifications
            @if (unread() > 0) { <span class="bell-count">{{ unread() }}</span> }
          </a>
          <a routerLink="/portal/reports" routerLinkActive="active" (click)="closeMenu()">Reports</a>
          <div class="who mobile-who">
            <span>{{ auth.currentClient()?.name }}</span>
            <button class="btn btn-outline btn-sm" (click)="logout()">Log out</button>
          </div>
        </nav>

        <div class="who desktop-who">
          <span>{{ auth.currentClient()?.name }}</span>
          <button class="btn btn-outline btn-sm" (click)="logout()">Log out</button>
        </div>
      </header>
      <main class="content">
        <router-outlet></router-outlet>
      </main>
      <footer class="app-footer">© {{ year }} DAFTECH Computer Engineering. All rights reserved.</footer>
    </div>
  `,
  styles: [`
    .shell {
      min-height: 100vh;
      background:
        radial-gradient(900px 420px at 12% -8%, rgba(52,87,178,0.09), transparent 60%),
        radial-gradient(700px 380px at 95% 0%, rgba(224,52,43,0.06), transparent 60%),
        var(--portal-bg);
      display: flex; flex-direction: column;
    }
    .backdrop { display: none; }
    .topbar {
      background: rgba(255,255,255,0.85); backdrop-filter: saturate(180%) blur(12px);
      border-bottom: 1px solid var(--slate-200); padding: 0.85rem 1.75rem;
      display: flex; align-items: center; gap: 1.75rem; flex-wrap: wrap;
      position: sticky; top: 0; z-index: 40; box-shadow: var(--shadow-xs);
    }
    .brand { display: flex; align-items: center; gap: 0.6rem; }
    .brand .brand-logo-img { border-radius: 9px; }
    .brand-name {
      font-family: var(--font-display); font-weight: 600; font-size: 0.92rem;
      letter-spacing: -0.01em;
    }
    nav { display: flex; gap: 0.35rem; flex: 1; }
    nav a {
      font-size: 0.85rem; color: var(--slate-500); font-weight: 500;
      padding: 0.42rem 0.7rem; border-radius: 9px; position: relative;
      transition: background 0.18s var(--ease), color 0.18s var(--ease);
    }
    nav a:hover { background: var(--slate-100); color: var(--navy-800); }
    nav a.active { color: var(--portal-accent); background: var(--portal-accent-soft); font-weight: 600; }
    .bell-count {
      background: var(--red); color: #fff; font-size: 0.62rem; font-weight: 700;
      border-radius: 999px; padding: 0.05rem 0.35rem; margin-left: 0.3rem;
    }
    .who { display: flex; align-items: center; gap: 0.7rem; font-size: 0.85rem; font-weight: 500; }
    .mobile-who { display: none; }
    .content {
      padding: 2.25rem 1.5rem; max-width: 980px; margin: 0 auto; width: 100%; flex: 1;
      animation: daftech-rise 0.32s var(--ease) both;
    }
    .app-footer {
      padding: 1rem 1.5rem; font-size: 0.75rem; color: var(--slate-400);
      border-top: 1px solid var(--slate-200); text-align: center;
    }
    .hamburger {
      display: none; flex-direction: column; justify-content: center; gap: 4px;
      background: none; border: none; padding: 0.4rem; cursor: pointer; margin-left: auto;
    }
    .hamburger span { width: 20px; height: 2px; background: var(--navy-800); border-radius: 2px; }

    /* Mobile: nav collapses into a hamburger-triggered dropdown panel */
    @media (max-width: 720px) {
      .topbar { padding: 0.75rem 1rem; }
      .hamburger { display: flex; }
      .desktop-who { display: none; }
      nav {
        display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 40;
        background: #fff; border-bottom: 1px solid var(--slate-200); flex-direction: column;
        gap: 0; padding: 0.5rem 0; box-shadow: var(--shadow-md);
      }
      nav.open { display: flex; }
      nav a { padding: 0.75rem 1.25rem; border-radius: 0; border-bottom: 1px solid var(--slate-100); }
      .mobile-who {
        display: flex; justify-content: space-between; align-items: center;
        padding: 0.9rem 1.25rem 0.6rem; margin-top: 0.3rem; border-top: 1px solid var(--slate-200);
      }
      .backdrop { display: block; position: fixed; inset: 0; background: rgba(15,23,42,0.35); z-index: 30; }
      .content { padding: 1.35rem 1rem; }
      .app-footer { padding: 0.85rem 1rem; }
    }
  `],
})
export class PortalShellComponent {
  menuOpen = signal(false);
  readonly year = new Date().getFullYear();

  constructor(
    public auth: AuthService,
    private notifications: NotificationService,
    private ticketsSvc: TicketService,
    private router: Router
  ) {
    effect(() => {
      const client = this.auth.currentClient();
      if (client) void this.notifications.loadFor('Client', client.id);
    });

    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.menuOpen.set(false));
  }

  toggleMenu() {
    this.menuOpen.update(v => !v);
  }

  closeMenu() {
    this.menuOpen.set(false);
  }

  awaitingCount = computed(() => {
    const client = this.auth.currentClient();
    return client ? this.ticketsSvc.awaitingConfirmationForClient(client.id).length : 0;
  });

  unread = computed(() => {
    const client = this.auth.currentClient();
    if (!client) return 0;
    return this.notifications.unreadCountFor('Client', client.id);
  });

  async logout() {
    await this.auth.logoutClient();
    this.router.navigateByUrl('/portal/login');
  }
}