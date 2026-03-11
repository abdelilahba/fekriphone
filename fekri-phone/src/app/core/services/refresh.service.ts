import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RefreshService {
  private refreshStatsSubject = new Subject<void>();
  refreshStats$ = this.refreshStatsSubject.asObservable();

  triggerRefresh() {
    this.refreshStatsSubject.next();
  }
}
