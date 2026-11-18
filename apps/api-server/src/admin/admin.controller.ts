import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request } from '@nestjs/common';
import { AdminAccountSummary, AdminAuditAction, AdminAuditPage, AdminPendingCount, AdminSettings } from '@api-interfaces';
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

const AUDIT_ACTIONS = new Set<string>([
  'create', 'delete', 'disable', 'enable', 'reset_password',
  'grant_admin', 'revoke_admin', 'sign_out', 'set_registration',
  'set_registration_approval', 'approve', 'reject',
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
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async listAccounts(): Promise<AdminAccountSummary[]> {
    return this.adminService.listAccounts();
  }

  /** Sign-ups waiting for approval, for the admin menu's badge. */
  @Get('users/pending-count')
  async countPending(): Promise<AdminPendingCount> {
    return this.adminService.countPending();
  }

  @Post('users/:id/approve')
  async approveAccount(@Request() req, @Param('id') id: string, @Body() body: AdminApproveAccountDto): Promise<AdminAccountSummary> {
    return this.adminService.approveAccount(req.user.sub, id, body?.role);
  }

  @Post('users/:id/reject')
  async rejectAccount(@Request() req, @Param('id') id: string): Promise<{ success: true }> {
    await this.adminService.rejectAccount(req.user.sub, id);
    return { success: true };
  }

  @Post('users')
  async createAccount(@Request() req, @Body() body: AdminCreateAccountDto): Promise<AdminAccountSummary> {
    return this.adminService.createAccount(req.user.sub, body);
  }

  @Put('users/:id/status')
  async setStatus(@Request() req, @Param('id') id: string, @Body() body: AdminSetStatusDto): Promise<AdminAccountSummary> {
    return this.adminService.setStatus(req.user.sub, id, body.status);
  }

  @Put('users/:id/role')
  async setRole(@Request() req, @Param('id') id: string, @Body() body: AdminSetRoleDto): Promise<AdminAccountSummary> {
    return this.adminService.setRole(req.user.sub, id, body.role);
  }

  @Post('users/:id/password')
  async resetPassword(@Request() req, @Param('id') id: string, @Body() body: AdminResetPasswordDto): Promise<AdminAccountSummary> {
    return this.adminService.resetPassword(req.user.sub, id, body.password);
  }

  @Post('users/:id/sign-out')
  async signOutEverywhere(@Request() req, @Param('id') id: string): Promise<AdminAccountSummary> {
    return this.adminService.signOutEverywhere(req.user.sub, id);
  }

  @Delete('users/:id')
  async deleteAccount(@Request() req, @Param('id') id: string): Promise<{ success: true }> {
    await this.adminService.deleteAccount(req.user.sub, id);
    return { success: true };
  }

  @Get('settings')
  async getSettings(): Promise<AdminSettings> {
    return this.adminService.getSettings();
  }

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
}
