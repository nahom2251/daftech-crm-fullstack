import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgreementService } from '../../core/services/agreement.service';
import { ClientService } from '../../core/services/client.service';
import { BadgeComponent } from '../../shared/badge.component';
import { PaginationComponent } from '../../shared/pagination.component';
import { AgreementTraining, BillingTier } from '../../core/models';

@Component({
  selector: 'app-agreements',
  standalone: true,
  imports: [FormsModule, BadgeComponent, PaginationComponent],
  template: `
    <div class="header-row">
      <div>
        <h1>Agreements</h1>
        <p class="text-muted" style="margin-top:0.3rem;">Scanned agreement documents, billing tiers, and support windows.</p>
      </div>
      <button class="btn btn-primary" (click)="showForm.set(!showForm())">{{ showForm() ? 'Cancel' : '+ New Agreement' }}</button>
    </div>

    @if (showForm()) {
      <div class="panel panel-pad" style="margin-top:1.25rem;">
        <div class="form-grid">
          <div class="field">
            <label>Client</label>
            <select [ngModel]="form.clientId" (ngModelChange)="form.clientId = $event">
              @for (c of clients.approvedClients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select>
          </div>
          <div class="field">
            <label>Agreement Place</label>
            <input type="text" [ngModel]="form.agreementPlace" (ngModelChange)="form.agreementPlace = $event" placeholder="Addis Ababa" />
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

        <p class="text-muted" style="font-size:0.78rem; margin: 1rem 0 0;">
          Sign Date (support start) isn't set here — it's calculated automatically once client training is added and its end date is filled in, from the Agreements table below.
        </p>

        @if (uploadError()) { <p class="upload-error" style="margin-top:0.75rem;">{{ uploadError() }}</p> }
        <button class="btn btn-primary" style="margin-top:1rem;" (click)="submit()" [disabled]="submitting()">
          {{ submitting() ? 'Saving…' : 'Save Agreement' }}
        </button>
      </div>
    }

    @if (viewingTrainingId(); as id) {
      <div class="panel panel-pad" style="margin-top:1.25rem;">
        <div class="header-row">
          <h3 style="margin:0;">Trainings — {{ clientName(viewingTrainingClientId()) }}</h3>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn btn-outline btn-sm" (click)="addTrainingRow(id)" [disabled]="submitting()">+ Add Training</button>
            <button class="btn btn-outline btn-sm" (click)="closeTrainingView()">Close</button>
          </div>
        </div>
        <p class="text-muted" style="font-size:0.78rem; margin: 0.6rem 0 0;">
          A client may have multiple trainings (e.g. separate sessions for different staff groups). The support agreement starts once the latest training's End Date is set — save each row independently.
        </p>

        @if (uploadError()) { <p class="upload-error" style="margin-top:0.75rem;">{{ uploadError() }}</p> }

        @for (row of trainingRows(); track row.training.id) {
          <div class="training-row">
            <div class="header-row">
              <h4 style="margin:0;">Training {{ $index + 1 }}</h4>
              <button class="btn btn-outline btn-sm" (click)="deleteTrainingRow(id, row.training.id)" [disabled]="submitting()">Delete</button>
            </div>
            <div class="form-grid" style="margin-top:0.75rem;">
              <div class="field">
                <label>Start Date</label>
                <input type="date" [ngModel]="row.startDate" (ngModelChange)="row.startDate = $event" />
              </div>
              <div class="field">
                <label>End Date</label>
                <input type="date" [ngModel]="row.endDate" (ngModelChange)="row.endDate = $event" />
              </div>
              <div class="field">
                <label>Scan</label>
                <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" (change)="onTrainingFileSelected($event, row)" />
                @if (row.selectedFile) {
                  <span class="text-muted" style="font-size:0.75rem;">{{ row.selectedFile.name }}</span>
                } @else if (row.training.scanFileName) {
                  <span class="text-muted" style="font-size:0.75rem;">
                    Current: {{ row.training.scanFileName }}
                    <button class="btn btn-outline btn-sm" style="margin-left:0.5rem;" (click)="downloadTrainingScan(id, row.training.id)">Download</button>
                  </span>
                }
              </div>
              <div class="field" style="grid-column: 1 / -1;">
                <label>Description</label>
                <textarea rows="3" [ngModel]="row.description" (ngModelChange)="row.description = $event" placeholder="What was covered, who attended…"></textarea>
              </div>
            </div>
            <button class="btn btn-primary btn-sm" style="margin-top:0.75rem;" (click)="saveTrainingRow(id, row)" [disabled]="submitting()">
              {{ submitting() ? 'Saving…' : 'Save Training ' + ($index + 1) }}
            </button>
          </div>
        }
        @empty {
          <p class="text-muted" style="margin-top:0.9rem;">No trainings yet — click "+ Add Training" to add one.</p>
        }
      </div>
    }

    <div class="panel panel-pad" style="margin-top:1.25rem;">
      <div class="table-scroll"><table>
        <thead><tr><th>Client</th><th>Doc #</th><th>Sign Date</th><th>Expiry</th><th>Support Window</th><th>Tier</th><th>Status</th><th>Document</th><th>Trainings</th></tr></thead>
        <tbody>
          @for (a of agreements.pagedAgreements(); track a.id) {
            <tr>
              <td>{{ clientName(a.clientId) }}</td>
              <td class="mono">{{ a.documentNumber }}</td>
              <td>
                @if (a.signDate) { {{ a.signDate }} } @else { <span class="text-muted">Pending training</span> }
              </td>
              <td>{{ a.expiryDate }}</td>
              <td class="text-muted">{{ a.supportWindowMonths }} mo</td>
              <td>{{ a.billingTier }}</td>
              <td><app-badge [status]="a.status"></app-badge></td>
              <td>
                @if (a.scannedFileUrl) {
                  <button class="btn btn-outline btn-sm" (click)="download(a.id)">Download</button>
                } @else {
                  <span class="text-muted">None</span>
                }
              </td>
              <td>
                <button class="btn btn-outline btn-sm" (click)="viewTraining(a.id)">
                  {{ a.trainings.length > 0 ? a.trainings.length + ' training' + (a.trainings.length > 1 ? 's' : '') : 'Add training' }}
                </button>
              </td>
            </tr>
          }
        </tbody>
      </table></div>
      <app-pagination
        [page]="agreements.page()"
        [totalPages]="agreements.totalPages()"
        [totalCount]="agreements.totalCount()"
        [pageSize]="agreements.pageSize()"
        (pageChange)="agreements.goToPage($event)">
      </app-pagination>
    </div>
  `,
  styles: [`
    .header-row { display: flex; justify-content: space-between; align-items: flex-start; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    .field label { font-size: 0.78rem; font-weight: 600; color: var(--slate-500); }
    .upload-error { color: var(--red); font-size: 0.85rem; }
    .training-row { margin-top: 1rem; padding: 0.9rem; border: 1px solid var(--slate-200); border-radius: 10px; }
    .training-row:first-of-type { margin-top: 1.1rem; }
  `],
})
export class AgreementsComponent {
  showForm = signal(false);
  submitting = signal(false);
  uploadError = signal<string | null>(null);
  selectedFile = signal<File | null>(null);

