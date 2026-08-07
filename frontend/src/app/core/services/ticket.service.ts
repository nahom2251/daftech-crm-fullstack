import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Ticket, TicketCategory, TicketStatus, PagedResult } from '../models';
import { API_BASE_URL } from './api-base';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly _tickets = signal<Ticket[]>([]);
  readonly tickets = this._tickets.asReadonly();

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

  constructor(private http: HttpClient) {
    void this.refresh();
    void this.refreshPaged();
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
    return this._tickets().find(t => t.id === id);
  }

  forClient(clientId: string): Ticket[] {
    return this._tickets()
      .filter(t => t.clientId === clientId)
      .sort((a, b) => b.dateSubmitted.localeCompare(a.dateSubmitted));
  }

  forEmployee(employeeId: string): Ticket[] {
    return this._tickets().filter(t => t.assignedEmployeeId === employeeId);
  }

  /** Tickets resolved and waiting on the client's confirmation + rating. */
  awaitingConfirmationForClient(clientId: string): Ticket[] {
    return this._tickets().filter(t => t.clientId === clientId && t.status === 'AwaitingClientConfirmation');
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

  /** Client submits an issue via the portal. */
  async submitFromClient(clientId: string, agreementId: string, description: string, category: TicketCategory, failureTypeId?: string): Promise<Ticket> {
    const ticket = await firstValueFrom(
      this.http.post<Ticket>(`${API_BASE_URL}/tickets`, { clientId, agreementId, description, category, failureTypeId })
    );
    await Promise.all([this.refresh(), this.refreshPaged()]);
    return ticket;
  }

  /**
   * IT Support forwards a submitted ticket. The API auto-assigns it to the
   * employee with the fewest open tickets in the same request — there is
   * no separate "assign" call; the Admin does not choose the assignee.
   */
  async forward(ticketId: string, byEmployeeId: string): Promise<void> {
    await firstValueFrom(this.http.post<Ticket>(`${API_BASE_URL}/tickets/${ticketId}/forward`, { forwardedByEmployeeId: byEmployeeId }));
    await Promise.all([this.refresh(), this.refreshPaged()]);
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
    await Promise.all([this.refresh(), this.refreshPaged()]);
    return ticket;
  }
}
