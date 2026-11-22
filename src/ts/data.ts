import { RankDef } from './wakuwaku';

export interface Option {
  key: string;
  label: string;
}

export type KindKey = 'kaizen' | 'kaiketsu' | 'seicho';

export interface Kind {
  key: KindKey;
  label: string;
  /** 短い説明（選ぶときのヒント。\n の位置で改行して見せる） */
  hint: string;
  /** 入力欄の例 */
  example: string;
}

/** 前進の種類（key は保存に使うので変更しない） */
export const KINDS: Kind[] = [
  { key: 'kaizen', label: '改善', hint: 'やり方を\nよくした', example: '例：朝の支度を10分早く終えられた' },
  { key: 'kaiketsu', label: '解決', hint: '困りごとが\n片付いた', example: '例：ずっと探していた書類が見つかった' },
  { key: 'seicho', label: '成長', hint: 'できるように\nなった', example: '例：英単語を昨日より5個多く覚えた' },
];

export const KIND_KEYS = KINDS.map((k) => k.key);

export function kindOf(key: string): Kind {
  return KINDS.find((k) => k.key === key) ?? KINDS[0];
}

/** 分野（key は保存に使うので変更しない） */
export const AREAS: Option[] = [
  { key: 'work', label: '仕事' },
  { key: 'home', label: '家事・暮らし' },
  { key: 'health', label: '健康・からだ' },
  { key: 'study', label: '学び' },
  { key: 'people', label: '人間関係' },
  { key: 'hobby', label: '趣味' },
  { key: 'money', label: 'お金' },
  { key: 'mind', label: 'こころ' },
  { key: 'other', label: 'その他' },
];

export const AREA_KEYS = AREAS.map((a) => a.key);

export function areaLabel(key: string): string {
  return AREAS.find((a) => a.key === key)?.label ?? '';
}

/** 「ちょっとしたことでOK」のヒント（入力欄の下に出す例） */
export const STEP_EXAMPLES: { kind: KindKey; text: string }[] = [
  { kind: 'kaizen', text: 'メールの返信を当日中に終えた' },
  { kind: 'kaizen', text: 'よく使う物の置き場所を決めた' },
  { kind: 'kaizen', text: '寝る前のスマホを15分減らせた' },
  { kind: 'kaiketsu', text: '先延ばしにしていた連絡をした' },
  { kind: 'kaiketsu', text: '気になっていた不具合を直した' },
  { kind: 'kaiketsu', text: '迷っていたことを1つ決めた' },
  { kind: 'seicho', text: '初めてのやり方に挑戦した' },
  { kind: 'seicho', text: '前より落ち着いて話せた' },
  { kind: 'seicho', text: '昨日より長く走れた' },
];

/** 累計の前進数で上がる称号 */
export const TITLES: RankDef[] = [
  { name: 'これから', min: 0 },
  { name: 'はじめの一歩', min: 1 },
  { name: '歩きはじめ', min: 5 },
  { name: '前進中', min: 15 },
  { name: '昨日超えの常連', min: 30 },
  { name: '積み重ね名人', min: 60 },
  { name: '前進の達人', min: 100 },
  { name: 'まえよりマスター', min: 200 },
  { name: '昨日超えの伝説', min: 365 },
];

/** 連続日数の節目（お祝いを出す） */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

export const MAX_TEXT = 60;
export const MAX_NOTE = 500;
