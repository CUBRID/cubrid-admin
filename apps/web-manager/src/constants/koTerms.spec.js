import { expect, it } from 'vitest';
import { CM_KO } from './cmLabels.ko';

// Korean wording decided for the whole UI (label batch, 2026-11-04): the term
// on the left is not used; the right is. A label value is read as its source
// text, so function and table values are checked too.
const AVOIDED = [
  [/에디터/, '편집기'],
  [/(?<!일시)정지/, '중지'],
  [/복원/, '복구'],
  [/쿼리/, '질의'],
  [/매개 ?변수/, '파라미터'],
  [/십시오/, '하세요'],
  [/(?:해|어|러) ?주세요/, '하세요'],
  [/성공적으로/, '(빼고 짧게)'],
  [/새로고침/, '새로 고침'],
  [/로딩|로드 중/, '불러오는 중'],
  [/(?<!온|오프)라인/, '줄'],
  [/디렉토리/, '디렉터리'],
  [/매니저/, 'CMS'],
  [/마스터|슬레이브|레플리카/, 'Master / Slave / Replica'],
  [/(?<!자동화 )(?:질의|쿼리|백업) 계획/, '질의 자동화 계획 / 백업 자동화 계획'],
  [/스토리지/, '볼륨'],
  [/자격 ?증명/, '로그인 정보'],
  [/(?<!전체 )레벨/, '수준 (백업 수준)'],
  [/Mbyte/i, 'MiB'],
  [/전역/, '전체'],
];
const text = (value) => (typeof value === 'function' ? value.toString() : JSON.stringify(value, (k, v) => (
  v instanceof RegExp || typeof v === 'function' ? String(v) : v
)));

it.each(AVOIDED)('Korean labels do not say %s (they say %s)', (pattern) => {
  const found = Object.entries(CM_KO).filter(([, value]) => pattern.test(text(value))).map(([key]) => key);
  expect(found).toEqual([]);
});
