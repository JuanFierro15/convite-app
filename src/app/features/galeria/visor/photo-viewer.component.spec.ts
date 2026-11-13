import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AlertController, ModalController, ToastController } from '@ionic/angular';
import { signal } from '@angular/core';
import { AuthService, EventContextService } from '../../../core';
import { PhotoCacheService } from '../../../core/photos/photo-cache.service';
import { EventPhoto } from '../../../core/photos/photo.models';
import { PhotosRepository } from '../../../core/photos/photos.repository';
import { PhotoViewerComponent } from './photo-viewer.component';

describe('PhotoViewerComponent', () => {
  let fixture: ComponentFixture<PhotoViewerComponent>;
  let component: PhotoViewerComponent;
  let resizeCallbacks: Array<() => void>;
  let disconnectSpy: ReturnType<typeof vi.fn>;

  let mockModalCtrl: {
    dismiss: ReturnType<typeof vi.fn>;
  };
  let mockAlertCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockAuth: {
    user: ReturnType<typeof signal<{ id: string } | null>>;
  };
  let mockEventContext: {
    isOwner: ReturnType<typeof signal<boolean>>;
  };
  let mockPhotoCache: {
    getUrl: ReturnType<typeof vi.fn>;
    peek: ReturnType<typeof vi.fn>;
    forget: ReturnType<typeof vi.fn>;
  };
  let mockPhotosRepo: {
    delete: ReturnType<typeof vi.fn>;
  };

  const samplePhotos: EventPhoto[] = [
    {
      id: 'photo-1',
      eventId: 'evt-1',
      uploadedBy: 'user-owner',
      uploaderName: 'Juan',
      uploaderRole: 'owner',
      createdAt: '2026-11-29T16:12:00-05:00',
      width: 1600,
      height: 1200,
      sizeBytes: 150000,
      photoPath: 'evt-1/photo-1.jpg',
      thumbPath: 'evt-1/photo-1_thumb.jpg',
    },
    {
      id: 'photo-2',
      eventId: 'evt-1',
      uploadedBy: 'user-helper',
      uploaderName: 'Carlos',
      uploaderRole: 'helper',
      createdAt: '2026-11-29T16:15:00-05:00',
      width: 1200,
      height: 1600,
      sizeBytes: 140000,
      photoPath: 'evt-1/photo-2.jpg',
      thumbPath: 'evt-1/photo-2_thumb.jpg',
    },
    {
      id: 'photo-3',
      eventId: 'evt-1',
      uploadedBy: 'user-owner',
      uploaderName: 'Juan',
      uploaderRole: 'owner',
      createdAt: '2026-11-29T16:20:00-05:00',
      width: 1600,
      height: 1200,
      sizeBytes: 160000,
      photoPath: 'evt-1/photo-3.jpg',
      thumbPath: 'evt-1/photo-3_thumb.jpg',
    },
  ];

  beforeEach(async () => {
    resizeCallbacks = [];
    disconnectSpy = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly cb: () => void) {
          resizeCallbacks.push(cb);
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {
          (disconnectSpy as () => void)();
        }
      },
    );

    mockModalCtrl = {
      dismiss: vi.fn().mockResolvedValue(true),
    };
    mockAlertCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };
    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };
    mockAuth = {
      user: signal<{ id: string } | null>({ id: 'user-owner' }),
    };
    mockEventContext = {
      isOwner: signal<boolean>(true),
    };
    mockPhotoCache = {
      getUrl: vi.fn().mockResolvedValue('blob:photo-url'),
      peek: vi.fn().mockReturnValue('blob:thumb-url'),
      forget: vi.fn(),
    };
    mockPhotosRepo = {
      delete: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [PhotoViewerComponent],
      providers: [
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: AlertController, useValue: mockAlertCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
        { provide: AuthService, useValue: mockAuth },
        { provide: EventContextService, useValue: mockEventContext },
        { provide: PhotoCacheService, useValue: mockPhotoCache },
        { provide: PhotosRepository, useValue: mockPhotosRepo },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PhotoViewerComponent);
    component = fixture.componentInstance;
    component.photos = [...samplePhotos];
    component.startIndex = 0;
    component.eventId = 'evt-1';
  });

  afterEach(() => {
    PhotoViewerComponent.activeInstance = null;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('muestra contador y botón cerrar al inicializar', async () => {
    fixture.detectChanges();

    const titleEl = fixture.debugElement.query(By.css('.viewer-counter'));
    expect(titleEl.nativeElement.textContent.trim()).toBe('1 de 3');

    const closeBtn = fixture.debugElement.query(By.css('.close-btn'));
    expect(closeBtn).toBeTruthy();

    closeBtn.nativeElement.click();
    expect(mockModalCtrl.dismiss).toHaveBeenCalledWith({ deleted: [] });
  });

  it('muestra el botón de borrar al propietario en cualquier foto', async () => {
    mockEventContext.isOwner.set(true);
    mockAuth.user.set({ id: 'user-owner' });
    fixture.detectChanges();

    const deleteBtn = fixture.debugElement.query(By.css('.delete-btn'));
    expect(deleteBtn).toBeTruthy();
  });

  it('muestra el botón de borrar al autor de la foto aunque no sea propietario', async () => {
    mockEventContext.isOwner.set(false);
    mockAuth.user.set({ id: 'user-helper' });
    component.startIndex = 1; // foto-2 es de user-helper
    fixture.detectChanges();

    const deleteBtn = fixture.debugElement.query(By.css('.delete-btn'));
    expect(deleteBtn).toBeTruthy();
  });

  it('NO muestra el botón de borrar a un ayudante en una foto ajena', async () => {
    mockEventContext.isOwner.set(false);
    mockAuth.user.set({ id: 'user-other-helper' });
    component.startIndex = 0; // foto-1 es de user-owner
    fixture.detectChanges();

    const deleteBtn = fixture.debugElement.query(By.css('.delete-btn'));
    expect(deleteBtn).toBeNull();
  });

  it('borrar pide confirmación y no borra si se cancela', async () => {
    mockEventContext.isOwner.set(true);
    fixture.detectChanges();

    await component.confirmDelete();

    expect(mockAlertCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: '¿Borrar esta foto?',
        message: 'Se borra para todos los del evento.',
        buttons: expect.arrayContaining([
          expect.objectContaining({ text: 'Cancelar', role: 'cancel' }),
          expect.objectContaining({ text: 'Borrar', role: 'destructive' }),
        ]),
      }),
    );

    expect(mockPhotosRepo.delete).not.toHaveBeenCalled();
  });

  it('borrar confirmado llama a delete, forget y muestra toast success', async () => {
    mockEventContext.isOwner.set(true);
    fixture.detectChanges();

    let confirmHandler: (() => void) | undefined;
    mockAlertCtrl.create.mockImplementation(async (options: { buttons?: Array<{ role?: string; handler?: () => void }> }) => {
      const destructiveBtn = options.buttons?.find((b) => b.role === 'destructive');
      confirmHandler = destructiveBtn?.handler;
      return { present: vi.fn().mockResolvedValue(undefined) };
    });

    await component.confirmDelete();
    expect(confirmHandler).toBeDefined();

    confirmHandler!();
    await fixture.whenStable();

    expect(mockPhotosRepo.delete).toHaveBeenCalledWith(samplePhotos[0]);
    expect(mockPhotoCache.forget).toHaveBeenCalledWith([
      samplePhotos[0].photoPath,
      samplePhotos[0].thumbPath,
    ]);
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Foto borrada',
        color: 'success',
      }),
    );
  });

  it('navega a foto anterior y siguiente con teclas de flecha', async () => {
    fixture.detectChanges();
    expect(component.currentIndex()).toBe(0);

    component.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(component.currentIndex()).toBe(1);

    component.handleKeyDown(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(component.currentIndex()).toBe(0);
  });

  it('syncPhotos actualiza la lista y se cierra si la lista queda vacía', async () => {
    fixture.detectChanges();

    component.syncPhotos([]);
    expect(mockModalCtrl.dismiss).toHaveBeenCalled();
  });

  it('syncPhotos pasa a índice válido si la foto actual fue borrada', async () => {
    fixture.detectChanges();
    component.goToPhoto(1);
    expect(component.currentIndex()).toBe(1);

    component.syncPhotos([samplePhotos[0]]);
    expect(component.currentIndex()).toBe(0);
  });

  it('ubica el carrusel en la foto tocada cuando el modal ya tiene ancho', () => {
    component.startIndex = 2;
    fixture.detectChanges();

    const sliderEl = fixture.debugElement.query(By.css('.photo-slider')).nativeElement as HTMLDivElement;
    resizeCallbacks.forEach((cb) => cb());
    expect(sliderEl.scrollLeft).toBe(0);

    Object.defineProperty(sliderEl, 'clientWidth', { configurable: true, value: 360 });
    resizeCallbacks.forEach((cb) => cb());
    expect(sliderEl.scrollLeft).toBe(720);
    expect(component.currentIndex()).toBe(2);
  });

  it('no cambia de foto por un scroll antes de ubicar el carrusel', () => {
    vi.useFakeTimers();
    component.startIndex = 2;
    fixture.detectChanges();

    component.onScroll();
    vi.advanceTimersByTime(50);
    expect(component.currentIndex()).toBe(2);
    vi.useRealTimers();
  });

  it('cambia de foto por un scroll después de ubicar el carrusel', () => {
    vi.useFakeTimers();
    component.startIndex = 2;
    fixture.detectChanges();

    const sliderEl = fixture.debugElement.query(By.css('.photo-slider')).nativeElement as HTMLDivElement;
    Object.defineProperty(sliderEl, 'clientWidth', { configurable: true, value: 360 });
    resizeCallbacks.forEach((cb) => cb());

    sliderEl.scrollLeft = 360;
    component.onScroll();
    vi.advanceTimersByTime(50);
    expect(component.currentIndex()).toBe(1);
    vi.useRealTimers();
  });

  it('desconecta el observador de tamaño al destruirse', () => {
    fixture.detectChanges();
    fixture.destroy();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('muestra el aviso con Reintentar cuando falla la descarga de la foto', async () => {
    mockPhotoCache.getUrl.mockRejectedValue(new Error('fallo'));
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();

    const firstSlide = fixture.debugElement.query(By.css('.photo-slide'));
    const errorText = firstSlide.query(By.css('.viewer-error__text'));
    expect(errorText.nativeElement.textContent.trim()).toBe('No pudimos cargar la foto.');

    const retryBtn = firstSlide.query(By.css('ion-button'));
    expect(retryBtn.nativeElement.textContent.trim()).toBe('Reintentar');

    const spinner = firstSlide.query(By.css('ion-spinner'));
    expect(spinner).toBeNull();
  });

  it('Reintentar vuelve a pedir la foto y la muestra', async () => {
    mockPhotoCache.getUrl.mockRejectedValue(new Error('fallo'));
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    const firstSlide = fixture.debugElement.query(By.css('.photo-slide'));
    const retryBtn = firstSlide.query(By.css('ion-button'));
    expect(retryBtn).toBeTruthy();

    mockPhotoCache.getUrl.mockResolvedValue('blob:photo-url');
    mockPhotoCache.getUrl.mockClear();

    retryBtn.nativeElement.click();
    await fixture.whenStable();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(mockPhotoCache.getUrl).toHaveBeenCalledTimes(1);
    expect(mockPhotoCache.getUrl).toHaveBeenCalledWith('evt-1/photo-1.jpg');

    const img = firstSlide.query(By.css('img.viewer-img'));
    expect(img).toBeTruthy();
    expect(img.nativeElement.src).toMatch(/blob:photo-url$/);

    const error = firstSlide.query(By.css('.viewer-error'));
    expect(error).toBeNull();
  });
});
