import { Component, computed, signal } from '@angular/core';
import { BarChartComponent, BarChartDatum } from '../../shared/bar-chart.component';
import { DonutChartComponent, DonutSlice } from '../../shared/donut-chart.component';
import { ReportService } from '../../core/services/report.service';
import { ClientService } from '../../core/services/client.service';
import { AgreementService } from '../../core/services/agreement.service';
import { TicketService } from '../../core/services/ticket.service';
import { MaintenanceService } from '../../core/services/maintenance.service';
import { EmployeeService } from '../../core/services/employee.service';
import { SatisfactionSurveyService } from '../../core/services/satisfaction-survey.service';
import { PdfExportService, PdfReportSpec } from '../../core/services/pdf-export.service';
import { OnTimeReport } from '../../core/models';

interface ReportDef {
  id: string;
  title: string;
  description: string;
}

const REPORTS: ReportDef[] = [
  { id: 'clients-agreements', title: 'Active Clients & Agreement Status', description: 'All clients with current agreement status and billing tier.' },
  { id: 'tickets-by-filter', title: 'Tickets by Client / Employee / Date Range', description: 'Ticket volume and resolution breakdown across filters.' },
  { id: 'agreements-expiring', title: 'Agreements Expiring Soon or Expired', description: 'Upcoming and past-due agreement renewals.' },
  { id: 'maintenance-history', title: 'Maintenance History', description: 'Internal maintenance records by category, date range, or employee.' },
  { id: 'time-performance', title: 'Employee Time-Log & Performance', description: 'Attendance combined with ticket resolution stats per employee.' },
  { id: 'satisfaction-surveys', title: 'Client Satisfaction Survey Responses', description: 'The 5-question follow-up survey, aggregated across all respondents.' },
];

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [BarChartComponent, DonutChartComponent],
  template: `
    <h1>Reports</h1>
    <p class="text-muted" style="margin-top:0.3rem;">Generate downloadable reports across the system.</p>

    <div class="panel panel-pad" style="margin-top:1.25rem;">
      <div class="chart-header">
        <div>
          <h3>On-Time Ticket Resolution</h3>
          <p class="text-muted" style="font-size:0.82rem; margin-top:0.25rem;">
            "On time" means resolved within {{ report()?.summary?.targetDays ?? '—' }} days of assignment.
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" (click)="downloadOnTimeReport()" [disabled]="!report()">Download as PDF</button>
      </div>

      @if (loading()) {
        <p class="text-muted" style="margin-top:1rem;">Loading…</p>
      } @else {
        @if (report(); as r) {
          <div class="chart-grid">
            <div class="chart-cell">
              <h4>Overall</h4>
              <app-donut-chart [data]="donutData()" centerLabel="On Time"></app-donut-chart>
            </div>
            <div class="chart-cell">
              <h4>On-Time Rate by Employee</h4>
              <app-bar-chart [chartData]="barData()"></app-bar-chart>
            </div>
          </div>
        }
      }
    </div>

    <div class="grid" style="margin-top:1.25rem;">
      @for (r of reports; track r.id) {
        <div class="panel panel-pad">
          <h3>{{ r.title }}</h3>
          <p class="text-muted" style="font-size:0.83rem; margin-top:0.4rem;">{{ r.description }}</p>
          <button class="btn btn-secondary btn-sm" style="margin-top:0.9rem;" (click)="download(r.id)" [disabled]="generating() === r.id">
            {{ generating() === r.id ? 'Generating…' : 'Download as PDF' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; }
    .chart-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-top: 1.5rem; align-items: start; }
    .chart-cell h4 { font-size: 0.82rem; margin-bottom: 0.9rem; color: var(--navy-800); }
    @media (max-width: 800px) { .chart-grid { grid-template-columns: 1fr; } }
  `],
})
export class ReportsComponent {
  reports = REPORTS;
  generating = signal<string | null>(null);

