export type * from '../api/types';

export interface Message {
  role: 'user' | 'assistant';
  text: string;
}
