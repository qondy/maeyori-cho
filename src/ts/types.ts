import { KindKey } from './data';

/** 昨日より前進したこと（Firestore: users/{uid}/steps） */
export interface Step {
  id: string;
  date: string; // YYYY-MM-DD
  kind: KindKey;
  area: string; // AREAS の key（空文字 = 未選択）
  text: string;
  note: string;
  createdAt: number;
}

export interface StepInput {
  date: string;
  kind: KindKey;
  area: string;
  text: string;
  note: string;
}
