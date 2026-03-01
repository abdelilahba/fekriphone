import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LayoutService {
    /** When true, sidebar and topbar should be hidden (e.g. POS fullscreen mode) */
    fullscreenMode$ = new BehaviorSubject<boolean>(false);

    enterFullscreen() { this.fullscreenMode$.next(true); }
    exitFullscreen() { this.fullscreenMode$.next(false); }
}
