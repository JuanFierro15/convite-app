import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { introVideoSources } from '../../../core';
import { INTRO_ENVIRONMENT } from './intro-environment';

export const INTRO_START_TIMEOUT_MS = 2000;
export const INTRO_MAX_DURATION_MS = 15000;
export const INTRO_FADE_MS = 300;

@Component({
  selector: 'app-guest-intro',
  templateUrl: './guest-intro.component.html',
  styleUrls: ['./guest-intro.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuestIntroComponent {
  readonly code = input.required<string>();
  readonly themeId = input.required<string>();
  readonly finished = output<void>();
  readonly leaving = signal(false);
  readonly poster = signal<string | null>(null);

  private readonly env = inject(INTRO_ENVIRONMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  readonly skipButton = viewChild.required<ElementRef<HTMLButtonElement>>('skipButton');

  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private hasPlayed = false;

  constructor() {
    afterNextRender(() => {
      this.startIntro();
    });

    this.destroyRef.onDestroy(() => {
      this.cleanup();
    });
  }

  onPlaying(): void {
    if (this.leaving()) {
      return;
    }
    if (this.startTimer !== null) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (!this.hasPlayed) {
      this.hasPlayed = true;
      this.env.markSeen(this.code());
      this.maxDurationTimer = setTimeout(() => this.leave(), INTRO_MAX_DURATION_MS);
    }
  }

  onEnded(): void {
    this.leave();
  }

  onError(): void {
    this.leave();
  }

  onSkip(): void {
    if (this.leaving()) {
      return;
    }
    this.env.markSeen(this.code());
    this.leave();
  }

  private startIntro(): void {
    const orientation = this.env.isPortrait() ? 'vertical' : 'horizontal';
    const sources = introVideoSources(this.themeId(), orientation);
    if (!sources) {
      this.leave();
      return;
    }

    this.poster.set(sources.poster);
    const videoEl = this.video().nativeElement;
    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.playsInline = true;
    videoEl.src = sources.video;

    this.skipButton().nativeElement.focus();

    this.startTimer = setTimeout(() => this.leave(), INTRO_START_TIMEOUT_MS);

    try {
      const playPromise = videoEl.play();
      void Promise.resolve(playPromise).catch(() => this.leave());
    } catch {
      this.leave();
    }
  }

  private leave(): void {
    if (this.leaving()) {
      return;
    }
    if (this.startTimer !== null) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.maxDurationTimer !== null) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    this.releaseVideo();
    this.leaving.set(true);
    this.fadeTimer = setTimeout(() => {
      this.finished.emit();
    }, INTRO_FADE_MS);
  }

  private cleanup(): void {
    if (this.startTimer !== null) {
      clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.maxDurationTimer !== null) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
    if (this.fadeTimer !== null) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    this.releaseVideo();
  }

  private releaseVideo(): void {
    try {
      const video = this.video()?.nativeElement;
      if (video) {
        try {
          video.pause();
        } catch {
          // En entornos como jsdom pause no está implementado.
        }
        try {
          video.removeAttribute('src');
        } catch {
          // Ignora si falla la remoción del atributo src.
        }
        try {
          video.load();
        } catch {
          // En entornos como jsdom load no está implementado.
        }
      }
    } catch {
      // Ignora si el viewChild no está disponible al destruir.
    }
  }
}
