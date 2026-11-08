import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { SupabaseService } from '../supabase/supabase.service';
import { RealtimeService, RealtimeTable } from './realtime.service';

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(),
  },
}));

interface PostgresChangesBinding {
  type: string;
  options: {
    event: string;
    schema: string;
    table: string;
    filter?: string;
  };
  callback: () => void;
}

class FakeRealtimeChannel {
  readonly bindings: PostgresChangesBinding[] = [];
  subscribeCallback: ((status: string) => void) | null = null;

  constructor(readonly name: string) {}

  on(type: string, options: PostgresChangesBinding['options'], callback: () => void): this {
    this.bindings.push({ type, options, callback });
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    if (callback) {
      this.subscribeCallback = callback;
    }
    return this;
  }

  emit(table: string, event: 'INSERT' | 'UPDATE' | 'DELETE'): void {
    for (const binding of this.bindings) {
      if (binding.options.table === table && binding.options.event === event) {
        binding.callback();
      }
    }
  }

  emitStatus(status: string): void {
    this.subscribeCallback?.(status);
  }
}

describe('RealtimeService', () => {
  let service: RealtimeService;
  let fakeChannel: FakeRealtimeChannel;
  let mockSupabase: {
    client: {
      channel: ReturnType<typeof vi.fn>;
      removeChannel: ReturnType<typeof vi.fn>;
    };
  };
  const listener = {
    onChange: (): void => {},
  };
  let onChangeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onChangeSpy = vi.spyOn(listener, 'onChange').mockImplementation(() => {});

    mockSupabase = {
      client: {
        channel: vi.fn().mockImplementation((name: string) => {
          fakeChannel = new FakeRealtimeChannel(name);
          return fakeChannel;
        }),
        removeChannel: vi.fn().mockResolvedValue('ok'),
      },
    };

    TestBed.configureTestingModule({
      providers: [
        RealtimeService,
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    });

    service = TestBed.inject(RealtimeService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('configures filters correctly: events uses id=eq.<eventId>, others use event_id=eq.<eventId>, DELETE has no filter', () => {
    const tables: RealtimeTable[] = ['events', 'guests', 'tasks'];
    service.watch('evt-123', tables, listener.onChange);

    expect(mockSupabase.client.channel).toHaveBeenCalledWith(
      expect.stringMatching(/^event-evt-123-\d+-\d+$/),
    );

    const eventsInsert = fakeChannel.bindings.find(
      (b) => b.options.table === 'events' && b.options.event === 'INSERT',
    );
    expect(eventsInsert?.options.filter).toBe('id=eq.evt-123');

    const eventsUpdate = fakeChannel.bindings.find(
      (b) => b.options.table === 'events' && b.options.event === 'UPDATE',
    );
    expect(eventsUpdate?.options.filter).toBe('id=eq.evt-123');

    const eventsDelete = fakeChannel.bindings.find(
      (b) => b.options.table === 'events' && b.options.event === 'DELETE',
    );
    expect(eventsDelete?.options.filter).toBeUndefined();

    const guestsInsert = fakeChannel.bindings.find(
      (b) => b.options.table === 'guests' && b.options.event === 'INSERT',
    );
    expect(guestsInsert?.options.filter).toBe('event_id=eq.evt-123');

    const guestsUpdate = fakeChannel.bindings.find(
      (b) => b.options.table === 'guests' && b.options.event === 'UPDATE',
    );
    expect(guestsUpdate?.options.filter).toBe('event_id=eq.evt-123');

    const guestsDelete = fakeChannel.bindings.find(
      (b) => b.options.table === 'guests' && b.options.event === 'DELETE',
    );
    expect(guestsDelete?.options.filter).toBeUndefined();

    const tasksInsert = fakeChannel.bindings.find(
      (b) => b.options.table === 'tasks' && b.options.event === 'INSERT',
    );
    expect(tasksInsert?.options.filter).toBe('event_id=eq.evt-123');

    const tasksDelete = fakeChannel.bindings.find(
      (b) => b.options.table === 'tasks' && b.options.event === 'DELETE',
    );
    expect(tasksDelete?.options.filter).toBeUndefined();
  });

  it('debounces three consecutive changes to a single onChange call at 300 ms', () => {
    service.watch('evt-123', ['guests'], listener.onChange);

    fakeChannel.emit('guests', 'INSERT');
    fakeChannel.emit('guests', 'UPDATE');
    fakeChannel.emit('guests', 'DELETE');

    expect(onChangeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(onChangeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('does not call onChange on the first SUBSCRIBED status', () => {
    service.watch('evt-123', ['guests'], listener.onChange);

    fakeChannel.emitStatus('SUBSCRIBED');
    vi.advanceTimersByTime(500);

    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('calls onChange once after SUBSCRIBED -> CHANNEL_ERROR -> SUBSCRIBED reconnection', () => {
    service.watch('evt-123', ['guests'], listener.onChange);

    fakeChannel.emitStatus('SUBSCRIBED');
    vi.advanceTimersByTime(500);
    expect(onChangeSpy).not.toHaveBeenCalled();

    fakeChannel.emitStatus('CHANNEL_ERROR');
    vi.advanceTimersByTime(500);
    expect(onChangeSpy).not.toHaveBeenCalled();

    fakeChannel.emitStatus('SUBSCRIBED');
    expect(onChangeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('recovers and calls onChange when reconnecting after TIMED_OUT or CLOSED', () => {
    service.watch('evt-123', ['guests'], listener.onChange);

    fakeChannel.emitStatus('SUBSCRIBED');
    vi.advanceTimersByTime(300);

    fakeChannel.emitStatus('TIMED_OUT');
    fakeChannel.emitStatus('SUBSCRIBED');
    vi.advanceTimersByTime(300);
    expect(onChangeSpy).toHaveBeenCalledTimes(1);

    fakeChannel.emitStatus('CLOSED');
    fakeChannel.emitStatus('SUBSCRIBED');
    vi.advanceTimersByTime(300);
    expect(onChangeSpy).toHaveBeenCalledTimes(2);
  });

  it('calls onChange on visibilitychange when tab is visible, and does not when hidden', () => {
    service.watch('evt-123', ['guests'], listener.onChange);

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
      writable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(500);
    expect(onChangeSpy).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
      writable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onChangeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(onChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('cleanup calls removeChannel, removes listeners, is idempotent, and blocks subsequent callbacks', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
    const cleanup = service.watch('evt-123', ['guests'], listener.onChange);

    cleanup();

    expect(mockSupabase.client.removeChannel).toHaveBeenCalledTimes(1);
    expect(mockSupabase.client.removeChannel).toHaveBeenCalledWith(fakeChannel);
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function),
    );

    cleanup();
    expect(mockSupabase.client.removeChannel).toHaveBeenCalledTimes(1);

    fakeChannel.emit('guests', 'INSERT');
    fakeChannel.emitStatus('SUBSCRIBED');
    fakeChannel.emitStatus('CHANNEL_ERROR');
    fakeChannel.emitStatus('SUBSCRIBED');
    document.dispatchEvent(new Event('visibilitychange'));

    vi.advanceTimersByTime(1000);
    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('cleans up Capacitor resume listener handle on native platform', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const removeSpy = vi.fn().mockResolvedValue(undefined);
    const resumeCallbacks: (() => void)[] = [];

    vi.spyOn(App, 'addListener').mockImplementation((eventName: string, listener: any) => {
      if (eventName === 'resume') {
        resumeCallbacks.push(listener as () => void);
      }
      return Promise.resolve({ remove: removeSpy } as unknown as PluginListenerHandle);
    });

    const cleanup = service.watch('evt-123', ['guests'], listener.onChange);
    await Promise.resolve();

    expect(App.addListener).toHaveBeenCalledWith('resume', expect.any(Function));

    for (const cb of resumeCallbacks) {
      cb();
    }
    vi.advanceTimersByTime(300);
    expect(onChangeSpy).toHaveBeenCalledTimes(1);

    cleanup();
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('removes Capacitor resume listener handle if cleanup ran before the addListener promise resolved', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    const removeSpy = vi.fn().mockResolvedValue(undefined);
    let resolveListenerPromise: ((handle: PluginListenerHandle) => void) | undefined;
    const addListenerPromise = new Promise<PluginListenerHandle>((resolve) => {
      resolveListenerPromise = resolve;
    });

    vi.spyOn(App, 'addListener').mockReturnValue(addListenerPromise as any);

    const cleanup = service.watch('evt-123', ['guests'], listener.onChange);

    cleanup();
    expect(removeSpy).not.toHaveBeenCalled();

    if (resolveListenerPromise) {
      resolveListenerPromise({ remove: removeSpy } as unknown as PluginListenerHandle);
    }
    await addListenerPromise;
    await Promise.resolve();

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('executes cleanup when provided DestroyRef is destroyed', () => {
    const destroyCallbacks: (() => void)[] = [];
    const mockDestroyRef = {
      onDestroy: vi.fn((cb: () => void) => {
        destroyCallbacks.push(cb);
        return () => {};
      }),
    } as unknown as DestroyRef;

    service.watch('evt-123', ['guests'], listener.onChange, mockDestroyRef);

    expect(mockDestroyRef.onDestroy).toHaveBeenCalled();
    expect(mockSupabase.client.removeChannel).not.toHaveBeenCalled();

    for (const cb of destroyCallbacks) {
      cb();
    }
    expect(mockSupabase.client.removeChannel).toHaveBeenCalledWith(fakeChannel);
  });
});
