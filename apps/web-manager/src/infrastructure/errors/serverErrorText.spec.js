import { afterEach, describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import apiClient from '../../api/apiClient';
import { getCM, LOCALE_STORAGE_KEY } from '../../constants/useCM';
import { requestErrorText, serverErrorText } from './serverErrorText';

const KO = getCM('ko');
const EN = getCM('en');

// The body the server sends for an AppError (global-filter.ts).
const body = (type, fields = {}, note = 'English text from the server') => ({
  status: 400,
  note,
  data: { type, code: type.split('/').pop().toUpperCase(), title: 'Title', message: note, detail: note, ...fields },
});

describe('serverErrorText', () => {
  it('says a known error in Korean from its type', () => {
    expect(serverErrorText(body('/errors/auth/invalid_credentials'), KO)).toBe('아이디 또는 비밀번호가 올바르지 않습니다.');
  });

  it('builds the Korean sentence from the reason and fields', () => {
    const loggedOut = body('/errors/validation/missing_db_credentials', { reason: 'loggedOut', dbname: 'demodb' });
    const notLoggedIn = body('/errors/validation/missing_db_credentials', { reason: 'notLoggedIn', dbname: 'demodb' });
    expect(serverErrorText(loggedOut, KO)).toBe('데이터베이스 demodb에서 로그아웃했습니다. 먼저 로그인하세요.');
    expect(serverErrorText(notLoggedIn, KO)).toBe('데이터베이스 demodb에 로그인하지 않았습니다. 먼저 로그인하세요.');
  });

  it('keeps CMS text after the sentence, without its trailing <end>', () => {
    const failed = body('/errors/cms/request_failed', {}, 'Volume path not found <end>');
    expect(serverErrorText(failed, KO)).toBe('CMS 작업이 실패했습니다. (Volume path not found)');
  });

  it('says CMS text in Korean when it is a known one', () => {
    const failed = body('/errors/cms/request_failed', {}, 'Incorrect password');
    expect(serverErrorText(failed, KO)).toBe('CMS 작업이 실패했습니다. (비밀번호가 올바르지 않습니다)');
  });

  it('adds the CMS text the server sends apart (cmsNote) to any error', () => {
    const failed = body('/errors/database/start_database_failed', { cmsNote: 'Server already running <end>' });
    expect(serverErrorText(failed, KO)).toBe('데이터베이스를 시작하지 못했습니다. (Server already running)');
  });

  it('wraps an error it has no Korean for in a general sentence', () => {
    expect(serverErrorText(body('/errors/new_kind/new_code'), KO)).toBe('요청을 처리하지 못했습니다. (English text from the server)');
    expect(serverErrorText({ status: 500 }, KO)).toBe('요청을 처리하지 못했습니다.');
  });

  it('shows the server message as is in English', () => {
    expect(serverErrorText(body('/errors/auth/invalid_credentials', {}, 'Invalid credentials.'), EN)).toBe('Invalid credentials.');
    expect(serverErrorText(body('/errors/cms/request_failed', {}, 'Volume path not found <end>'), EN)).toBe('Volume path not found');
    expect(serverErrorText({}, EN)).toBe(EN.requestFailedMsg);
  });
});

describe('requestErrorText', () => {
  it('takes the message apiClient left on the error', () => {
    expect(requestErrorText({ response: { data: { message: '번역된 문장' } }, message: 'other' }, KO)).toBe('번역된 문장');
    expect(requestErrorText({ message: '서버에 연결하지 못했습니다.' }, KO)).toBe('서버에 연결하지 못했습니다.');
    expect(requestErrorText('already a message', KO)).toBe('already a message');
    expect(requestErrorText(undefined, KO)).toBe('요청을 처리하지 못했습니다.');
  });
});

describe('apiClient', () => {
  afterEach(() => localStorage.removeItem(LOCALE_STORAGE_KEY));

  const failWith = (makeError) => apiClient.get('/anything', {
    adapter: (config) => Promise.reject(makeError(config)),
  }).catch((err) => err);

  it('puts a server error in the UI language on the error it rejects with', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ko');
    const err = await failWith((config) => new AxiosError('Request failed with status code 409', 'ERR_BAD_REQUEST', config, {}, {
      status: 409, statusText: 'Conflict', headers: {}, config,
      data: body('/errors/database/no_such_database', { dbname: 'demodb' }),
    }));
    expect(err.message).toBe('데이터베이스 demodb을(를) 찾을 수 없습니다.');
    expect(err.response.data.message).toBe('데이터베이스 demodb을(를) 찾을 수 없습니다.');
    expect(requestErrorText(err)).toBe('데이터베이스 demodb을(를) 찾을 수 없습니다.');
  });

  it('says in the UI language that no reply came back', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ko');
    const network = await failWith((config) => new AxiosError('Network Error', 'ERR_NETWORK', config, {}));
    const timeout = await failWith((config) => new AxiosError('timeout of 60000ms exceeded', 'ECONNABORTED', config, {}));
    expect(requestErrorText(network)).toBe('서버에 연결하지 못했습니다.');
    expect(requestErrorText(timeout)).toBe('서버가 제시간에 응답하지 않았습니다.');
  });
});
