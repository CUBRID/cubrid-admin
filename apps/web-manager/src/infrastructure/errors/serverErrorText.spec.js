import { afterEach, describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import apiClient from '../../api/apiClient';
import { getCM, LOCALE_STORAGE_KEY } from '../../constants/useCM';
import { failureText, requestErrorText, serverErrorText, warningText } from './serverErrorText';

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

describe('serverErrorText with reasons and fields', () => {
  // POST /host with an empty address and port 70000 (server-error-codes.md, section 8).
  const badHostBody = {
    data: {
      type: '/errors/validation/invalid_request_body', title: 'Invalid Request Body', status: 400,
      detail: 'address should not be empty; port must not be greater than 65535', code: 'INVALID_REQUEST_BODY',
      missingFields: ['address', 'port'],
      invalidFields: [{ field: 'address', constraints: ['isNotEmpty'] }, { field: 'port', constraints: ['max'] }],
      message: 'address should not be empty; port must not be greater than 65535',
    },
    status: 400,
    note: 'address should not be empty; port must not be greater than 65535',
  };

  it('names each wrong field in Korean', () => {
    expect(serverErrorText(badHostBody, KO)).toBe('입력 값이 올바르지 않습니다: address(비어 있음), port(최댓값보다 큼)');
  });

  it('says the situation a reason names', () => {
    expect(serverErrorText(body('/errors/resource/invalid_format', { reason: 'GROUP_NOT_FOUND', field: 'groupId' }, 'Group "g9" does not exist.'), KO))
      .toBe('그룹을 찾을 수 없습니다.');
    expect(serverErrorText(body('/errors/resource/invalid_format', { reason: 'ALIAS_TOO_LONG', field: 'alias', max: 64 }), KO))
      .toBe('이름(별칭)은 64자까지 쓸 수 있습니다.');
    expect(serverErrorText(body('/errors/cms/request_failed', { reason: 'NO_TOKEN', cmsTask: 'login' }, 'CMS login did not return a token'), KO))
      .toBe('CMS 로그인 응답에 인증 토큰이 없습니다. 다시 연결하세요.');
  });

  it('keeps a specific English reason a server without reasons sends, but not its fixed sentence', () => {
    expect(serverErrorText(body('/errors/resource/invalid_format', {}, 'The alias cannot be blank.'), KO))
      .toBe('호스트 정보 형식이 올바르지 않습니다. (The alias cannot be blank.)');
    expect(serverErrorText(body('/errors/resource/invalid_format', {}, 'Invalid host information format.'), KO))
      .toBe('호스트 정보 형식이 올바르지 않습니다.');
    expect(serverErrorText(body('/errors/validation/invalid_request_body', {}, 'port must not be greater than 65535'), KO))
      .toBe('요청 내용이 올바르지 않습니다. (port must not be greater than 65535)');
  });

  it('adds no English when the sentence already uses the error\'s values', () => {
    expect(serverErrorText(body('/errors/database/duplicated_file', { path: '/data/x.vol' }, 'File already exists: /data/x.vol'), KO))
      .toBe('이미 있는 파일입니다: /data/x.vol');
    expect(serverErrorText(body('/errors/validation/missing_required_field', { missingFields: ['dbname'] }, 'Missing required field(s): dbname'), KO))
      .toBe('필수 항목이 비어 있습니다: dbname');
    expect(serverErrorText(body('/errors/database/duplicated_file', {}, 'File already exists: /data/x.vol'), KO))
      .toBe('이미 있는 파일입니다. (File already exists: /data/x.vol)');
  });

  it('adds no English to CMS errors CMS itself did not word', () => {
    expect(serverErrorText(body('/errors/cms/no_response', {}, 'No response was received from CMS.'), KO)).toBe('CMS가 응답하지 않았습니다.');
    expect(serverErrorText(body('/errors/cms/invalid_token', {}, 'Request is rejected due to invalid token. Please reconnect.'), KO))
      .toBe('CMS가 인증 토큰을 거부했습니다. 호스트에 다시 연결하세요.');
  });

  it('shows the CMS text the server sends apart', () => {
    const notHa = body('/errors/cms/request_failed', { cmsNote: 'The server was not configured for HA.', cmsTask: 'heartbeatlist' }, 'The server was not configured for HA.');
    expect(serverErrorText(notHa, KO)).toBe('CMS 작업이 실패했습니다. (이 서버는 HA로 구성되어 있지 않습니다)');
    expect(serverErrorText(notHa, EN)).toBe('The server was not configured for HA.');
  });
});

describe('failureText', () => {
  // A service stop's failed[] entry (server-error-codes.md, section 8).
  const brokers = {
    name: 'brokers', type: '/errors/cms/request_failed', code: 'REQUEST_FAILED',
    cmsNote: 'Error: Cannot open shared memory (os error = No such file or directory)', cmsTask: 'stopbroker',
    error: 'Error: Cannot open shared memory (os error = No such file or directory)',
  };

  it('says a failure inside a successful response like an error response', () => {
    expect(failureText(brokers, KO)).toBe('CMS 작업이 실패했습니다. (공유 메모리를 열 수 없습니다(OS 오류: No such file or directory))');
    expect(failureText(brokers, EN)).toBe('Error: Cannot open shared memory (os error = No such file or directory)');
    expect(failureText({ message: 'Job interrupted because the API server restarted.', code: 'JOB_INTERRUPTED', type: '/errors/job/job_interrupted' }, KO))
      .toBe('API 서버가 다시 시작되어 작업이 중단되었습니다.');
  });

  it('words an HA step from its databases and the failed request inside it', () => {
    const step = {
      dbname: 'HA databases (heartbeat)', type: '/errors/database/ha_not_running_after_start', code: 'HA_NOT_RUNNING_AFTER_START',
      dbnames: ['hadb1', 'hadb2'], error: 'Not running after the HA start: hadb1, hadb2 (Failed)',
      sendFailure: { type: '/errors/cms/request_failed', code: 'REQUEST_FAILED', cmsNote: 'Failed', cmsTask: 'ha_start', error: 'Failed' },
    };
    expect(failureText(step, KO)).toBe('HA 시작 후에도 실행되지 않음: hadb1, hadb2 (CMS 작업이 실패했습니다. (Failed))');
  });

  it('shows a failure without a type as given', () => {
    expect(failureText({ dbname: 'demodb', error: '데이터베이스 demodb에 로그인하지 않았습니다.' }, KO)).toBe('데이터베이스 demodb에 로그인하지 않았습니다.');
    expect(failureText(undefined, KO)).toBe('');
  });
});

describe('warningText', () => {
  it('says a job warning in Korean by its code, and keeps one it does not know', () => {
    const english = 'cubrid.conf already has a [@new] section, so the [@old] section was left as it is.';
    expect(warningText(english, { code: 'RENAME_SECTION_KEPT', oldName: 'old', newName: 'new' }, KO))
      .toBe('cubrid.conf에 이미 [@new] 구역이 있어 [@old] 구역은 그대로 두었습니다. "new"에 그 설정이 필요하면 [@new]으로 직접 옮기세요.');
    expect(warningText(english, { code: 'SOMETHING_NEW' }, KO)).toBe(english);
    expect(warningText(english, undefined, KO)).toBe(english);
    expect(warningText(english, { code: 'RENAME_SECTION_KEPT', oldName: 'old', newName: 'new' }, EN)).toBe(english);
  });
});

describe('CMS text in Korean', () => {
  const cmsFailure = (note) => body('/errors/cms/request_failed', { cmsNote: note, cmsTask: 't' }, note);

  it('says known CMS text with names and paths in it (INQUISITOR C1-C3)', () => {
    expect(serverErrorText(cmsFailure('Database(demodb@127.0.0.1) is not active state'), KO))
      .toBe('CMS 작업이 실패했습니다. (데이터베이스(demodb@127.0.0.1)가 실행 중이 아닙니다)');
    expect(failureText({
      message: 'x', code: 'REQUEST_FAILED', type: '/errors/cms/request_failed', cmsTask: 'deletedb',
      cmsNote: 'Unable to mount disk volume "/data/db1". The database "/data/db1", to which the disk volume belongs, is in use by user cubrid on process 1234 of host node1 since Tue Nov  4 10:00:00 2026.<end>',
    }, KO)).toBe('CMS 작업이 실패했습니다. (디스크 볼륨 "/data/db1"을(를) 마운트할 수 없습니다. 이 볼륨이 속한 데이터베이스 "/data/db1"을(를) 호스트 node1의 프로세스 1234(사용자 cubrid)가 Tue Nov  4 10:00:00 2026부터 쓰고 있습니다)');
    expect(serverErrorText(cmsFailure('The server was not configured for HA.'), KO)).toBe('CMS 작업이 실패했습니다. (이 서버는 HA로 구성되어 있지 않습니다)');
  });

  it('says every shared memory error the broker writes, and a missing parameter with or without a period', () => {
    expect(serverErrorText(cmsFailure('Cannot open shared memory'), KO)).toBe('CMS 작업이 실패했습니다. (공유 메모리를 열 수 없습니다)');
    expect(serverErrorText(cmsFailure('Error: Cannot open shared memory (Version mismatched)'), KO)).toBe('CMS 작업이 실패했습니다. (공유 메모리를 열 수 없습니다(버전이 맞지 않음))');
    expect(serverErrorText(cmsFailure('Cannot open shared memory (os error = Permission denied)'), KO)).toBe('CMS 작업이 실패했습니다. (공유 메모리를 열 수 없습니다(OS 오류: Permission denied))');
    expect(serverErrorText(cmsFailure('Parameter(targetid) missing in the request.'), KO)).toBe('CMS 작업이 실패했습니다. (요청에 파라미터(targetid)가 없습니다)');
    expect(serverErrorText(cmsFailure('Parameter(targetid) missing in the request'), KO)).toBe('CMS 작업이 실패했습니다. (요청에 파라미터(targetid)가 없습니다)');
  });

  it('keeps CMS text it does not know as CMS sent it', () => {
    expect(serverErrorText(cmsFailure('Something new happened'), KO)).toBe('CMS 작업이 실패했습니다. (Something new happened)');
  });
});

describe('HA steps a server could not check', () => {
  it('stays whole without the list read that failed', () => {
    const send = { type: '/errors/cms/request_failed', cmsNote: 'Failed', cmsTask: 'ha_stop', error: 'Failed' };
    expect(failureText({ type: '/errors/database/ha_start_not_checked', error: 'x' }, KO)).toBe('HA 데이터베이스가 시작되었는지 확인하지 못했습니다');
    expect(failureText({ type: '/errors/database/ha_stop_not_checked', error: 'x', sendFailure: send }, KO))
      .toBe('HA 데이터베이스가 중지되었는지 확인하지 못했습니다 (CMS 작업이 실패했습니다. (Failed))');
  });
});

describe('HA steps with no ha_db_list to check against', () => {
  const step = (action, reason, fields) => ({
    dbname: 'HA databases (heartbeat)', code: `HA_${action.toUpperCase()}_NOT_CHECKED`,
    type: `/errors/database/ha_${action}_not_checked`, reason, error: 'English', ...fields,
  });
  const send = { error: 'Failed', code: 'REQUEST_FAILED', type: '/errors/cms/request_failed', cmsNote: 'Failed', cmsTask: 'ha_start' };
  const conf = { error: 'cannot open cubrid_ha.conf', code: 'REQUEST_FAILED', type: '/errors/cms/request_failed', cmsNote: 'cannot open cubrid_ha.conf', cmsTask: 'getallsysparam' };

  it('says the list is empty, with the failed request when there is one', () => {
    expect(failureText(step('start', 'HA_DB_LIST_EMPTY', { sendFailure: send }), KO))
      .toBe('cubrid_ha.conf의 ha_db_list가 비어 있어 HA 시작 결과를 확인하지 못했습니다 (CMS 작업이 실패했습니다. (Failed))');
    expect(failureText(step('stop', 'HA_DB_LIST_EMPTY', {}), KO)).toBe('cubrid_ha.conf의 ha_db_list가 비어 있어 HA 중지 결과를 확인하지 못했습니다');
  });

  it('says why cubrid_ha.conf could not be read, and stays whole without the reason', () => {
    expect(failureText(step('start', 'HA_DB_LIST_UNREADABLE', { haConfFailure: conf }), KO))
      .toBe('cubrid_ha.conf를 읽지 못해 HA 시작 결과를 확인하지 못했습니다: CMS 작업이 실패했습니다. (cannot open cubrid_ha.conf)');
    expect(failureText(step('stop', 'HA_DB_LIST_UNREADABLE', {}), KO)).toBe('cubrid_ha.conf를 읽지 못해 HA 중지 결과를 확인하지 못했습니다');
    const bare = { error: 'cannot open cubrid_ha.conf', code: 'REQUEST_FAILED', type: '/errors/cms/request_failed' };
    expect(failureText(step('start', 'HA_DB_LIST_UNREADABLE', { haConfFailure: bare }), KO))
      .toBe('cubrid_ha.conf를 읽지 못해 HA 시작 결과를 확인하지 못했습니다: CMS 작업이 실패했습니다. (cannot open cubrid_ha.conf)');
  });
});
