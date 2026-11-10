// loaddb output exactly as CMS returned it (`line`) on a CUBRID 11.4.5 test
// host, 2026-11-05: table t_load(a int primary key, b varchar(5)).
export const LOAD_OK = ['', 'Start object loading.', 'Total 5 object(s) inserted, 0 object(s) failed.'];
export const LOAD_SYNTAX_ERROR = ['', 'Start object loading.', '1 errors detected.', 'line 3: syntax error at "abc"'];
export const LOAD_DATA_ERROR = [
  '',
  'Start object loading.',
  'Line 4:Data overflow on data type "character varying".',
  "Line 4:Error parsing 'toolongvalue' as a 'character varying' value for attribute 'b' of 'dba.t_load'",
  'Line 4:Data overflow on data type "character varying".',
];
export const SYNTAX_CHECK = [
  '',
  'Start object syntax checking.',
  'Line 5:No class named t_nosuch, ignoring tuples',
  'Line 6:Unknown class "dba.t_nosuch".',
];
