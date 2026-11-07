import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { AUTO_ADD_PAGES_MIN, AUTO_ADD_WARN_RATIO, checkIntInRange, checkNumberInRange } from '@api-interfaces';
import { PassesCheck } from './passes-check.decorator';

// Checked only while that kind is ON; OFF keeps whatever is stored.
const whenOn = (kind: 'data' | 'index', check: (v: unknown) => ReturnType<typeof checkIntInRange>) =>
  (v: unknown, o: Record<string, unknown>) => (o[kind] === 'ON' ? check(v) : null);
const checkWarnRatio = (v: unknown) => checkNumberInRange(v, AUTO_ADD_WARN_RATIO.min, AUTO_ADD_WARN_RATIO.max);
const checkExtPages = (v: unknown) => checkIntInRange(v, AUTO_ADD_PAGES_MIN);

/**
 * Validated request bodies for DatabaseConfigController. Kept as
 * backend-only classes (mirroring the shared @api-interfaces types) so
 * class-validator decorators don't end up bundled into the frontend's
 * copy of those types.
 *
 * @category DTOs
 * @since 1.0.0
 */
export class QueryPlanClientDto {
  @IsString()
  @IsNotEmpty()
  query_id: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  // Confirmed live against CMS (raw autoexecquery.conf inspection): an empty
  // userpass encrypts to a fixed-length value like any other, so it doesn't
  // shift/corrupt the space-delimited config line. Allowed to be empty.
  @IsString()
  userpass: string;

  @IsString()
  @IsNotEmpty()
  period: string;

  @IsString()
  @IsNotEmpty()
  detail: string;

  @IsString()
  @IsNotEmpty()
  query_string: string;
}

class PlanListClientDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueryPlanClientDto)
  queryplan: QueryPlanClientDto[];
}

export class SetAutoExecQueryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanListClientDto)
  planlist: PlanListClientDto[];
}

export class AppendAutoExecQueryPlanDto {
  @ValidateNested()
  @Type(() => QueryPlanClientDto)
  plan: QueryPlanClientDto;
}

export class UpdateAutoExecQueryPlanDto {
  @ValidateNested()
  @Type(() => QueryPlanClientDto)
  plan: QueryPlanClientDto;
}

export class RemoveAutoExecQueryPlanDto {
  @IsString()
  @IsNotEmpty()
  query_id: string;
}

export class SetAutoStartDto {
  @IsString()
  @IsNotEmpty()
  confname: string;

  @IsString()
  @IsNotEmpty()
  dbname: string;
}

export class RemoveAutoStartDto {
  @IsString()
  @IsNotEmpty()
  confname: string;

  @IsString()
  @IsNotEmpty()
  dbname: string;
}

export class SetAutoAddVolDto {
  @IsString()
  @IsNotEmpty()
  data: string;

  // CMS's ranges, checked while the kind is ON (CMS adds nothing below
  // AUTO_ADD_PAGES_MIN pages and caps the ratio at 0.5).
  @IsString()
  @IsNotEmpty()
  @PassesCheck('autoAddWarnRatio', whenOn('data', checkWarnRatio))
  data_warn_outofspace: string;

  @IsString()
  @IsNotEmpty()
  @PassesCheck('autoAddPages', whenOn('data', checkExtPages))
  data_ext_page: string;

  @IsString()
  @IsNotEmpty()
  index: string;

  @IsString()
  @IsNotEmpty()
  @PassesCheck('autoAddWarnRatio', whenOn('index', checkWarnRatio))
  index_warn_outofspace: string;

  @IsString()
  @IsNotEmpty()
  @PassesCheck('autoAddPages', whenOn('index', checkExtPages))
  index_ext_page: string;
}

export class ClassInfoDto {
  @IsIn(['on', 'off'])
  dbstatus: 'on' | 'off';
}
