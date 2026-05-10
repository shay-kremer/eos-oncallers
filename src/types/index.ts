import { UserRole, IncidentStatus, IncidentUrgency, AlertSeverity, NotificationMethod } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}


export { UserRole, IncidentStatus, IncidentUrgency, AlertSeverity, NotificationMethod };
