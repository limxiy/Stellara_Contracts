import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export interface StreamNotificationEvent {
  event: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

@Injectable()
export class NotificationsStreamService {
  private readonly streams = new Map<string, Subject<StreamNotificationEvent>>();

  subscribe(userId: string): Observable<StreamNotificationEvent> {
    const stream = this.getOrCreateStream(userId);
    return stream.asObservable();
  }

  publishToUser(userId: string, event: string, payload: Record<string, unknown>): void {
    const stream = this.getOrCreateStream(userId);
    stream.next({
      event,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  private getOrCreateStream(userId: string): Subject<StreamNotificationEvent> {
    const existing = this.streams.get(userId);
    if (existing) {
      return existing;
    }

    const stream = new Subject<StreamNotificationEvent>();
    this.streams.set(userId, stream);
    return stream;
  }
}
