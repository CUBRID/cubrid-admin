import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request } from '@nestjs/common';
import { AdminAccountSummary, AdminAuditAction, AdminAuditPage, AdminPendingCount, AdminSettings, ApiLogCategory, ApiLogPage } from '@api-interfaces';
import { AdminOnly, NotOnDesktop } from '@common';
import {
  AdminApproveAccountDto,
  AdminCreateAccountDto,
  AdminResetPasswordDto,
  AdminSetRoleDto,
  AdminSetStatusDto,
  AdminSettingsDto,
} from '@type/index';
import { AdminService } from './admin.service';
import { LogAction } from '@api-log/log-action.decorator';
import { ApiLogService } from '@api-log/api-log.service';

const AUDIT_ACTIONS = new Set<string>([
  'create', 'delete', 'disable', 'enable', 'reset_password',
  'grant_admin', 'revoke_admin', 'sign_out', 'set_registration',
  'set_registration_approval', 'approve', 'reject',
]);

const API_LOG_CATEGORIES = new Set<string>([
  'auth', 'account', 'admin', 'host', 'database', 'broker', 'config', 'ha', 'cms', 'file', 'other',
]);

/**
 * Web Manager account control. Administrators only (JwtAuthGuard checks
 * AdminOnly on every route), and not in the desktop app, which has one
 * built-in user and no accounts.
 */
@NotOnDesktop()
@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly apiLog: ApiLogService
  ) {}

  @Get('users')
  async listAccounts(): Promise<AdminAccountSummary[]> {
    return this.adminService.listAccounts();
  }

  /** Sign-ups waiting for approval, for the admin menu's badge. */
  @Get('users/pending-count')
  async countPending(): Promise<AdminPendingCount> {
    return this.adminService.countPending();
  }

  @LogAction('admin.approve_account')
  @Post('users/:id/approve')
  async approveAccount(@Request() req, @Param('id') id: string, @Body() body: AdminApproveAccountDto): Promise<AdminAccountSummary> {
    return this.adminService.approveAccount(req.user.sub, id, body?.role);
  }

  @LogAction('admin.reject_account')
  @Post('users/:id/reject')
  async rejectAccount(@Request() req, @Param('id') id: string): Promise<{ success: true }> {
    await this.adminService.rejectAccount(req.user.sub, id);
    return { success: true };
  }

  @LogAction('admin.create_account')
  @Post('users')
  async createAccount(@Request() req, @Body() body: AdminCreateAccountDto): Promise<AdminAccountSummary> {
    return this.adminService.createAccount(req.user.sub, body);
  }

  @LogAction('admin.set_status')
  @Put('users/:id/status')
  async setStatus(@Request() req, @Param('id') id: string, @Body() body: AdminSetStatusDto): Promise<AdminAccountSummary> {
    return this.adminService.setStatus(req.user.sub, id, body.status);
  }

  @LogAction('admin.set_role')
  @Put('users/:id/role')
  async setRole(@Request() req, @Param('id') id: string, @Body() body: AdminSetRoleDto): Promise<AdminAccountSummary> {
    return this.adminService.setRole(req.user.sub, id, body.role);
  }

  @LogAction('admin.reset_password')
  @Post('users/:id/password')
  async resetPassword(@Request() req, @Param('id') id: string, @Body() body: AdminResetPasswordDto): Promise<AdminAccountSummary> {
    return this.adminService.resetPassword(req.user.sub, id, body.password);
  }

  @LogAction('admin.sign_out_account')
  @Post('users/:id/sign-out')
  async signOutEverywhere(@Request() req, @Param('id') id: string): Promise<AdminAccountSummary> {
    return this.adminService.signOutEverywhere(req.user.sub, id);
  }

  @LogAction('admin.delete_account')
  @Delete('users/:id')
  async deleteAccount(@Request() req, @Param('id') id: string): Promise<{ success: true }> {
    await this.adminService.deleteAccount(req.user.sub, id);
    return { success: true };
  }

  @Get('settings')
  async getSettings(): Promise<AdminSettings> {
    return this.adminService.getSettings();
  }

  @LogAction('admin.change_settings')
  @Put('settings')
  async setSettings(@Request() req, @Body() body: AdminSettingsDto): Promise<AdminSettings> {
    return this.adminService.updateSettings(req.user.sub, body);
  }

  /** Filters: actor, target, action, from, to (ISO dates), limit, offset. */
  @Get('audit')
  async queryAudit(@Query() query: Record<string, string | undefined>): Promise<AdminAuditPage> {
    const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
    const action = text(query.action);
    return this.adminService.queryAudit({
      actor: text(query.actor),
      target: text(query.target),
      action: action && AUDIT_ACTIONS.has(action) ? (action as AdminAuditAction) : undefined,
      from: text(query.from),
      to: text(query.to),
      limit: query.limit === undefined ? undefined : Number(query.limit),
      offset: query.offset === undefined ? undefined : Number(query.offset),
    });
  }

  /**
   * The API log: what people did, newest first, with totals for the range.
   * Filters: from, to (ISO), user, category, result (ok|failed), target,
   * limit, offset, tz (the browser's getTimezoneOffset, for day totals).
   */
  @Get('api-log')
  async queryApiLog(@Query() query: Record<string, string | undefined>): Promise<ApiLogPage> {
    const text = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
    const category = text(query.category);
    const result = text(query.result);
    return this.apiLog.query({
      from: text(query.from),
      to: text(query.to),
      user: text(query.user),
      category: category && API_LOG_CATEGORIES.has(category) ? (category as ApiLogCategory) : undefined,
      result: result === 'ok' || result === 'failed' ? result : undefined,
      target: text(query.target),
      limit: query.limit === undefined ? undefined : Number(query.limit),
      offset: query.offset === undefined ? undefined : Number(query.offset),
      tzOffsetMinutes: query.tz === undefined ? undefined : Number(query.tz),
    });
  }
}
