import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientService } from '../../core/services/client.service';
import { AgreementService } from '../../core/services/agreement.service';
import { TicketService } from '../../core/services/ticket.service';
import { BadgeComponent } from '../../shared/badge.component';
import { TICKET_CATEGORY_LABELS, BillingTier } from '../../core/models';

/**
 * Client → Training → Agreements. Previously this panel was read-only and
 * pulled from AgreementService.forClient(), which only ever gets populated
 * for a logged-in Client session (via refreshMyAgreements()) — for a staff
 * session it was always empty, so this page always showed "No agreements
 * on file" no matter how many the client actually had. It now reads from
 * forClientStaffView() (the staff-only full agreements list, already
 * loaded for every Admin/Employee session) and reuses the same working
 * create/upload calls the dedicated Agreements page uses — no new backend
 * logic, no changed save behavior, just wiring this page up to what
 * already works. Every "Save" here creates a new, independent Agreement
 * record; nothing is ever overwritten.
 */
@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [RouterLink, BadgeComponent, SlicePipe, FormsModule],
  template: `
    @if (client(); as c) {
      <a routerLink="/admin/clients" class="back">← Back to Clients</a>
      <div class="header-row">
        <div>
          <h1>{{ c.name }}</h1>
          <p class="text-muted" style="margin-top:0.3rem;">ID {{ c.idNumber }} · {{ c.office }}, {{ c.location }}</p>
          <p class="text-muted mono" style="margin-top:0.2rem; font-size:0.78rem;">Account: {{ c.accountRefId }}</p>
        </div>
        <app-badge [status]="c.accountStatus"></app-badge>
      </div>

      <div class="grid">
        <div class="panel panel-pad">
          <h3>Profile</h3>
          <dl>
            <dt>Phone</dt><dd>{{ c.phoneNumber }}</dd>
            <dt>KYC Type</dt><dd>{{ c.kycType }}</dd>
            <dt>KYC Contact</dt><dd>{{ c.kycContact }}</dd>
            @if (c.itSupportContact) { <dt>IT Support Contact</dt><dd>{{ c.itSupportContact }}</dd> }
            <dt>Onboarded</dt><dd>{{ c.onboardingDate }}</dd>
            @if (c.rejectionReason) { <dt>Rejection Reason</dt><dd class="text-muted">{{ c.rejectionReason }}</dd> }
          </dl>
        </div>

        <div class="panel panel-pad">
          <div class="header-row">
            <h3 style="margin:0;">Agreements</h3>
            <button class="btn btn-primary btn-sm" (click)="showForm.set(!showForm())">
              {{ showForm() ? 'Cancel' : '+ Add Agreement' }}
            </button>
          </div>

          @if (showForm()) {
            <div class="add-form">
              <div class="form-grid">
                <div class="field">
                  <label>Agreement Place</label>
                  <input type="text" [ngModel]="form.agreementPlace" (ngModelChange)="form.agreementPlace = $event" placeholder="Addis Ababa" />
                </div>
                <div class="field">
                  <label>Sign Date</label>
                  <input type="date" [ngModel]="form.signDate" (ngModelChange)="form.signDate = $event" />
                </div>
                <div class="field">
                  <label>Support Window (months)</label>
                  <input type="number" [ngModel]="form.supportWindowMonths" (ngModelChange)="form.supportWindowMonths = $event" />
                </div>
                <div class="field">
                  <label>Billing Tier</label>
                  <select [ngModel]="form.billingTier" (ngModelChange)="form.billingTier = $event">
                    <option value="Basic">Basic</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>
                <div class="field">
                  <label>Scanned Document</label>
                  <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" (change)="onFileSelected($event)" />
                  @if (selectedFile()) { <span class="text-muted" style="font-size:0.75rem;">{{ selectedFile()!.name }}</span> }
                </div>
              </div>

              <h4 style="margin: 1.1rem 0 0.6rem;">Client Training</h4>
              <p class="text-muted" style="font-size:0.78rem; margin: -0.3rem 0 0.8rem;">
                Training delivered before this agreement — scan of the training record, a description of what was covered, and the timeline.
              </p>
              <div class="form-grid">
                <div class="field">
                  <label>Training Scan / Document</label>
                  <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" (change)="onTrainingFileSelected($event)" />
                  @if (selectedTrainingFile()) { <span class="text-muted" style="font-size:0.75rem;">{{ selectedTrainingFile()!.name }}</span> }
                </div>
                <div class="field">
                  <label>Start Date</label>
                  <input type="date" [ngModel]="form.trainingStartDate" (ngModelChange)="form.trainingStartDate = $event" />
                </div>
                <div class="field">
                  <label>End Date</label>
                  <input type="date" [ngModel]="form.trainingEndDate" (ngModelChange)="form.trainingEndDate = $event" />
                </div>
                <div class="field" style="grid-column: 1 / -1;">
                  <label>Description</label>
                  <textarea rows="3" [ngModel]="form.trainingDescription" (ngModelChange)="form.trainingDescription = $event" placeholder="What was covered, who attended…"></textarea>
                </div>
              </div>

              @if (uploadError()) { <p class="upload-error" style="margin-top:0.75rem;">{{ uploadError() }}</p> }
              <button class="btn btn-primary" style="margin-top:1rem;" (click)="submit(c.id)" [disabled]="submitting()">
                {{ submitting() ? 'Saving…' : 'Save Agreement' }}
              </button>
            </div>
          }

          <div class="table-scroll" style="margin-top:1rem;"><table>
            <thead><tr><th>Doc #</th><th>Sign Date</th><th>Expiry</th><th>Tier</th><th>Status</th><th>Document</th><th>Training</th></tr></thead>
            <tbody>
              @for (a of agreements(); track a.id) {
                <tr>
                  <td class="mono">{{ a.documentNumber }}</td>
                  <td>{{ a.signDate }}</td>
                  <td>{{ a.expiryDate }}</td>
                  <td>{{ a.billingTier }}</td>
                  <td><app-badge [status]="a.status"></app-badge></td>
                  <td>
                    @if (a.scannedFileUrl) {
                      <button class="btn btn-outline btn-sm" (click)="download(a.id)">Download</button>
                    } @else { <span class="text-muted">None</span> }
                  </td>
                  <td>
                    @if (a.trainingScanFileName || a.trainingDescription || a.trainingStartDate) {
                      <button class="btn btn-outline btn-sm" (click)="viewTraining(a.id)">View</button>
                    } @else { <span class="text-muted">None</span> }
                  </td>
                </tr>
              }
              @empty { <tr><td colspan="7" class="text-muted">No agreements on file.</td></tr> }
            </tbody>
          </table></div>

          @if (viewingTrainingId(); as id) {
            <div class="training-view">
              <div class="header-row">
                <h4 style="margin:0;">Training — {{ viewingTrainingDoc() }}</h4>
                <button class="btn btn-outline btn-sm" (click)="closeTrainingView()">Close</button>
              </div>
              <div class="form-grid" style="margin-top:0.75rem;">
                <div class="field">
                  <label>Start Date</label>
                  <input type="date" [ngModel]="trainingForm.trainingStartDate" (ngModelChange)="trainingForm.trainingStartDate = $event" />
                </div>
                <div class="field">
                  <label>End Date</label>
                  <input type="date" [ngModel]="trainingForm.trainingEndDate" (ngModelChange)="trainingForm.trainingEndDate = $event" />
                </div>
                <div class="field" style="grid-column: 1 / -1;">
                  <label>Description</label>
                  <textarea rows="3" [ngModel]="trainingForm.trainingDescription" (ngModelChange)="trainingForm.trainingDescription = $event"></textarea>
                </div>
                <div class="field">
                  <label>Scan</label>
                  <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" (change)="onTrainingFileSelected($event)" />
                  @if (selectedTrainingFile()) {
                    <span class="text-muted" style="font-size:0.75rem;">{{ selectedTrainingFile()!.name }}</span>
                  } @else if (currentTrainingScanName()) {
                    <span class="text-muted" style="font-size:0.75rem;">
                      Current: {{ currentTrainingScanName() }}
                      <button class="btn btn-outline btn-sm" style="margin-left:0.5rem;" (click)="downloadTrainingScan(id)">Download</button>
                    </span>
                  }
                </div>
              </div>
              @if (uploadError()) { <p class="upload-error" style="margin-top:0.75rem;">{{ uploadError() }}</p> }
              <button class="btn btn-primary" style="margin-top:0.85rem;" (click)="saveTraining(id)" [disabled]="submitting()">
                {{ submitting() ? 'Saving…' : 'Save Training Info' }}
              </button>
            </div>
          }
        </div>
      </div>

      <div class="panel panel-pad" style="margin-top:1.25rem;">
        <h3>Full Ticket History with DAFTECH</h3>
        <p class="text-muted" style="font-size:0.8rem; margin: 0.2rem 0 0.9rem;">Used by Admin when assigning new tickets.</p>
        <div class="table-scroll"><table>
          <thead><tr><th>Ticket</th><th>Category</th><th>Submitted</th><th>Chargeable</th><th>Status</th></tr></thead>
          <tbody>
            @for (t of tickets(); track t.id) {
              <tr>
                <td class="mono">{{ t.id }}</td>
                <td>{{ categoryLabel(t.category) }}</td>
                <td class="text-muted">{{ t.dateSubmitted | slice:0:10 }}</td>
                <td><app-badge [status]="t.chargeable ? 'Chargeable' : 'Free'"></app-badge></td>
                <td><app-badge [status]="t.status"></app-badge></td>
              </tr>
            }
            @empty { <tr><td colspan="5" class="text-muted">No tickets submitted yet.</td></tr> }
          </tbody>
        </table></div>
      </div>
    } @else {
      <p class="text-muted">Client not found.</p>
    }
  `,
  styles: [`
    .back { display: inline-block; margin-bottom: 1rem; font-size: 0.82rem; color: var(--slate-500); }
    .header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; }
    .grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 1.25rem; align-items: start; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 0.4rem 1rem; margin-top: 0.75rem; font-size: 0.85rem; }
    dt { color: var(--slate-500); font-weight: 600; }
    dd { margin: 0; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    .add-form { margin-top: 0.9rem; padding: 0.9rem; border: 1px solid var(--slate-200); border-radius: 10px; }
    .training-view { margin-top: 1rem; padding: 0.9rem; border: 1px solid var(--slate-200); border-radius: 10px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.85rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    .field label { font-size: 0.76rem; font-weight: 600; color: var(--slate-500); }
    .upload-error { color: var(--red); font-size: 0.85rem; }
  `],
})
export class ClientDetailComponent {
  id = input.required<string>();

