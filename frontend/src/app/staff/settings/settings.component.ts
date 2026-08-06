import { Component, computed, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { SystemConfigurationService } from '../../core/services/system-configuration.service';

type SettingsTab = 'password' | 'configuration' | 'appearance';

@Component({
  selector: 'app-staff-settings',
  standalone: true,
  imports: [FormsModule, DatePipe],
  template: `
    <h1>Settings</h1>
    <p class="text-muted" style="margin-top:0.3rem;">Your account, and — if you're an Admin — how the system behaves.</p>

    <div class="tabs">
      <button class="tab" [class.active]="tab() === 'password'" (click)="tab.set('password')">Change Password</button>
      <button class="tab" [class.active]="tab() === 'appearance'" (click)="tab.set('appearance')">Appearance</button>
      @if (isAdmin()) {
        <button class="tab" [class.active]="tab() === 'configuration'" (click)="tab.set('configuration')">Configuration</button>
      }
    </div>

    @if (tab() === 'password') {
      <div class="panel panel-pad section">
        <h3>Change Password</h3>
        <p class="text-muted hint">Update the password you use to sign in.</p>

        <label class="lbl">Current password</label>
        <input type="password" [ngModel]="currentPassword()" (ngModelChange)="currentPassword.set($event)" autocomplete="current-password" />

        <label class="lbl" style="margin-top:0.8rem;">New password</label>
        <input type="password" [ngModel]="newPassword()" (ngModelChange)="newPassword.set($event)" autocomplete="new-password" />

        <label class="lbl" style="margin-top:0.8rem;">Confirm new password</label>
        <input type="password" [ngModel]="confirmPassword()" (ngModelChange)="confirmPassword.set($event)" autocomplete="new-password" (keydown.enter)="savePassword()" />

        <p class="text-muted hint">At least 8 characters.</p>

        @if (passwordError()) { <div class="err">{{ passwordError() }}</div> }
        @if (passwordSuccess()) { <div class="ok">Password changed successfully.</div> }

        <button class="btn btn-primary" style="margin-top:1rem;" [disabled]="savingPassword()" (click)="savePassword()">
          {{ savingPassword() ? 'Saving…' : 'Save New Password' }}
        </button>
      </div>
    }

    @if (tab() === 'appearance') {
      <div class="panel panel-pad section">
        <h3>Appearance</h3>
        <p class="text-muted hint">Dark mode is coming soon.</p>
      </div>
    }

    @if (tab() === 'configuration' && isAdmin()) {
      <div class="section">
        @if (loadingConfig()) {
          <p class="text-muted">Loading configuration…</p>
        } @else {
          @for (group of config.byCategory(); track group.category) {
            <div class="panel panel-pad section">
              <h3>{{ group.category }}</h3>
              @for (setting of group.settings; track setting.key) {
                <div class="setting-row">
                  <div class="setting-info">
                    <div class="setting-label">{{ setting.label }}</div>
                    <div class="text-muted setting-desc">{{ setting.description }}</div>
                    @if (setting.updatedAt) {
                      <div class="text-muted setting-meta">
                        Last changed {{ setting.updatedAt | date:'medium' }}{{ setting.updatedByName ? ' by ' + setting.updatedByName : '' }}
                      </div>
                    }
                  </div>
                  <div class="setting-control">
                    @if (setting.valueType === 'bool') {
                      <select [ngModel]="draft(setting.key)" (ngModelChange)="setDraft(setting.key, $event)">
                        <option value="true">On</option>
                        <option value="false">Off</option>
                      </select>
                    } @else {
                      <input
                        type="number"
                        min="0"
                        [ngModel]="draft(setting.key)"
                        (ngModelChange)="setDraft(setting.key, $event)"
                      />
                    }
                  </div>
                </div>
              }
              <button class="btn btn-primary btn-sm" style="margin-top:0.9rem;" [disabled]="savingConfig() || !isDirty(group.category)" (click)="saveCategory(group.category)">
                {{ savingConfig() ? 'Saving…' : 'Save Changes' }}
              </button>
            </div>
          }
          @if (configError()) { <div class="err" style="margin-top:0.5rem;">{{ configError() }}</div> }
          @if (configSuccess()) { <div class="ok" style="margin-top:0.5rem;">Configuration updated.</div> }
        }
      </div>
    }
  `,
  styles: [`
    .tabs { display: flex; gap: 0.4rem; margin: 1.25rem 0 1.1rem; border-bottom: 1px solid var(--slate-200); flex-wrap: wrap; }
    .tab {
      background: none; padding: 0.6rem 0.9rem; font-size: 0.85rem; font-weight: 600;
      color: var(--slate-500); border-bottom: 2px solid transparent; border-radius: 0;
    }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
    .section { margin-bottom: 1.1rem; max-width: 640px; }
    .section h3 { margin-bottom: 0.2rem; }
    .lbl { display: block; font-size: 0.78rem; font-weight: 600; color: var(--slate-500); margin-bottom: 0.3rem; }
    input, select { width: 100%; }
    .hint { font-size: 0.78rem; margin: 0.3rem 0 0.8rem; }
    .err { margin-top: 0.9rem; padding: 0.65rem 0.8rem; border-radius: 8px; background: var(--red-bg); color: var(--red); font-size: 0.83rem; }
    .ok { margin-top: 0.9rem; padding: 0.65rem 0.8rem; border-radius: 8px; background: var(--green-bg); color: var(--green); font-size: 0.83rem; }

    .setting-row {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
      padding: 0.85rem 0; border-top: 1px solid var(--slate-100);
    }
    .setting-row:first-of-type { border-top: none; padding-top: 0.4rem; }
    .setting-info { flex: 1; min-width: 0; }
    .setting-label { font-size: 0.88rem; font-weight: 600; color: var(--navy-900); }
    .setting-desc { font-size: 0.78rem; margin-top: 0.15rem; line-height: 1.4; }
    .setting-meta { font-size: 0.7rem; margin-top: 0.3rem; }
    .setting-control { width: 110px; flex-shrink: 0; }
  `],
})
export class SettingsComponent implements OnInit {
  tab = signal<SettingsTab>('password');

  // --- Password tab ---
  currentPassword = signal('');
  newPassword = signal('');
  confirmPassword = signal('');
  savingPassword = signal(false);
  passwordError = signal<string | null>(null);
  passwordSuccess = signal(false);

  // --- Configuration tab ---
  loadingConfig = signal(true);
  savingConfig = signal(false);
  configError = signal<string | null>(null);
  configSuccess = signal(false);
  private drafts = signal<Record<string, string>>({});

  isAdmin = computed(() => this.auth.currentEmployee()?.roles.includes('Admin') ?? false);

  constructor(public auth: AuthService, public config: SystemConfigurationService) {}

  async ngOnInit() {
    if (this.isAdmin()) {
      try {
        await this.config.refresh();
        this.resetDrafts();
      } finally {
        this.loadingConfig.set(false);
      }
    } else {
      this.loadingConfig.set(false);
    }
  }

  private resetDrafts() {
    const map: Record<string, string> = {};
    for (const s of this.config.settings()) map[s.key] = s.value;
    this.drafts.set(map);
  }

  draft(key: string): string {
    return this.drafts()[key] ?? '';
  }

  setDraft(key: string, value: string) {
    this.drafts.update(d => ({ ...d, [key]: value }));
    this.configSuccess.set(false);
  }

  isDirty(category: string): boolean {
    const original = this.config.settings().filter(s => s.category === category);
    return original.some(s => this.draft(s.key) !== s.value);
  }

  async saveCategory(category: string) {
    this.configError.set(null);
    this.configSuccess.set(false);

    const changed = this.config.settings()
      .filter(s => s.category === category && this.draft(s.key) !== s.value)
      .map(s => ({ key: s.key, value: this.draft(s.key) }));

    if (changed.length === 0) return;

    this.savingConfig.set(true);
    try {
      await this.config.update(changed);
      this.resetDrafts();
      this.configSuccess.set(true);
    } catch (e: any) {
      this.configError.set(e?.error ?? e?.error?.text ?? 'Could not save configuration — please try again.');
    } finally {
      this.savingConfig.set(false);
    }
  }

  async savePassword() {
    this.passwordError.set(null);
    this.passwordSuccess.set(false);

    if (!this.currentPassword() || !this.newPassword() || !this.confirmPassword()) {
      this.passwordError.set('Please fill in all three fields.');
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.passwordError.set('New password and confirmation do not match.');
      return;
    }
    if (this.newPassword().length < 8) {
      this.passwordError.set('New password must be at least 8 characters.');
      return;
    }

    this.savingPassword.set(true);
    try {
      await this.auth.changeEmployeePassword(this.currentPassword(), this.newPassword(), this.confirmPassword());
      this.currentPassword.set('');
      this.newPassword.set('');
      this.confirmPassword.set('');
      this.passwordSuccess.set(true);
    } catch (e: any) {
      this.passwordError.set(e?.error?.text ?? e?.error ?? 'Could not change password — check your current password and try again.');
    } finally {
      this.savingPassword.set(false);
    }
  }
}
