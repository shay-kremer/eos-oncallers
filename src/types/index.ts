import { UserRole, IncidentStatus, IncidentUrgency, AlertSeverity, NotificationMethod } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateIncidentPayload {
  title: string;
  description?: string;
  serviceId: string;
  urgency?: IncidentUrgency;
  severity?: AlertSeverity;
  dedupKey?: string;
}

export interface IncomingWebhookEvent {
  routingKey: string;
  eventAction: 'trigger' | 'acknowledge' | 'resolve';
  dedupKey?: string;
  payload: {
    summary: string;
    source?: string;
    severity?: AlertSeverity;
    details?: Record<string, unknown>;
  };
}

export { UserRole, IncidentStatus, IncidentUrgency, AlertSeverity, NotificationMethod };
