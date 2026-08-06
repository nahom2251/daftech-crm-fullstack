import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { TicketService } from '../../core/services/ticket.service';
import { AgreementService } from '../../core/services/agreement.service';
import { BadgeComponent } from '../../shared/badge.component';
import { TICKET_CATEGORY_LABELS } from '../../core/models';

@Component({
  selector: 'app-portal-dashboard',
  standalone: true,
  imports: [RouterLink, SlicePipe, BadgeComponent],
  template: `
    <h1>Dashboard</h1>
    <p class="text-muted" style="margin-top:0.3rem;">{{ client()?.name }} — a quick look at your support activity.</p>

    <div class="cards">
      <a routerLink="/portal/maintenance-history" class="panel panel-pad card">
        <div class="card-label">Total Support Requests</div>
        <div class="card-value">{{ totalSupport() }}</div>
      </a>
      <a routerLink="/portal/maintenance-history" [queryParams]="{ filter: 'pending' }" class="panel panel-pad card">
        <div class="card-label">Pending</div>
        <div class="card-value" [class.warn]="pending() > 0">{{ pending() }}</div>
      </a>
      <a routerLink="/portal/maintenance-history" [queryParams]="{ filter: 'accomplished' }" class="panel panel-pad card">
        <div class="card-label">Accomplished</div>
        <div class="card-value">{{ accomplished() }}</div>
      </a>
      <a routerLink="/portal/confirm-resolution" class="panel panel-pad card">
        <div class="card-label">Awaiting Your Confirmation</div>
        <div class="card-value" [class.warn]="awaitingConfirmation() > 0">{{ awaitingConfirmation() }}</div>
      </a>
      <a routerLink="/portal/maintenance-history" [queryParams]="{ filter: 'escalated' }" class="panel panel-pad card">
        <div class="card-label">Escalated</div>
        <div class="card-value" [class.warn]="escalated() > 0">{{ escalated() }}</div>
      </a>
      <a routerLink="/portal/maintenance-history" class="panel panel-pad card">
        <div class="card-label">Expired Agreements</div>
        <div class="card-value" [class.warn]="expiredAgreements() > 0">{{ expiredAgreements() }}</div>
      </a>
    </div>

    <div class="panel panel-pad" style="margin-top: 1.5rem;">
      <div class="section-head">
        <h3>Recent Activity</h3>
        <a routerLink="/portal/maintenance-history" class="text-muted see-all">See all →</a>
      </div>
      <div class="table-scroll"><table>
        <thead><tr><th>Ticket #</th><th>Category</th><th>Submitted</th><th>Assigned To</th><th>Status</th></tr></thead>
        <tbody>
          @for (t of recentActivity(); track t.id) {
            <tr>
              <td class="mono">{{ ticketNumber(t.id) }}</td>
              <td>{{ categoryLabel(t.category) }}</td>
              <td class="text-muted">{{ t.dateSubmitted | slice:0:10 }}</td>
              <td class="text-muted">{{ t.assignedEmployeeName || '—' }}</td>
              <td><app-badge [status]="t.status"></app-badge></td>
            </tr>
          }
          @empty { <tr><td colspan="5" class="text-muted" style="text-align:center; padding:1.5rem;">No activity yet.</td></tr> }
        </tbody>
      </table></div>
    </div>
  `,
  styles: [`
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1rem; margin-top: 1.4rem; }
    .card {
      display: block; position: relative; overflow: hidden;
      transition: transform 0.2s var(--ease), box-shadow 0.2s var(--ease), border-color 0.2s var(--ease);
    }
    .card::after {
      content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
      background: var(--grad-hairline); opacity: 0; transition: opacity 0.2s var(--ease);
    }
    .card:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); border-color: var(--slate-300); }
    .card:hover::after { opacity: 1; }
    .card-label {
      font-size: 0.72rem; color: var(--slate-500); font-weight: 700;
      letter-spacing: 0.055em; text-transform: uppercase; margin-bottom: 0.55rem;
    }
    .card-value {
      font-size: 2rem; font-weight: 750; color: var(--navy-900);
      letter-spacing: -0.03em; font-variant-numeric: tabular-nums; line-height: 1.1;
    }
    .card-value.warn { color: var(--brand-red); }
    .section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.9rem; }
    .see-all { font-size: 0.8rem; font-weight: 600; }
  `],
})
export class PortalDashboardComponent {
  constructor(private auth: AuthService, private ticketsSvc: TicketService, private agreementsSvc: AgreementService) {}

  client = computed(() => this.auth.currentClient());

  private myTickets = computed(() => {
    const client = this.client();
    return client ? this.ticketsSvc.forClient(client.id) : [];
  });

  totalSupport = computed(() => this.myTickets().length);

  pending = computed(() =>
    this.myTickets().filter(t => ['Submitted', 'Forwarded', 'Assigned', 'InProgress', 'Resolved', 'AwaitingClientConfirmation'].includes(t.status)).length
  );

  accomplished = computed(() => this.myTickets().filter(t => t.status === 'Closed').length);

  awaitingConfirmation = computed(() => this.myTickets().filter(t => t.status === 'AwaitingClientConfirmation').length);

  escalated = computed(() => this.myTickets().filter(t => t.status === 'Escalated').length);

  expiredAgreements = computed(() => {
    const client = this.client();
    if (!client) return 0;
    return this.agreementsSvc.agreements().filter(a => a.clientId === client.id && a.status === 'Expired').length;
  });

  recentActivity = computed(() => this.myTickets().slice(0, 10));

  ticketNumber(id: string): string {
    return id.slice(0, 8).toUpperCase();
  }

  categoryLabel(c: string): string {
    return TICKET_CATEGORY_LABELS[c as keyof typeof TICKET_CATEGORY_LABELS] ?? c;
  }
}
