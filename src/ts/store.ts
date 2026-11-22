import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { Step, StepInput } from './types';
import { AREA_KEYS, KIND_KEYS, KindKey, MAX_NOTE, MAX_TEXT } from './data';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const dateStr = (v: unknown): string => (typeof v === 'string' && DATE_RE.test(v) ? v : '');
const millis = (v: unknown): number =>
  (v && typeof (v as { toMillis?: unknown }).toMillis === 'function'
    ? (v as { toMillis: () => number }).toMillis() : Date.now());
const clip = (s: string, max: number): string => s.trim().slice(0, max);
const oneOf = (v: unknown, keys: string[]): string => (typeof v === 'string' && keys.includes(v) ? v : '');

const col = (uid: string) => collection(db, 'users', uid, 'steps');
const ref = (uid: string, id: string) => doc(db, 'users', uid, 'steps', id);

type OnError = (err: Error) => void;

/** 保存する値を正規化する（不正な値は保存しない） */
function clean(input: StepInput): StepInput {
  const date = dateStr(input.date);
  const text = clip(input.text, MAX_TEXT);
  if (!date || !text) throw new Error('invalid step');
  return {
    date,
    kind: (oneOf(input.kind, KIND_KEYS) || 'kaizen') as KindKey,
    area: oneOf(input.area, AREA_KEYS),
    text,
    note: input.note.trim().slice(0, MAX_NOTE),
  };
}

export function subscribeSteps(uid: string, onData: (items: Step[]) => void, onError: OnError): () => void {
  return onSnapshot(col(uid), (snap) => {
    const list: Step[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const date = dateStr(data.date);
      const text = clip(str(data.text), MAX_TEXT);
      if (!date || !text) return;
      list.push({
        id: d.id,
        date,
        kind: (oneOf(data.kind, KIND_KEYS) || 'kaizen') as KindKey,
        area: oneOf(data.area, AREA_KEYS),
        text,
        note: str(data.note).slice(0, MAX_NOTE),
        createdAt: millis(data.createdAt),
      });
    });
    // 新しい日付順、同じ日は新しく記録した順
    list.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    onData(list);
  }, onError);
}

export async function createStep(uid: string, input: StepInput): Promise<void> {
  await addDoc(col(uid), { ...clean(input), createdAt: serverTimestamp() });
}

export async function updateStep(uid: string, id: string, input: StepInput): Promise<void> {
  await updateDoc(ref(uid, id), { ...clean(input) });
}

export async function deleteStep(uid: string, id: string): Promise<void> {
  await deleteDoc(ref(uid, id));
}