  report = signal<OnTimeReport | null>(null);
  loading = signal(true);

  constructor(
    private reportsSvc: ReportService,
    private clients: ClientService,
    private agreements: AgreementService,
    private tickets: TicketService,
    private maintenance: MaintenanceService,
    private employees: EmployeeService,
    private surveys: SatisfactionSurveyService,
    private pdf: PdfExportService
  ) {
    void this.load();
  }

  private async load() {
    this.loading.set(true);
    try {
      const r = await this.reportsSvc.getOnTimeResolutionReport();
      this.report.set(r);
    } finally {
      this.loading.set(false);
    }
  }

  donutData = computed((): DonutSlice[] => {
    const r = this.report();
    if (!r) return [];
    return [
      { label: 'On Time', value: r.summary.onTimeCount, color: '#16a34a' },
      { label: 'Late', value: r.summary.lateCount, color: 'var(--brand-red, #dc2626)' },
    ];
  });

  barData = computed((): BarChartDatum[] => {
    const r = this.report();
    if (!r) return [];
    return r.byEmployee.map(e => ({
      label: e.employeeName,
      value: e.onTimeRate,
      color: e.onTimeRate >= 90 ? '#16a34a' : e.onTimeRate >= 70 ? '#b45309' : 'var(--brand-red, #dc2626)',
    }));
  });

  private generatedAt(): string {
    return `Generated ${new Date().toLocaleString()}`;
  }

  downloadOnTimeReport() {
    const r = this.report();
    if (!r) return;
    const spec: PdfReportSpec = {
      title: 'On-Time Ticket Resolution',
      subtitle: `${this.generatedAt()} — target: resolve within ${r.summary.targetDays} days`,
      sections: [
        {
          heading: 'Overall',
          columns: ['On Time', 'Late', 'On-Time Rate'],
          rows: [[r.summary.onTimeCount, r.summary.lateCount, `${this.overallRate(r)}%`]],
        },
        {
          heading: 'By Employee',
          columns: ['Employee', 'On-Time Rate'],
          rows: r.byEmployee.map(e => [e.employeeName, `${e.onTimeRate}%`]),
        },
      ],
    };
    this.pdf.export(spec, 'on-time-resolution-report');
  }

  private overallRate(r: OnTimeReport): number {
    const total = r.summary.onTimeCount + r.summary.lateCount;
    return total === 0 ? 0 : Math.round((r.summary.onTimeCount / total) * 100);
  }

  async download(id: string) {
    this.generating.set(id);
    try {
      const spec = await this.buildSpec(id);
      if (spec) this.pdf.export(spec, id);
    } finally {
      this.generating.set(null);
    }
  }

  private async buildSpec(id: string): Promise<PdfReportSpec | null> {
    switch (id) {
      case 'clients-agreements':
        return this.buildClientsAgreementsSpec();
      case 'tickets-by-filter':
        return this.buildTicketsSpec();
      case 'agreements-expiring':
        return this.buildAgreementsExpiringSpec();
      case 'maintenance-history':
        return this.buildMaintenanceSpec();
      case 'time-performance':
        return this.buildTimePerformanceSpec();
      case 'satisfaction-surveys':
        return this.buildSatisfactionSurveysSpec();
      default:
        return null;
    }
  }

  private async buildClientsAgreementsSpec(): Promise<PdfReportSpec> {
    await Promise.all([this.clients.refresh(), this.agreements.refresh()]);
    const clientList = this.clients.clients();
    return {
      title: 'Active Clients & Agreement Status',
      subtitle: this.generatedAt(),
      sections: [{
        columns: ['Client', 'Status', 'Office', 'Agreements', 'Billing Tiers'],
        rows: clientList.map(c => {
          const clientAgreements = this.agreements.forClient(c.id);
          return [
            c.name,
            c.accountStatus,
            c.office,
            clientAgreements.length,
            clientAgreements.map(a => a.billingTier).join(', ') || '—',
          ];
        }),
      }],
    };
  }

