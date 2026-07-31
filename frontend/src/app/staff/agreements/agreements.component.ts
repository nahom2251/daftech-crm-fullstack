import { Component, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AgreementService } from '../../core/services/agreement.service';
import { ClientService } from '../../core/services/client.service';
import { BadgeComponent } from '../../shared/badge.component';
import { BillingTier } from '../../core/models';

@Component({
  selector: 'app-agreements',
  standalone: true,
  imports: [FormsModule, BadgeComponent],
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
            <label>Document Number</label>
            <input type="text" [ngModel]="form.documentNumber" (ngModelChange)="form.documentNumber = $event" placeholder="DOC-2026-0001" />
          </div>
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
        @if (uploadError()) { <p class="upload-error" style="margin-top:0.75rem;">{{ uploadError() }}</p> }
        <button class="btn btn-primary" style="margin-top:1rem;" (click)="submit()" [disabled]="submitting()">
          {{ submitting() ? 'Saving…' : 'Save Agreement' }}
        </button>
      </div>
    }

    <div class="panel panel-pad" style="margin-top:1.25rem;">
      <table>
        <thead><tr><th>Client</th><th>Doc #</th><th>Sign Date</th><th>Expiry</th><th>Support Window</th><th>Tier</th><th>Status</th><th>Document</th></tr></thead>
        <tbody>
          @for (a of agreements.agreements(); track a.id) {
            <tr>
              <td>{{ clientName(a.clientId) }}</td>
              <td class="mono">{{ a.documentNumber }}</td>
              <td>{{ a.signDate }}</td>
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
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .header-row { display: flex; justify-content: space-between; align-items: flex-start; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
    .field { display: flex; flex-direction: column; gap: 0.3rem; }
    .field label { font-size: 0.78rem; font-weight: 600; color: var(--slate-500); }
    .upload-error { color: var(--red); font-size: 0.85rem; }
  `],
})
export class AgreementsComponent {
  showForm = signal(false);
  submitting = signal(false);
  uploadError = signal<string | null>(null);
  selectedFile = signal<File | null>(null);

  form: {
    clientId: string; documentNumber: string; agreementPlace: string; signDate: string;
    supportWindowMonths: number; billingTier: BillingTier;
  } = {
    clientId: '', documentNumber: '', agreementPlace: '', signDate: new Date().toISOString().slice(0, 10),
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
    if (!this.form.clientId || !this.form.documentNumber) return;

    this.submitting.set(true);
    this.uploadError.set(null);
    try {
      // The agreement must exist before a file can be attached to it (the
      // upload endpoint is scoped to an agreement id) — create first, then
      // upload as a second step if a file was chosen.
      const created = await this.agreements.createAgreement({ ...this.form });

      const file = this.selectedFile();
      if (file) {
        await this.agreements.uploadScannedFile(created.id, file);
      }

      this.showForm.set(false);
      this.selectedFile.set(null);
      this.form = {
        clientId: this.clients.approvedClients()[0]?.id ?? '', documentNumber: '', agreementPlace: '',
        signDate: new Date().toISOString().slice(0, 10), supportWindowMonths: 12, billingTier: 'Basic',
      };
    } catch (err) {
      // The agreement itself may have already been created successfully even
      // if the file upload step failed — surface that so the admin knows to
      // retry the upload rather than resubmitting the whole form.
      this.uploadError.set('The agreement was saved, but the file upload failed. You can retry the upload from the agreements list.');
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
}