  // Existing-agreement trainings view/edit panel — separate from the "New
  // Agreement" form above so viewing/editing trainings on an already-saved
  // agreement doesn't disturb the create form's state.
  viewingTrainingId = signal<string | null>(null);
  viewingTrainingClientId = signal<string>('');
  trainingRows = signal<TrainingRowState[]>([]);

  form: {
    clientId: string; agreementPlace: string;
    supportWindowMonths: number; billingTier: BillingTier;
  } = {
    clientId: '', agreementPlace: '',
    supportWindowMonths: 12, billingTier: 'Basic',
  };

  constructor(public agreements: AgreementService, public clients: ClientService) {
    effect(() => {
      const list = clients.approvedClients();
      if (list.length > 0 && !this.form.clientId) {
        this.form.clientId = list[0].id;
      }
    });
  }

  clientName(id: string): string {
    return this.clients.getById(id)?.name ?? id;
  }

  onFileSelected(evt: Event) {
    const file = (evt.target as HTMLInputElement).files?.[0];
    this.selectedFile.set(file ?? null);
    this.uploadError.set(null);
  }

  async submit() {
    if (!this.form.clientId) return;

    this.submitting.set(true);
    this.uploadError.set(null);
    try {
      const created = await this.agreements.createAgreement({ ...this.form });

      const file = this.selectedFile();
      if (file) {
        await this.agreements.uploadScannedFile(created.id, file);
      }

      this.showForm.set(false);
      this.selectedFile.set(null);
      this.form = {
        clientId: this.clients.approvedClients()[0]?.id ?? '', agreementPlace: '',
        supportWindowMonths: 12, billingTier: 'Basic',
      };

      // Take the admin straight into the trainings panel for the agreement
      // they just created — an agreement isn't "live" (support hasn't
      // started) until at least one training's end date is saved.
      this.viewTraining(created.id);
    } catch (err) {
      this.uploadError.set('The agreement was saved, but a later step failed. You can retry uploads from the agreements list.');
      console.error(err);
    } finally {
      this.submitting.set(false);
    }
  }

