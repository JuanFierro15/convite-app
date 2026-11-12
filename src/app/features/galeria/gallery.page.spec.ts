import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import {
  ActionSheetController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import {
  AuthService,
  EventContextService,
  NetworkStatusService,
  RealtimeService,
} from '../../core';
import { CameraPermissionService } from '../../core/photos/camera-permission.service';
import { PhotoCacheService } from '../../core/photos/photo-cache.service';
import { PhotoCaptureService } from '../../core/photos/photo-capture.service';
import { PhotoUploadService } from '../../core/photos/photo-upload.service';
import { EventPhoto, PhotoUpload } from '../../core/photos/photo.models';
import { PhotosRepository } from '../../core/photos/photos.repository';
import { GalleryPage } from './gallery.page';
import { PhotoViewerComponent } from './visor/photo-viewer.component';

describe('GalleryPage', () => {
  let fixture: ComponentFixture<GalleryPage>;
  let component: GalleryPage;

  let mockEventContext: {
    load: ReturnType<typeof vi.fn>;
    isOwner: ReturnType<typeof signal<boolean>>;
  };
  let mockPhotosRepo: {
    list: ReturnType<typeof vi.fn>;
  };
  let mockPhotoCache: {
    getUrl: ReturnType<typeof vi.fn>;
    peek: ReturnType<typeof vi.fn>;
    forget: ReturnType<typeof vi.fn>;
  };
  let mockPhotoUpload: {
    uploadsFor: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
    retry: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };
  let mockPhotoCapture: {
    takePhoto: ReturnType<typeof vi.fn>;
    chooseFromGallery: ReturnType<typeof vi.fn>;
  };
  let mockCameraPermission: {
    isNative: ReturnType<typeof vi.fn>;
    openAppSettings: ReturnType<typeof vi.fn>;
  };
  let mockNetworkStatus: {
    online: ReturnType<typeof signal<boolean>>;
  };
  let mockRealtime: {
    watch: ReturnType<typeof vi.fn>;
  };
  let mockAuth: {
    user: ReturnType<typeof signal<{ id: string } | null>>;
  };
  let mockModalCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockActionSheetCtrl: {
    create: ReturnType<typeof vi.fn>;
  };
  let mockToastCtrl: {
    create: ReturnType<typeof vi.fn>;
  };

  let uploadsSignal: ReturnType<typeof signal<PhotoUpload[]>>;
  let mockStopRealtime: ReturnType<typeof vi.fn>;

  const samplePhotos: EventPhoto[] = [
    {
      id: 'photo-1',
      eventId: 'evt-1',
      uploadedBy: 'user-1',
      uploaderName: 'Juan',
      uploaderRole: 'owner',
      createdAt: '2026-11-29T16:12:00-05:00',
      width: 1600,
      height: 1200,
      sizeBytes: 150000,
      photoPath: 'evt-1/photo-1.jpg',
      thumbPath: 'evt-1/photo-1_thumb.jpg',
    },
  ];

  beforeEach(async () => {
    uploadsSignal = signal<PhotoUpload[]>([]);
    mockStopRealtime = vi.fn();

    mockEventContext = {
      load: vi.fn().mockResolvedValue(undefined),
      isOwner: signal<boolean>(true),
    };
    mockPhotosRepo = {
      list: vi.fn().mockResolvedValue([...samplePhotos]),
    };
    mockPhotoCache = {
      getUrl: vi.fn().mockResolvedValue('blob:photo-thumb'),
      peek: vi.fn().mockReturnValue('blob:photo-thumb'),
      forget: vi.fn(),
    };
    mockPhotoUpload = {
      uploadsFor: vi.fn().mockReturnValue(uploadsSignal),
      enqueue: vi.fn().mockResolvedValue({ uploaded: 1, failed: 0 }),
      retry: vi.fn().mockResolvedValue(true),
      dismiss: vi.fn(),
    };
    mockPhotoCapture = {
      takePhoto: vi.fn().mockResolvedValue({ status: 'cancelled' }),
      chooseFromGallery: vi.fn().mockResolvedValue({ status: 'cancelled' }),
    };
    mockCameraPermission = {
      isNative: vi.fn().mockReturnValue(true),
      openAppSettings: vi.fn().mockResolvedValue(true),
    };
    mockNetworkStatus = {
      online: signal<boolean>(true),
    };
    mockRealtime = {
      watch: vi.fn().mockReturnValue(mockStopRealtime),
    };
    mockAuth = {
      user: signal<{ id: string } | null>({ id: 'user-1' }),
    };
    mockModalCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
        onDidDismiss: vi.fn().mockResolvedValue({ data: { deleted: [] } }),
      }),
    };
    mockActionSheetCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };
    mockToastCtrl = {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    };

    await TestBed.configureTestingModule({
      imports: [GalleryPage],
      providers: [
        provideRouter([]),
        { provide: EventContextService, useValue: mockEventContext },
        { provide: PhotosRepository, useValue: mockPhotosRepo },
        { provide: PhotoCacheService, useValue: mockPhotoCache },
        { provide: PhotoUploadService, useValue: mockPhotoUpload },
        { provide: PhotoCaptureService, useValue: mockPhotoCapture },
        { provide: CameraPermissionService, useValue: mockCameraPermission },
        { provide: NetworkStatusService, useValue: mockNetworkStatus },
        { provide: RealtimeService, useValue: mockRealtime },
        { provide: AuthService, useValue: mockAuth },
        { provide: ModalController, useValue: mockModalCtrl },
        { provide: ActionSheetController, useValue: mockActionSheetCtrl },
        { provide: ToastController, useValue: mockToastCtrl },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GalleryPage);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('id', 'evt-1');
  });

  afterEach(() => {
    PhotoViewerComponent.activeInstance = null;
  });

  it('muestra el contador "1 de 300" y carga miniaturas', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const pill = fixture.debugElement.query(By.css('.pill'));
    expect(pill.nativeElement.textContent.trim()).toBe('1 de 300');

    expect(mockPhotosRepo.list).toHaveBeenCalledWith('evt-1');
    expect(mockRealtime.watch).toHaveBeenCalledWith(
      'evt-1',
      ['event_photos'],
      expect.any(Function),
      expect.anything(),
    );
  });

  it('muestra estado vacío con app-empty-state cuando no hay fotos ni subidas', async () => {
    mockPhotosRepo.list.mockResolvedValue([]);
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const emptyState = fixture.debugElement.query(By.css('app-empty-state'));
    expect(emptyState).toBeTruthy();
    expect(emptyState.nativeElement.textContent).toContain(
      'Todavía no hay fotos. Sube la primera desde la fiesta.',
    );
  });

  it('muestra error y botón Reintentar cuando falla la carga inicial', async () => {
    mockPhotosRepo.list.mockRejectedValue(new Error('Falla de red'));
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const errorEl = fixture.debugElement.query(By.css('.gallery-error'));
    expect(errorEl).toBeTruthy();
    expect(errorEl.nativeElement.textContent).toContain('No pudimos cargar las fotos.');

    const retryBtn = errorEl.query(By.css('ion-button'));
    expect(retryBtn.nativeElement.textContent.trim()).toBe('Reintentar');

    mockPhotosRepo.list.mockResolvedValue([...samplePhotos]);
    retryBtn.nativeElement.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.gallery-error'))).toBeNull();
  });

  it('en la web no aparece el botón "+" y sí el texto indicativo', async () => {
    mockCameraPermission.isNative.mockReturnValue(false);
    const webFixture = TestBed.createComponent(GalleryPage);
    webFixture.componentRef.setInput('id', 'evt-1');
    webFixture.componentInstance.ionViewWillEnter();
    await webFixture.whenStable();
    webFixture.detectChanges();

    const fab = webFixture.debugElement.query(By.css('ion-fab'));
    expect(fab).toBeNull();

    const notice = webFixture.debugElement.query(By.css('.web-notice'));
    expect(notice).toBeTruthy();
    expect(notice.nativeElement.textContent.trim()).toBe(
      'Para subir fotos usa la app en el celular',
    );
  });

  it('sin conexión muestra el toast exacto y no abre la hoja de agregar', async () => {
    mockNetworkStatus.online.set(false);
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    await component.handleAddPhotoClick();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Sin conexión. Conéctate para subir fotos.',
        color: 'danger',
      }),
    );
    expect(mockActionSheetCtrl.create).not.toHaveBeenCalled();
  });

  it('al tope de 300 fotos muestra el toast exacto y no abre la hoja', async () => {
    const fullList = Array.from({ length: 300 }, (_, i) => ({
      ...samplePhotos[0],
      id: `photo-${i}`,
    }));
    mockPhotosRepo.list.mockResolvedValue(fullList);

    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    await component.handleAddPhotoClick();

    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'La galería llegó al límite de 300 fotos.',
        color: 'danger',
      }),
    );
    expect(mockActionSheetCtrl.create).not.toHaveBeenCalled();
  });

  it('abre la hoja con "Tomar foto" y "Elegir de la galería" cuando está online y no está al tope', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    await component.handleAddPhotoClick();

    expect(mockActionSheetCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        header: 'Agregar fotos',
        buttons: expect.arrayContaining([
          expect.objectContaining({ text: 'Tomar foto' }),
          expect.objectContaining({ text: 'Elegir de la galería' }),
          expect.objectContaining({ text: 'Cancelar', role: 'cancel' }),
        ]),
      }),
    );
  });

  it('cuando tomar foto es cancelado no muestra nada', async () => {
    mockPhotoCapture.takePhoto.mockResolvedValue({ status: 'cancelled' });
    component.ionViewWillEnter();
    await fixture.whenStable();

    await component.handleTakePhoto();

    expect(mockPhotoUpload.enqueue).not.toHaveBeenCalled();
    expect(mockToastCtrl.create).not.toHaveBeenCalled();
  });

  it('cuando permiso es permanently-denied abre el modal de aviso con "La cámara está bloqueada"', async () => {
    mockPhotoCapture.takePhoto.mockResolvedValue({
      status: 'permission-permanently-denied',
    });
    component.ionViewWillEnter();
    await fixture.whenStable();

    await component.handleTakePhoto();

    expect(component.permissionModalOpen()).toBe(true);
    expect(component.permissionKind()).toBe('permanently-denied');
  });

  it('cuando captura es exitosa encola, recarga y muestra toast con "Foto subida"', async () => {
    mockPhotoCapture.takePhoto.mockResolvedValue({
      status: 'captured',
      photos: [{ webPath: 'file:///photo.jpg' }],
    });
    mockPhotoUpload.enqueue.mockResolvedValue({ uploaded: 1, failed: 0 });

    component.ionViewWillEnter();
    await fixture.whenStable();

    await component.handleTakePhoto();

    expect(mockPhotoUpload.enqueue).toHaveBeenCalledWith('evt-1', [
      { webPath: 'file:///photo.jpg' },
    ]);
    expect(mockPhotosRepo.list).toHaveBeenCalledTimes(2); // Carga inicial + recarga
    expect(mockToastCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Foto subida',
        color: 'success',
      }),
    );
  });

  it('al tocar una miniatura abre el visor con ModalController', async () => {
    component.ionViewWillEnter();
    await fixture.whenStable();
    fixture.detectChanges();

    const photoBtn = fixture.debugElement.query(By.css('.photo-tile-btn'));
    expect(photoBtn).toBeTruthy();

    photoBtn.nativeElement.click();

    expect(mockModalCtrl.create).toHaveBeenCalledWith(
      expect.objectContaining({
        component: PhotoViewerComponent,
        componentProps: {
          photos: component.photos(),
          startIndex: 0,
          eventId: 'evt-1',
        },
        cssClass: 'photo-viewer-modal',
      }),
    );
  });
});
