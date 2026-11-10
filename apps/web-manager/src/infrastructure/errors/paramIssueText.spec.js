import { afterEach, describe, expect, it } from 'vitest';
import { checkEffectiveParams, checkParamValue, formatConfTextProblem, validateConfText } from '@api-interfaces';
import { getCM, LOCALE_STORAGE_KEY } from '../../constants/useCM';
import { confSaveProblems, confSaveWarnings } from '../../features/server/confSaveProblems';
import { confProblemText, paramIssueText, paramIssuesText } from './paramIssueText';

const KO = getCM('ko');
const EN = getCM('en');

const SCHEMA = [
  { key: 'max_clients', category: 'general', guard: { kind: 'int', min: 10, max: 4000 }, default: '100' },
  { key: 'async_commit', category: 'advanced', guard: { kind: 'boolean' }, default: 'no' },
];
const BROKER_SCHEMA = [
  { key: 'MASTER_SHM_ID', category: 'common', guard: { kind: 'int', min: 1 }, default: '', commonOnly: true, required: true },
  { key: 'BROKER_PORT', category: 'common', guard: { kind: 'int', min: 1, max: 65535, base: 0 }, default: '', instanceOnly: true, required: true },
  { key: 'MIN_NUM_APPL_SERVER', category: 'common', guard: { kind: 'int', min: 1 }, default: '5' },
];

describe('paramIssueText', () => {
  it('says a value check in Korean words and keeps the library English otherwise', () => {
    const tooBig = checkParamValue({ kind: 'int', min: 10, max: 4000 }, '5000');
    expect(paramIssueText(tooBig, KO)).toBe('4000 이하여야 합니다');
    expect(paramIssueText(tooBig, EN)).toBe('Must be ≤ 4000');
    expect(paramIssueText(checkParamValue({ kind: 'brokerTime', minSec: 1 }, '0'), KO)).toBe('1초 이상이어야 합니다');
  });

  it('says why an empty value fails from the check 0 fails', () => {
    const issues = checkEffectiveParams(BROKER_SCHEMA, { MIN_NUM_APPL_SERVER: '' }, {
      isCommonSection: false, commonSectionLabel: 'broker', emptyIntIsZero: true,
    });
    expect(paramIssuesText(issues, KO).MIN_NUM_APPL_SERVER).toBe('빈 값은 0으로 읽힙니다 — 1 이상이어야 합니다');
  });

  it('writes no comparison signs in Korean', () => {
    const params = { min: 1, max: 2, options: ['a'], section: 'common', comparedToKey: 'K', current: 3, rule: 'gte' };
    for (const [code, entry] of Object.entries(KO.paramIssues)) {
      const text = typeof entry === 'function' ? entry(params, '원인') : entry;
      expect(text, code).not.toMatch(/[≥≤<>]/);
    }
  });
});

describe('confProblemText', () => {
  it('words each problem of a saved file with its line', () => {
    const problems = validateConfText(SCHEMA, '[common]\nasync_commit=no\nmax_clients=5\nasync_commit=yes\nnot a line', 'cubridconf');
    expect(problems.map((p) => confProblemText(p, EN))).toEqual(problems.map(formatConfTextProblem));
    expect(problems.map((p) => confProblemText(p, KO))).toEqual([
      '2번째 줄: [common] async_commit — 4번째 줄에서 다시 설정합니다. 이 줄은 무시되고 뒤의 값을 씁니다.',
      '3번째 줄: [common] max_clients — 10 이상이어야 합니다',
      '5번째 줄: "키 = 값" 줄, [구역] 머리글, # 주석 중 어느 것도 아닙니다',
    ]);
  });

  it('words broker file problems', () => {
    const problems = validateConfText(BROKER_SCHEMA, '[broker]\nMASTER_SHM_ID=30001\n[%a]\nBROKER_PORT=33000\n[%b]\nBROKER_PORT=33000', 'brokerconf');
    expect(problems.map((p) => confProblemText(p, KO))).toContain(
      '6번째 줄: [%b] BROKER_PORT — 33000은(는) [%a]에서 이미 쓰고 있습니다. 포트가 겹치면 브로커가 시작하지 않습니다.'
    );
  });

  it('keeps the server sentence of a problem it has no code for', () => {
    expect(confProblemText({ lineNo: 2, message: 'cm_port — Must be ≤ 65535' }, KO)).toBe('2번째 줄: cm_port — Must be ≤ 65535');
  });
});

describe('conf save results', () => {
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));
  const problem = { lineNo: 3, key: 'max_clients', section: 'common', code: 'MIN', params: { min: 10 }, message: '[common] max_clients — Must be ≥ 10' };

  it('words a rejected save and a saved file\'s warnings in the UI language', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ko');
    expect(confSaveProblems({ response: { data: { data: { problems: [problem] } } } })).toEqual(['3번째 줄: [common] max_clients — 10 이상이어야 합니다']);
    expect(confSaveWarnings({ warnings: ['Line 3: [common] max_clients — Must be ≥ 10'], warningProblems: [problem] }))
      .toEqual(['3번째 줄: [common] max_clients — 10 이상이어야 합니다']);
    expect(confSaveWarnings({ warnings: ['Line 1: some warning'] })).toEqual(['Line 1: some warning']);
  });
});