  async download(agreementId: string) {
    try {
      const blob = await this.agreements.downloadScannedFile(agreementId);
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
    const a = this.agreements.pagedAgreements().find(x => x.id === agreementId)
      ?? this.agreements.agreements().find(x => x.id === agreementId);
    if (!a) return;
    this.viewingTrainingId.set(agreementId);
    this.viewingTrainingClientId.set(a.clientId);
    this.trainingRows.set(a.trainings.map(t => this.toRowState(t)));
    this.uploadError.set(null);
  }

  closeTrainingView() {
    this.viewingTrainingId.set(null);
    this.trainingRows.set([]);
    this.uploadError.set(null);
  }

  private toRowState(t: AgreementTraining): TrainingRowState {
    return {
      training: t,
      description: t.description ?? '',
      startDate: t.startDate?.slice(0, 10) ?? '',
      endDate: t.endDate?.slice(0, 10) ?? '',
      selectedFile: null,
    };
  }

  /** Adds a new, empty training row on the server immediately (so it has an id to save/delete against), then refreshes the panel from the updated agreement. */
  async addTrainingRow(agreementId: string) {
    this.submitting.set(true);
    this.uploadError.set(null);
    try {
      const updated = await this.agreements.addTraining(agreementId);
      this.trainingRows.set(updated.trainings.map(t => this.toRowState(t)));
    } catch (err) {
      this.uploadError.set('Could not add a new training row — please try again.');
      console.error(err);
    } finally {
      this.submitting.set(false);
    }
  }

  onTrainingFileSelected(evt: Event, row: TrainingRowState) {
    const file = (evt.target as HTMLInputElement).files?.[0];
    row.selectedFile = file ?? null;
    this.uploadError.set(null);
  }

  /** Saves one training row independently of any other — its own Save button, its own request. */
  async saveTrainingRow(agreementId: string, row: TrainingRowState) {
    this.submitting.set(true);
    this.uploadError.set(null);
    try {
      let updated = await this.agreements.saveTraining(agreementId, row.training.id, {
        description: row.description || undefined,
        startDate: row.startDate || undefined,
        endDate: row.endDate || undefined,
      });

      if (row.selectedFile) {
        updated = await this.agreements.uploadTrainingScan(agreementId, row.training.id, row.selectedFile);
      }

      this.trainingRows.set(updated.trainings.map(t => this.toRowState(t)));
    } catch (err) {
      this.uploadError.set('Could not save this training — please try again.');
      console.error(err);
    } finally {
      this.submitting.set(false);
    }
  }

  async deleteTrainingRow(agreementId: string, trainingId: string) {
    this.submitting.set(true);
    this.uploadError.set(null);
    try {
      const updated = await this.agreements.deleteTraining(agreementId, trainingId);
      this.trainingRows.set(updated.trainings.map(t => this.toRowState(t)));
    } catch (err) {
      this.uploadError.set('Could not delete this training — please try again.');
      console.error(err);
    } finally {
      this.submitting.set(false);
    }
  }

  async downloadTrainingScan(agreementId: string, trainingId: string) {
    try {
      const blob = await this.agreements.downloadTrainingScan(agreementId, trainingId);
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

interface TrainingRowState {
  training: AgreementTraining;
  description: string;
  startDate: string;
  endDate: string;
  selectedFile: File | null;
}
