import { Role } from '../constants/enums';
import { AppError } from '../utils/app-error';
import { toMeta } from '../utils/pagination';

export const listChatsByRole = async (_userId: string, _role: Role) => [];

export const getChatMessagesByRole = async (
  _userId: string,
  _role: Role,
  _applicationId: string,
  page: number,
  pageSize: number
) => ({
  chat: null,
  items: [],
  meta: toMeta(page, pageSize, 0)
});

export const sendChatMessageByRole = async (
  _userId: string,
  _role: Role,
  _applicationId: string,
  _content: string
) => {
  throw new AppError('Chats are not supported by the current database schema', 501);
};
