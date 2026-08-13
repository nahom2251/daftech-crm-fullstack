import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Agreement, BillingTier, PagedResult } from '../models';
import { API_BASE_URL } from './api-base';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AgreementService {
  private readonly _agreements = signal<Agreement[]>([]);
  readonly agreements = this._agreements.asReadonly();

  // A logged-in client's own agreements, fetched via the client-scoped
  // endpoint. Kept separate from _agreements (the staff-only full list,
  // which 403s for a client token) so the portal never depends on that
  // call succeeding.
  private readonly _myAgreements = signal<Agreement[]>([]);
  readonly myAgreements = this._myAgreements.asReadonly();

  // Paged state for the Agreements table. Kept separate from the full-list
  // cache above, which forClient()/expiringSoon() still rely on.
  private readonly _page = signal(1);
  private readonly _pageSize = signal(20);
  private readonly _totalCount = signal(0);
  private readonly _totalPages = signal(0);
  private readonly _pagedAgreements = signal<Agreement[]>([]);
  readonly pagedAgreements = this._pagedAgreements.asReadonly();
  readonly page = this._page.asReadonly();
  readonly pageSize = this._pageSize.asReadonly();
  readonly totalCount = this._totalCount.asReadonly();
  readonly totalPages = this._totalPages.asReadonly();

  constructor(private http: HttpClient, private auth: AuthService) {
    // /agreements and /agreements/paged are staff-only (AnyEmployee) on the
    // API — calling them with a client token always 403s. Only auto-fetch
    // the full list for a logged-in employee; the client portal fetches
    // its own agreements explicitly via refreshMyAgreements() instead.
    if (this.auth.isStaffAuthenticated()) {
      void this.refresh();
      void this.refreshPaged();
    }
  }

  async refresh(): Promise<void> {
    const list = await firstValueFrom(this.http.get<Agreement[]>(`${API_BASE_URL}/agreements`));
    this._agreements.set(list);
  }

  async refreshPaged(page = this._page(), pageSize = this._pageSize()): Promise<void> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    const result = await firstValueFrom(
      this.http.get<PagedResult<Agreement>>(`${API_BASE_URL}/agreements/paged`, { params })
    );
    this._page.set(result.page);
    this._pageSize.set(result.pageSize);
    this._totalCount.set(result.totalCount);
    this._totalPages.set(result.totalPages);
    this._pagedAgreements.set(result.items);
  }

  async goToPage(page: number): Promise<void> {
    await this.refreshPaged(page);
  }

  getById(id: string): Agreement | undefined {
    return this._agreements().find(a => a.id === id) ?? this._myAgreements().find(a => a.id === id);
  }

  /**
   * Fetches the logged-in client's own agreements via the client-scoped
   * API endpoint (GET /agreements/client/{id}), which any authenticated
   * client may call. Call this from the client portal instead of relying
   * on forClient() over the staff-only full list.
   */
  async refreshMyAgreements(clientId: string): Promise<void> {
    const list = await firstValueFrom(this.http.get<Agreement[]>(`${API_BASE_URL}/agreements/client/${clientId}`));
    this._myAgreements.set(list);
  }

  /** Client-side filter over myAgreements() — call refreshMyAgreements() first to populate it. Intended for the client portal. */
  forClient(clientId: string): Agreement[] {
    return this._myAgreements().filter(a => a.clientId === clientId);
  }

  /**
   * Client-side filter over the staff-only full agreements list
   * (agreements()/refresh() above) — use this from staff pages like Client
   * Detail, where the current user is an Employee, not the Client. Using
   * forClient() (which reads _myAgreements, only ever populated for a
   * logged-in Client via refreshMyAgreements) here was the actual bug
   * behind the Client Detail page always showing "No agreements on file"
   * for staff: _myAgreements was simply never filled in for an employee
   * session, no matter how many agreements the client actually had.
   */
  forClientStaffView(clientId: string): Agreement[] {
    return this._agreements().filter(a => a.clientId === clientId);
  }

  /** Agreements expiring within 30 days, or already past expiry. */
  expiringSoon(): Agreement[] {
    const now = Date.now();
    const in30 = now + 30 * 24 * 3_600_000;
    return this._agreements().filter(a => new Date(a.expiryDate).getTime() <= in30);
  }

  /** Client-side mirror of the server's Agreement.IsWithinSupportWindow — used for optimistic UI only; the server is the source of truth for Chargeable. */
  isWithinSupportWindow(agreement: Agreement, atDate: Date = new Date()): boolean {
    const start = new Date(agreement.signDate);
    const windowEnd = new Date(start);
    windowEnd.setMonth(windowEnd.getMonth() + agreement.supportWindowMonths);
    return atDate >= start && atDate <= windowEnd;
  }

  async createAgreement(data: {
    clientId: string; agreementPlace: string;
    signDate: string; expiryDate?: string; supportWindowMonths: number; billingTier: BillingTier;
  }): Promise<Agreement> {
    const agreement = await firstValueFrom(this.http.post<Agreement>(`${API_BASE_URL}/agreements`, data));
    await Promise.all([this.refresh(), this.refreshPaged()]);
    return agreement;
  }

  /**
   * Uploads (or replaces) the scanned document for an already-created
   * agreement. Real multipart upload to the API's file storage — replaces
   * the old placeholder that just recorded a filename string without ever
   * sending the file anywhere.
   */
  async uploadScannedFile(agreementId: string, file: File): Promise<Agreement> {
    const form = new FormData();
    form.append('file', file, file.name);
    const updated = await firstValueFrom(
      this.http.post<Agreement>(`${API_BASE_URL}/agreements/${agreementId}/scanned-file`, form)
    );
    await Promise.all([this.refresh(), this.refreshPaged()]);
    return updated;
  }

  /** URL the browser can navigate to / open in a new tab to download the scanned document. The auth interceptor attaches the bearer token automatically for same-origin API calls; for a plain <a> tag use downloadScannedFile() instead. */
  scannedFileUrl(agreementId: string): string {
    return `${API_BASE_URL}/agreements/${agreementId}/scanned-file`;
  }

  /** Fetches the scanned document as a Blob (so it can be opened via an object URL) — needed because direct <a href> downloads wouldn't carry the Authorization header. */
  async downloadScannedFile(agreementId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${API_BASE_URL}/agreements/${agreementId}/scanned-file`, { responseType: 'blob' })
    );
  }

  /**
   * Uploads (or replaces) the scanned copy of the pre-agreement client
   * training document — a separate file from the signed agreement scan
   * above (see backend AgreementService.UploadTrainingScanAsync).
   */
  async uploadTrainingScan(agreementId: string, file: File): Promise<Agreement> {
    const form = new FormData();
    form.append('file', file, file.name);
    const updated = await firstValueFrom(
      this.http.post<Agreement>(`${API_BASE_URL}/agreements/${agreementId}/training-scan`, form)
    );
    await Promise.all([this.refresh(), this.refreshPaged()]);
    return updated;
  }

  /** Fetches the training scan as a Blob — same reasoning as downloadScannedFile above. */
  async downloadTrainingScan(agreementId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${API_BASE_URL}/agreements/${agreementId}/training-scan`, { responseType: 'blob' })
    );
  }

  /** Sets/updates the training description and timeline (start/end dates). All fields optional — can be filled in over time. */
  async updateTrainingInfo(
    agreementId: string,
    data: { trainingDescription?: string; trainingStartDate?: string; trainingEndDate?: string }
  ): Promise<Agreement> {
    const updated = await firstValueFrom(
      this.http.put<Agreement>(`${API_BASE_URL}/agreements/${agreementId}/training-info`, data)
    );
    await Promise.all([this.refresh(), this.refreshPaged()]);
    return updated;
  }
}
