import { Body, Controller, Delete, Get, Param, Post, Put, Request } from '@nestjs/common';
import { GetHostsResponse, HostResponse } from '@api-interfaces';
import { HostService } from './host.service';
import {
  AddHostDto,
  CreateHostGroupDto,
  UpdateHostGroupDto,
  MoveHostDto,
  UpdateHostClientDto,
  MarkHaDto,
} from '@type/index';
import { LogAction } from '@api-log/log-action.decorator';

@Controller('host')
export class HostController {
  constructor(private readonly hostService: HostService) {}

  @LogAction('host.add')
  @Post()
  async addHost(@Request() request, @Body() hostInfo: AddHostDto): Promise<GetHostsResponse> {
    const userId = request.user.sub;
    return { host_groups: await this.hostService.addHost(userId, hostInfo) };
  }

  @LogAction('host.add_group')
  @Post('group')
  async createGroup(
    @Request() request,
    @Body() body: CreateHostGroupDto
  ): Promise<GetHostsResponse> {
    const userId = request.user.sub;
    return { host_groups: await this.hostService.createHostGroup(userId, body.name) };
  }

  @LogAction('host.change_group')
  @Put('group/:groupId')
  async updateGroup(
    @Request() request,
    @Param('groupId') groupId: string,
    @Body() body: UpdateHostGroupDto
  ): Promise<GetHostsResponse> {
    const userId = request.user.sub;
    return { host_groups: await this.hostService.updateHostGroup(userId, groupId, body) };
  }

  @LogAction('host.delete_group')
  @Delete('group/:groupId')
  async deleteGroup(
    @Request() request,
    @Param('groupId') groupId: string
  ): Promise<GetHostsResponse> {
    const userId = request.user.sub;
    return { host_groups: await this.hostService.deleteHostGroup(userId, groupId) };
  }

  @Get()
  async getHosts(@Request() request): Promise<GetHostsResponse> {
    const userId = request.user.sub;
    return await this.hostService.getHostList(userId);
  }

  @Get(':hostUid')
  async getHost(@Request() request, @Param('hostUid') hostUid: string): Promise<HostResponse> {
    const userId = request.user.sub;
    return await this.hostService.findHost(userId, hostUid);
  }

  @LogAction('host.change')
  @Put(':hostUid')
  async updateHost(
    @Request() request,
    @Param('hostUid') hostUid: string,
    @Body() hostInfo: UpdateHostClientDto
  ): Promise<GetHostsResponse> {
    const userId = request.user.sub;
    return { host_groups: await this.hostService.updateHost(userId, hostUid, hostInfo) };
  }

  @LogAction('host.move')
  @Post(':hostUid/move')
  async moveHost(
    @Request() request,
    @Param('hostUid') hostUid: string,
    @Body() body: MoveHostDto
  ): Promise<GetHostsResponse> {
    const userId = request.user.sub;
    return {
      host_groups: await this.hostService.moveHost(userId, hostUid, body.targetGroupId),
    };
  }

  @LogAction('host.delete')
  @Delete(':hostUid')
  async deleteHost(
    @Request() request,
    @Param('hostUid') hostUid: string
  ): Promise<GetHostsResponse> {
    const userId = request.user.sub;
    return { host_groups: await this.hostService.deleteHost(userId, hostUid) };
  }

  @LogAction('host.mark_ha')
  @Post(':hostUid/mark-ha')
  async markHa(
    @Request() request,
    @Param('hostUid') hostUid: string,
    @Body() body: MarkHaDto
  ): Promise<GetHostsResponse> {
    const userId = request.user.sub;
    return { host_groups: await this.hostService.markGroupHa(userId, hostUid, body?.groupName) };
  }
}