  private async buildTicketsSpec(): Promise<PdfReportSpec> {
    await this.tickets.refresh();
    const ticketList = this.tickets.tickets();
    return {
      title: 'Tickets by Client / Employee / Date Range',
      subtitle: `${this.generatedAt()} — all tickets currently in the system`,
      sections: [{
        columns: ['Client', 'Employee', 'Category', 'Status', 'Submitted', 'Chargeable'],
        rows: ticketList.map(t => [
          t.clientName,
          t.assignedEmployeeName ?? 'Unassigned',
          t.category,
          t.status,
          new Date(t.dateSubmitted).toLocaleDateString(),
          t.chargeable ? 'Yes' : 'No',
        ]),
      }],
    };
  }

  private async buildAgreementsExpiringSpec(): Promise<PdfReportSpec> {
    await this.agreements.refresh();
    const expiring = this.agreements.expiringSoon();
    return {
      title: 'Agreements Expiring Soon or Expired',
      subtitle: `${this.generatedAt()} — within 30 days or already past expiry`,
      sections: [{
        columns: ['Client', 'Document #', 'Expiry Date', 'Billing Tier', 'Status'],
        rows: expiring.map(a => [
          this.clients.getById(a.clientId)?.name ?? a.clientId,
          a.documentNumber,
          a.expiryDate,
          a.billingTier,
          a.status,
        ]),
      }],
    };
  }

  private async buildMaintenanceSpec(): Promise<PdfReportSpec> {
    await this.maintenance.refresh();
    const records = this.maintenance.records();
    return {
      title: 'Maintenance History',
      subtitle: this.generatedAt(),
      sections: [{
        columns: ['Date', 'Category', 'Description', 'Performed By', 'Status'],
        rows: records.map(r => [
          r.date,
          r.category,
          r.description,
          this.employeeName(r.performedByEmployeeId),
          r.status,
        ]),
      }],
    };
  }

  private async buildTimePerformanceSpec(): Promise<PdfReportSpec> {
    await Promise.all([this.employees.refresh(), this.employees.refreshTimeLogs()]);
    const employeeList = this.employees.employees();
    const logs = this.employees.timeLogs();

    const hoursByEmployee = new Map<string, number>();
    for (const log of logs) {
      hoursByEmployee.set(log.employeeId, (hoursByEmployee.get(log.employeeId) ?? 0) + (log.totalHours ?? 0));
    }

    return {
      title: 'Employee Time-Log & Performance',
      subtitle: this.generatedAt(),
      sections: [{
        columns: ['Employee', 'Open Tickets', 'Avg. Satisfaction', 'Total Hours Logged'],
        rows: employeeList.map(e => [
          e.fullName,
          e.openTicketCount,
          e.averageSatisfactionScore != null ? e.averageSatisfactionScore.toFixed(1) : '—',
          (hoursByEmployee.get(e.id) ?? 0).toFixed(1),
        ]),
      }],
    };
  }

  private async buildSatisfactionSurveysSpec(): Promise<PdfReportSpec> {
    await this.surveys.refresh();
    const surveyList = this.surveys.surveys();
    return {
      title: 'Client Satisfaction Survey Responses',
      subtitle: `${this.generatedAt()} — ${surveyList.length} response(s)`,
      sections: [{
        columns: ['Submitted', 'Response Speed', 'Professionalism', 'Clarity', 'Would Recommend', 'Feedback'],
        rows: surveyList.map(s => [
          new Date(s.submittedAt).toLocaleDateString(),
          s.responseSpeedRating,
          s.professionalismRating,
          s.communicationClarityRating,
          s.likelihoodToRecommend,
          s.improvementFeedback ?? '—',
        ]),
      }],
    };
  }

  private employeeName(employeeId: string): string {
    return this.employees.employees().find(e => e.id === employeeId)?.fullName ?? employeeId;
  }
}