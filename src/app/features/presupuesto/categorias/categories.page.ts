import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
  ViewWillEnter,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  chevronDownOutline,
  chevronUpOutline,
  createOutline,
  sparklesOutline,
  trashOutline,
} from 'ionicons/icons';
import {
  BudgetRepository,
  EventContextService,
  ExpenseCategoryRow,
  toUserError,
} from '../../../core';
import { EmptyStateComponent } from '../../../shared';

@Component({
  selector: 'app-categories',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories.page.html',
  styleUrls: ['./categories.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonSpinner,
    EmptyStateComponent,
  ],
})
export class CategoriesPage implements ViewWillEnter {
  private readonly eventContext = inject(EventContextService);
  private readonly budgetRepo = inject(BudgetRepository);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly id = input.required<string>();

  readonly categories = signal<ExpenseCategoryRow[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly addingSuggested = signal<boolean>(false);
  readonly busy = signal<boolean>(false);

  constructor() {
    addIcons({
      add,
      sparklesOutline,
      createOutline,
      trashOutline,
      'chevron-up-outline': chevronUpOutline,
      'chevron-down-outline': chevronDownOutline,
      'create-outline': createOutline,
      'trash-outline': trashOutline,
      'sparkles-outline': sparklesOutline,
    });
  }

  async ionViewWillEnter(): Promise<void> {
    const eventId = this.id();
    this.loading.set(true);
    this.error.set(null);

    try {
      await this.eventContext.load(eventId);
      if (this.eventContext.role() !== 'owner') {
        await this.router.navigate(['/eventos', eventId, 'panel'], { replaceUrl: true });
        return;
      }
      await this.loadCategories(true);
    } catch (err) {
      const message = toUserError(err, 'No pudimos cargar las categorías.').message;
      this.error.set(message);
      this.loading.set(false);
    }
  }

  retryLoad(): void {
    void this.ionViewWillEnter();
  }

  async handleRefresh(event: CustomEvent): Promise<void> {
    try {
      await this.loadCategories(false);
    } finally {
      (event.target as HTMLIonRefresherElement)?.complete();
    }
  }

  async loadCategories(showSpinner = false): Promise<void> {
    if (showSpinner) {
      this.loading.set(true);
      this.error.set(null);
    }
    try {
      const list = await this.budgetRepo.listCategories(this.id());
      this.categories.set(list);
      this.error.set(null);
    } catch (err) {
      const message = toUserError(err, 'No pudimos cargar las categorías.').message;
      if (showSpinner) {
        this.error.set(message);
      } else {
        await this.showToast(message, 'danger');
      }
    } finally {
      if (showSpinner) {
        this.loading.set(false);
      }
    }
  }

  async openCreateCategoryModal(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Nueva categoría',
      cssClass: 'convite-alert',
      inputs: [
        {
          name: 'name',
          type: 'text',
          placeholder: 'Nombre de la categoría',
          attributes: {
            maxlength: 40,
          },
        },
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'convite-alert__cancel',
        },
        {
          text: 'Guardar',
          cssClass: 'convite-alert__confirm',
          handler: (data: { name?: string }) => {
            const trimmed = data?.name?.trim();
            if (!trimmed) {
              void this.showToast('Escribe un nombre.', 'danger');
              return false;
            }
            void this.createCategory(trimmed);
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  async openRenameCategoryModal(category: ExpenseCategoryRow): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Renombrar categoría',
      cssClass: 'convite-alert',
      inputs: [
        {
          name: 'name',
          type: 'text',
          value: category.name,
          placeholder: 'Nombre de la categoría',
          attributes: {
            maxlength: 40,
          },
        },
      ],
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'convite-alert__cancel',
        },
        {
          text: 'Guardar',
          cssClass: 'convite-alert__confirm',
          handler: (data: { name?: string }) => {
            const trimmed = data?.name?.trim();
            if (!trimmed) {
              void this.showToast('Escribe un nombre.', 'danger');
              return false;
            }
            void this.renameCategory(category.id, trimmed);
            return true;
          },
        },
      ],
    });

    await alert.present();
  }

  async confirmDeleteCategory(category: ExpenseCategoryRow): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Borrar categoría',
      message: `¿Borrar la categoría ${category.name}?`,
      cssClass: 'convite-alert',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
          cssClass: 'convite-alert__cancel',
        },
        {
          text: 'Borrar',
          role: 'destructive',
          cssClass: 'convite-alert__confirm',
          handler: () => {
            void this.deleteCategory(category.id);
          },
        },
      ],
    });

    await alert.present();
  }

  async addSuggestedCategories(): Promise<void> {
    if (this.addingSuggested() || this.busy()) {
      return;
    }
    this.addingSuggested.set(true);
    try {
      const added = await this.budgetRepo.addSuggestedCategories(this.id());
      await this.loadCategories(false);
      if (added === 0) {
        await this.showToast('Las categorías sugeridas ya estaban en la lista.', 'medium');
      } else if (added === 1) {
        await this.showToast('Agregamos 1 categoría.', 'success');
      } else {
        await this.showToast(`Agregamos ${added} categorías.`, 'success');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos agregar las categorías sugeridas.';
      await this.showToast(message, 'danger');
    } finally {
      this.addingSuggested.set(false);
    }
  }

  async moveCategoryUp(index: number): Promise<void> {
    const list = this.categories();
    if (index <= 0 || index >= list.length || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.budgetRepo.swapCategoryOrder(list[index], list[index - 1]);
      await this.loadCategories(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos cambiar el orden.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  async moveCategoryDown(index: number): Promise<void> {
    const list = this.categories();
    if (index < 0 || index >= list.length - 1 || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await this.budgetRepo.swapCategoryOrder(list[index], list[index + 1]);
      await this.loadCategories(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos cambiar el orden.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private async createCategory(name: string): Promise<void> {
    this.busy.set(true);
    try {
      const maxOrder = this.categories().reduce(
        (max, c) => Math.max(max, c.sort_order),
        -1,
      );
      await this.budgetRepo.createCategory(this.id(), name, maxOrder + 1);
      await this.loadCategories(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos crear la categoría.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private async renameCategory(id: string, name: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.budgetRepo.renameCategory(id, name);
      await this.loadCategories(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos renombrar la categoría.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private async deleteCategory(id: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.budgetRepo.removeCategory(id);
      await this.loadCategories(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No pudimos borrar la categoría.';
      await this.showToast(message, 'danger');
    } finally {
      this.busy.set(false);
    }
  }

  private async showToast(
    message: string,
    color: 'danger' | 'success' | 'medium',
  ): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}
