import { NotificationType } from '../constants/enums';
import { AppError } from '../utils/app-error';

export const createNotification = async (_input: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: unknown;
}) => {
  throw new AppError('Notifications are not supported by the current database schema', 501);
};