  showForm = signal(false);
  submitting = signal(false);
  uploadError = signal<string | null>(null);
  selectedFile = signal<File | null>(null);
  selectedTrainingFile = signal<File | null>(null);

  viewingTrainingId = signal<string | null>(null);
  viewingTrainingDoc = signal<string>('');
  currentTrainingScanName = signal<string | null>(null);

  form: {
    agreementPlace: string; signDate: string;
    supportWindowMonths: number; billingTier: BillingTier;
    trainingDescription: string; trainingStartDate: string; trainingEndDate: string;
  } = this.blankForm();

  trainingForm: { trainingDescription: string; trainingStartDate: string; trainingEndDate: string } = {
    trainingDescription: '', trainingStartDate: '', trainingEndDate: '',
  };

  constructor(
    private clientsSvc: ClientService,
    public agreementsSvc: AgreementService,
    private ticketsSvc: TicketService
  ) {}

  client = computed(() => this.clientsSvc.getById(this.id()));
  // Reads the staff-only full agreements list (already loaded for every
  // Admin/Employee session) instead of the client-portal-only myAgreements
  // list — see the class-level comment above for why the old forClient()
  // call here never showed anything for a staff user.
  agreements = computed(() => this.agreementsSvc.forClientStaffView(this.id()));
  tickets = computed(() => this.ticketsSvc.forClient(this.id()));

