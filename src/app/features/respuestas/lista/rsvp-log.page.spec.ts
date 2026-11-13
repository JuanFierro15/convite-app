import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import {
  RealtimeService,
  RsvpLogEntry,
  RsvpLogRepository,
} from '../../../core';
import { EmptyStateComponent, PaginationComponent } from '../../../shared';
import { RSVP_LOG_PAGE_SIZE, RsvpLogPage } from './rsvp-log.page';

describe('RsvpLogPage', () => {
  let fixture: ComponentFixture<RsvpLogPage>;
  let component: RsvpLogPage;
  let mockRsvpLogRepo: {
    list: ReturnType<typeof vi.fn>;
  };
  let mockRealtime: {
    watch: ReturnType<typeof vi.fn>;
  };
  let realtimeCallback: (() => void) | null = null;

  function makeMockEntry(id: string, name: string): RsvpLogEntry {
    return {
      id,
      invitation_id: `inv-${id}`,
      guest_id: `guest-${id}`,
      guest_name: name,
      group_name: `Grupo ${name}`,
      invitation_kind: 'group',
      previous_rsvp: 'pending',
      rsvp: 'accepted',
      source: 'guest',
      actor_name: null,
      created_at: '2026-11-07T14:50:00-05:00',
    };
  }

  beforeEach(async () => {
    mockRsvpLogRepo = {
      list: vi.fn().mockResolvedValue({ total: 0, items: [] }),
    };

    mockRealtime = {
      watch: vi.fn().mockImplementation((_eventId, _tables, onChange) => {
        realtimeCallback = onChange;
        return () => {
          realtimeCallback = null;
        };
      }),
    };

    await TestBed.configureTestingModule({
      imports: [RsvpLogPage],
      providers: [
        provideRouter([]),
        { provide: RsvpLogRepository, useValue: mockRsvpLogRepo },
        { provide: RealtimeService, useValue: mockRealtime },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RsvpLogPage);
    fixture.componentRef.setInput('id', 'event-123');
    component = fixture.componentInstance;
  });

  it('requests limit 10, offset 0 on initial enter', async () => {
    const items = [makeMockEntry('1', 'Persona 1'), makeMockEntry('2', 'Persona 2')];
    mockRsvpLogRepo.list.mockResolvedValue({ total: 2, items });

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockRsvpLogRepo.list).toHaveBeenCalledWith('event-123', {
      limit: RSVP_LOG_PAGE_SIZE,
      offset: 0,
    });
    expect(component.entries()).toHaveLength(2);
    expect(component.page()).toBe(1);
    expect(component.total()).toBe(2);
  });

  it('requests offset 10 when clicking next page', async () => {
    const page1Items = Array.from({ length: 10 }, (_, i) => makeMockEntry(`${i + 1}`, `Persona ${i + 1}`));
    const page2Items = [makeMockEntry('11', 'Persona 11')];

    mockRsvpLogRepo.list.mockResolvedValueOnce({ total: 11, items: page1Items });
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.page()).toBe(1);
    expect(component.totalPages()).toBe(2);

    mockRsvpLogRepo.list.mockResolvedValueOnce({ total: 11, items: page2Items });

    const paginationDebug = fixture.debugElement.query(By.directive(PaginationComponent));
    expect(paginationDebug).toBeTruthy();
    const paginationComponent = paginationDebug.componentInstance as PaginationComponent;
    paginationComponent.next.emit();

    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockRsvpLogRepo.list).toHaveBeenLastCalledWith('event-123', {
      limit: RSVP_LOG_PAGE_SIZE,
      offset: 10,
    });
    expect(component.page()).toBe(2);
    expect(component.entries()).toHaveLength(1);
  });

  it('renders total text in singular and plural', async () => {
    mockRsvpLogRepo.list.mockResolvedValueOnce({
      total: 1,
      items: [makeMockEntry('1', 'Persona 1')],
    });
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.totalText()).toBe('1 respuesta registrada');
    let labelEl = fixture.debugElement.query(By.css('.totals-label'));
    expect(labelEl.nativeElement.textContent.trim()).toBe('1 respuesta registrada');

    mockRsvpLogRepo.list.mockResolvedValueOnce({
      total: 5,
      items: Array.from({ length: 5 }, (_, i) => makeMockEntry(`${i + 1}`, `Persona ${i + 1}`)),
    });
    await component.loadPage(1);
    fixture.detectChanges();

    expect(component.totalText()).toBe('5 respuestas registradas');
    labelEl = fixture.debugElement.query(By.css('.totals-label'));
    expect(labelEl.nativeElement.textContent.trim()).toBe('5 respuestas registradas');
  });

  it('renders loading state on first load', () => {
    component.loading.set(true);
    component.entries.set([]);
    component.error.set(null);
    fixture.detectChanges();

    const spinner = fixture.debugElement.query(By.css('.loading-state ion-spinner'));
    expect(spinner).toBeTruthy();
    const text = fixture.debugElement.query(By.css('.loading-text'));
    expect(text.nativeElement.textContent).toContain('Cargando respuestas...');
  });

  it('renders error state and retries on action', async () => {
    mockRsvpLogRepo.list.mockRejectedValueOnce(new Error('Fallo de red'));
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const emptyStateDebug = fixture.debugElement.query(By.directive(EmptyStateComponent));
    expect(emptyStateDebug).toBeTruthy();
    const emptyState = emptyStateDebug.componentInstance as EmptyStateComponent;
    expect(emptyState.message()).toBe('Fallo de red');
    expect(emptyState.actionLabel()).toBe('Reintentar');

    mockRsvpLogRepo.list.mockResolvedValueOnce({
      total: 1,
      items: [makeMockEntry('1', 'Persona 1')],
    });
    await component.retryLoad();
    fixture.detectChanges();

    expect(component.error()).toBeNull();
    expect(component.entries()).toHaveLength(1);
  });

  it('renders empty state when total is 0', async () => {
    mockRsvpLogRepo.list.mockResolvedValue({ total: 0, items: [] });
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const emptyStateDebug = fixture.debugElement.query(By.directive(EmptyStateComponent));
    expect(emptyStateDebug).toBeTruthy();
    const emptyState = emptyStateDebug.componentInstance as EmptyStateComponent;
    expect(emptyState.message()).toBe('Todavía nadie ha respondido.');
    expect(emptyState.actionLabel()).toBeUndefined();
  });

  it('drops to the last valid page if current page exceeds total on reload', async () => {
    const page2Items = [makeMockEntry('11', 'Persona 11')];
    mockRsvpLogRepo.list.mockResolvedValueOnce({ total: 11, items: page2Items });

    component.ionViewWillEnter();
    await fixture.whenStable();
    component.page.set(2);

    const page1Items = Array.from({ length: 8 }, (_, i) => makeMockEntry(`${i + 1}`, `Persona ${i + 1}`));
    mockRsvpLogRepo.list
      .mockResolvedValueOnce({ total: 8, items: [] }) // response for targetPage 2 check
      .mockResolvedValueOnce({ total: 8, items: page1Items }); // response for targetPage 1 reload

    await component.reloadCurrentPage();
    fixture.detectChanges();

    expect(component.page()).toBe(1);
    expect(component.totalPages()).toBe(1);
    expect(component.entries()).toHaveLength(8);
  });

  it('watches realtime tables rsvp_log, guests and invitations and stops on leave', () => {
    component.ionViewWillEnter();
    expect(mockRealtime.watch).toHaveBeenCalledWith(
      'event-123',
      ['rsvp_log', 'guests', 'invitations'],
      expect.any(Function),
      expect.anything(),
    );

    component.ionViewWillLeave();
    expect(realtimeCallback).toBeNull();
  });
});
