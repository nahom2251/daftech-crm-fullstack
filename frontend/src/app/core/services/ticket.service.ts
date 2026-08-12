import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Ticket, TicketCategory, TicketStatus, PagedResult } from '../models';
import { API_BASE_URL } from './api-base';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly _tickets = signal<Ticket[]>([]);
  readonly tickets = this._tickets.asReadonly();

  // A logged-in client's own tickets, fetched via the client-scoped
  // endpoint. Kept separate from _tickets (the staff-only full list, which
  // 403s for a client token) so the portal never depends on that call
  // succeeding.
  private readonly _myTickets = signal<Ticket[]>([]);
  readonly myTickets = this._myTickets.asReadonly();

  // Paged state for the "All Tickets" table. Kept separate from the
  // full-list cache above, which reports/escalated/dashboards rely on
  // for filtering and counts and must stay complete.
  private readonly _page = signal(1);
  private readonly _pageSize = signal(20);
  private readonly _totalCount = signal(0);
  private readonly _totalPages = signal(0);
  private readonly _pagedTickets = signal<Ticket[]>([]);
  readonly pagedTickets = this._pagedTickets.asReadonly();
  readonly page = this._page.asReadonly();
  readonly pageSize = this._pageSize.asReadonly();
  readonly totalCount = this._totalCount.asReadonly();
  readonly totalPages = this._totalPages.asReadonly();

  constructor(private http: HttpClient, private auth: AuthService) {
    // /tickets and /tickets/paged are staff-only (AnyEmployee) on the API —
    // calling them with a client token always 403s. Only auto-fetch the
    // full list for a logged-in employee; the client portal fetches its
    // own tickets explicitly via refreshMyTickets() instead.
    if (this.auth.isStaffAuthenticated()) {
      void this.refresh();
      void this.refreshPaged();
    }
  }

  async refresh(): Promise<void> {
    const list = await firstValueFrom(this.http.get<Ticket[]>(`${API_BASE_URL}/tickets`));
    this._tickets.set(list);
  }

  /** Fetches one page of tickets for the table UI. Defaults to the current page/pageSize. */
  async refreshPaged(page = this._page(), pageSize = this._pageSize()): Promise<void> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    const result = await firstValueFrom(
      this.http.get<PagedResult<Ticket>>(`${API_BASE_URL}/tickets/paged`, { params })
    );
    this._page.set(result.page);
    this._pageSize.set(result.pageSize);
    this._totalCount.set(result.totalCount);
    this._totalPages.set(result.totalPages);
    this._pagedTickets.set(result.items);
  }

  async goToPage(page: number): Promise<void> {
    await this.refreshPaged(page);
  }

  getById(id: string): Ticket | undefined {
    return this._tickets().find(t => t.id === id) ?? this._myTickets().find(t => t.id === id);
  }

  /**
   * Fetches the logged-in client's own tickets via the client-scoped API
   * endpoint (GET /tickets/client/{id}), which any authenticated client
   * may call. Call this from the client portal instead of relying on
   * forClient() over the staff-only full list.
   */
  async refreshMyTickets(clientId: string): Promise<void> {
    const list = await firstValueFrom(this.http.get<Ticket[]>(`${API_BASE_URL}/tickets/client/${clientId}`));
    this._myTickets.set(list);
  }

  /** Client-side filter/sort over myTickets() — call refreshMyTickets() first to populate it. */
  forClient(clientId: string): Ticket[] {
    return this._myTickets()
      .filter(t => t.clientId === clientId)
      .sort((a, b) => b.dateSubmitted.localeCompare(a.dateSubmitted));
  }

  forEmployee(employeeId: string): Ticket[] {
    return this._tickets().filter(t => t.assignedEmployeeId === employeeId);
  }

  /** Tickets resolved and waiting on the client's confirmation + rating. */
  awaitingConfirmationForClient(clientId: string): Ticket[] {
    return this._myTickets().filter(t => t.clientId === clientId && t.status === 'AwaitingClientConfirmation');
  }

  /** Admin's review queue — tickets the client rated below the satisfaction threshold. */
  escalated(): Ticket[] {
    return this._tickets().filter(t => t.status === 'Escalated');
  }

  openTicketCountByEmployee(): Record<string, number> {
    const open: TicketStatus[] = ['Assigned', 'InProgress'];
    const counts: Record<string, number> = {};
    for (const t of this._tickets()) {
      if (t.assignedEmployeeId && open.includes(t.status)) {
        counts[t.assignedEmployeeId] = (counts[t.assignedEmployeeId] ?? 0) + 1;
      }
    }
    return counts;
  }

  /**
   * Client submits an issue via the portal. The API auto-assigns it to the
   * technician with the fewest open tickets immediately on submission —
   * there is no separate forward/assign step (ItSupport, which used to
   * do this manually, is retired; Admin handles everything directly now).
   * voiceNote, if provided, must come from uploadVoiceNote() below — record
   * and upload the audio first, then pass the returned key/name here so
   * it's attached to the ticket atomically on creation.
   */
  async submitFromClient(
    clientId: string,
    agreementId: string,
    description: string,
    category: TicketCategory,
    failureTypeId?: string,
    voiceNote?: { storageKey: string; fileName: string }
  ): Promise<Ticket> {
    const ticket = await firstValueFrom(
      this.http.post<Ticket>(`${API_BASE_URL}/tickets`, {
        clientId,
        agreementId,
        description,
        category,
        failureTypeId,
        voiceNoteStorageKey: voiceNote?.storageKey,
        voiceNoteFileName: voiceNote?.fileName,
      })
    );
    // Refresh whichever cache the caller actually has access to — a client
    // token can't call refresh()/refreshPaged() (staff-only, 403), so only
    // do those for an employee; always refresh the client's own list.
    if (this.auth.isStaffAuthenticated()) {
      await Promise.all([this.refresh(), this.refreshPaged()]);
    }
    await this.refreshMyTickets(clientId);
    return ticket;
  }

  /**
   * Uploads a voice-note recording ahead of submitting the ticket it will
   * belong to — call this first, then pass the result into
   * submitFromClient()'s voiceNote parameter. Any authenticated client may
   * call this; there's no ticket to check ownership against yet.
   */
  async uploadVoiceNote(blob: Blob, fileName: string): Promise<{ storageKey: string; fileName: string }> {
    const form = new FormData();
    form.append('file', blob, fileName);
    const result = await firstValueFrom(
      this.http.post<{ storageKey: string; fileName: string }>(`${API_BASE_URL}/tickets/voice-note`, form)
    );
    return result;
  }

  /** Fetches the ticket's voice-note recording as a Blob for playback — same access rule as downloadAttachment. */
  async downloadVoiceNote(ticketId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${API_BASE_URL}/tickets/${ticketId}/voice-note`, { responseType: 'blob' })
    );
  }

  /**
   * Employee updates ticket status. Setting 'Resolved' does not close the
   * ticket — the API moves it to AwaitingClientConfirmation and starts the
   * client's response window instead.
   */
  async updateStatus(ticketId: string, status: TicketStatus, actorName: string): Promise<void> {
    await firstValueFrom(this.http.patch<Ticket>(`${API_BASE_URL}/tickets/${ticketId}/status`, { status, actorName }));
    await Promise.all([this.refresh(), this.refreshPaged()]);
  }

  /**
   * Client confirms the fix and rates it 1-5 stars. The API converts to a
   * 0-100 score; >= 90 closes the ticket, below that escalates it to Admin.
   */
  /**
   * Client answers whether the issue is fixed first. If isFixed is false,
   * satisfactionStars is ignored and the ticket reopens to the employee —
   * no rating is recorded. If true, satisfactionStars (1-5) is required.
   */
  async confirmResolution(ticketId: string, isFixed: boolean, satisfactionStars?: number): Promise<Ticket> {
    const ticket = await firstValueFrom(
      this.http.post<Ticket>(`${API_BASE_URL}/tickets/${ticketId}/confirm`, { isFixed, satisfactionStars })
    );
    // Same as submitFromClient — refresh() is staff-only; a client caller
    // refreshes their own list via ticket.clientId instead.
    if (this.auth.isStaffAuthenticated()) {
      await Promise.all([this.refresh(), this.refreshPaged()]);
    } else {
      await this.refreshMyTickets(ticket.clientId);
    }
    return ticket;
  }

  /**
   * Uploads (or replaces) the ticket's optional attachment — typically a
   * screenshot of the error/console being reported. Server-side enforces
   * who may do this (owning client, assigned technician, or Admin) — a
   * 404 here most likely means the caller isn't authorized, not that the
   * ticket is missing.
   */
  async uploadAttachment(ticketId: string, file: File): Promise<Ticket> {
    const form = new FormData();
    form.append('file', file, file.name);
    const ticket = await firstValueFrom(
      this.http.post<Ticket>(`${API_BASE_URL}/tickets/${ticketId}/attachment`, form)
    );
    if (this.auth.isStaffAuthenticated()) {
      await Promise.all([this.refresh(), this.refreshPaged()]);
    } else {
      await this.refreshMyTickets(ticket.clientId);
    }
    return ticket;
  }

  /** Fetches the attachment as a Blob for download/preview — same access rule as uploadAttachment. */
  async downloadAttachment(ticketId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${API_BASE_URL}/tickets/${ticketId}/attachment`, { responseType: 'blob' })
    );
  }
}