  categoryLabel(c: string): string {
    return TICKET_CATEGORY_LABELS[c as keyof typeof TICKET_CATEGORY_LABELS] ?? c;
  }

  private blankForm() {
    return {
      agreementPlace: '', signDate: new Date().toISOString().slice(0, 10),
      supportWindowMonths: 12, billingTier: 'Basic' as BillingTier,
      trainingDescription: '', trainingStartDate: '', trainingEndDate: '',
    };
  }

  onFileSelected(evt: Event) {
    const file = (evt.target as HTMLInputElement).files?.[0];
    this.selectedFile.set(file ?? null);
    this.uploadError.set(null);
  }

  onTrainingFileSelected(evt: Event) {
    const file = (evt.target as HTMLInputElement).files?.[0];
    this.selectedTrainingFile.set(file ?? null);
    this.uploadError.set(null);
  }

  /**
   * Always creates a brand-new Agreement record scoped to this client —
   * never touches or overwrites any existing agreement. Same three-step
   * flow (create → upload scanned file → upload/save training info) the
   * working Agreements admin page uses.
   */
  async submit(clientId: string) {
    this.submitting.set(true);
    this.uploadError.set(null);
    try {
      const created = await this.agreementsSvc.createAgreement({ clientId, ...this.form });

      const file = this.selectedFile();
      if (file) {
        await this.agreementsSvc.uploadScannedFile(created.id, file);
      }

      if (this.form.trainingDescription || this.form.trainingStartDate || this.form.trainingEndDate) {
        await this.agreementsSvc.updateTrainingInfo(created.id, {
          trainingDescription: this.form.trainingDescription || undefined,
          trainingStartDate: this.form.trainingStartDate || undefined,
          trainingEndDate: this.form.trainingEndDate || undefined,
        });
      }
      const trainingFile = this.selectedTrainingFile();
      if (trainingFile) {
        await this.agreementsSvc.uploadTrainingScan(created.id, trainingFile);
      }

      this.showForm.set(false);
      this.selectedFile.set(null);
      this.selectedTrainingFile.set(null);
      this.form = this.blankForm();
    } catch (err) {
      this.uploadError.set('The agreement was saved, but a later step failed. You can retry uploads/training info from the agreements list below.');
      console.error(err);
    } finally {
      this.submitting.set(false);
    }
  }

