import { UserRole, IncidentStatus, IncidentUrgency, AlertSeverity, NotificationMethod } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface IncidentPayload {
  id: string;
  title: string;
  severity: string;
  urgency: string;
  service: { name: string };
}

export { UserRole, IncidentStatus, IncidentUrgency, AlertSeverity, NotificationMethod };