  async download(agreementId: string) {
    try {
      const blob = await this.agreementsSvc.downloadScannedFile(agreementId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download scanned document', err);
    }
  }

  viewTraining(agreementId: string) {
    const a = this.agreements().find(x => x.id === agreementId);
    if (!a) return;
    this.viewingTrainingId.set(agreementId);
    this.viewingTrainingDoc.set(a.documentNumber);
    this.currentTrainingScanName.set(a.trainingScanFileName ?? null);
    this.trainingForm = {
      trainingDescription: a.trainingDescription ?? '',
      trainingStartDate: a.trainingStartDate?.slice(0, 10) ?? '',
      trainingEndDate: a.trainingEndDate?.slice(0, 10) ?? '',
    };
    this.selectedTrainingFile.set(null);
    this.uploadError.set(null);
  }

  closeTrainingView() {
    this.viewingTrainingId.set(null);
    this.selectedTrainingFile.set(null);
    this.uploadError.set(null);
  }

  async saveTraining(agreementId: string) {
    this.submitting.set(true);
    this.uploadError.set(null);
    try {
      await this.agreementsSvc.updateTrainingInfo(agreementId, {
        trainingDescription: this.trainingForm.trainingDescription || undefined,
        trainingStartDate: this.trainingForm.trainingStartDate || undefined,
        trainingEndDate: this.trainingForm.trainingEndDate || undefined,
      });

      const file = this.selectedTrainingFile();
      if (file) {
        await this.agreementsSvc.uploadTrainingScan(agreementId, file);
      }

      this.closeTrainingView();
    } catch (err) {
      this.uploadError.set('Could not save training info — please try again.');
      console.error(err);
    } finally {
      this.submitting.set(false);
    }
  }

  async downloadTrainingScan(agreementId: string) {
    try {
      const blob = await this.agreementsSvc.downloadTrainingScan(agreementId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download training scan', err);
    }
  }
}
