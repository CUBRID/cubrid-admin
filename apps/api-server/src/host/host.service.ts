import { HandleHostErrors } from '@common';
import { HostError } from '@error/index';
import { Injectable, Logger } from '@nestjs/common';
import { UserRepositoryService } from '@repository';
import { HostInfo, User } from '@type/index';
import { AddHostRequest, GetHostsResponse, HostResponse, UpdateHostRequest } from '@api-interfaces';
import { SafeHostGroupsMap } from '@type/collections';
import { v4 as uuidv4 } from 'uuid';
import { forgetCmsToken } from '@cms-https-client/cms-token-activity';
import {
  addHostToGroup,
  countAllHosts,
  createEmptyGroup,
  deleteGroup,
  ensureHostGroupsWritable,
  ensureUngroupedGroup,
  findDuplicateAlias,
  findDuplicateHost,
  findHostRef,
  getHost,
  isValidGroupNameStart,
  MAX_HOST_ALIAS_LENGTH,
  moveHostToGroup,
  removeHostFromUser,
  sanitizeHostGroups,
  toSafeHost,
  updateGroup,
  UNGROUPED_GROUP_ID,
} from './host-group.util';

export type AddHostPayload = AddHostRequest & { groupId?: string };

@Injectable()
export class HostService {
  private readonly logger = new Logger(HostService.name);

  constructor(private readonly repository: UserRepositoryService) {}

  private toResponse(user: User): GetHostsResponse {
    return { host_groups: sanitizeHostGroups(user) };
  }

  @HandleHostErrors()
  async getHostList(userId: string): Promise<GetHostsResponse> {
    this.logger.log(`Getting host list for user: ${userId}`);
    const user = await this.repository.loadUserById(userId);
    const hostGroups = sanitizeHostGroups(user);
    this.logger.log(
      `Found ${countAllHosts(user)} hosts in ${Object.keys(hostGroups).length} groups`
    );
    return { host_groups: hostGroups };
  }

  @HandleHostErrors()
  async addHost(userId: string, hostInfo: AddHostPayload): Promise<SafeHostGroupsMap> {
    this.logger.log(
      `Adding host for user: ${userId}, address: ${hostInfo.address}, port: ${hostInfo.port}, groupId: ${hostInfo.groupId ?? 'new'}`
    );

    const updatedUser = await this.repository.atomicUpdateUser(userId, async (user: User) => {
      const groups = ensureHostGroupsWritable(user);
      if (countAllHosts(user) >= 400) {
        throw HostError.ExceedMaxHosts({ 'current host count': 400 });
      }

      const alias = typeof hostInfo.alias === 'string' ? hostInfo.alias.trim() : '';
      if (!alias) {
        throw HostError.InvalidFormat({ field: 'alias', reason: 'MISSING_OR_BLANK_ALIAS', message: 'An alias is required to add a host.' });
      }
      if (alias.length > MAX_HOST_ALIAS_LENGTH) {
        throw HostError.InvalidFormat({ field: 'alias', reason: 'ALIAS_TOO_LONG', max: MAX_HOST_ALIAS_LENGTH });
      }

      const duplicate = findDuplicateHost(user, { ...hostInfo, alias });
      if (duplicate) {
        throw HostError.DuplicatedHost({ duplicatedHostId: duplicate.uid });
      }

      const duplicateAlias = findDuplicateAlias(user, alias);
      if (duplicateAlias) {
        throw HostError.DuplicatedAlias({ duplicatedHostId: duplicateAlias.uid, alias });
      }

      const newHost: HostInfo = {
        uid: uuidv4(),
        id: hostInfo.id,
        address: hostInfo.address,
        port: hostInfo.port,
        password: hostInfo.password,
        alias,
        initialLogin: true,
        dbProfiles: {},
      };

      const { groupId } = hostInfo;
      if (groupId) {
        if (!groups[groupId]) {
          throw HostError.InvalidFormat({ field: 'groupId', reason: 'GROUP_NOT_FOUND', message: `Group "${groupId}" does not exist.` });
        }
        addHostToGroup(user, groupId, newHost);
      } else {
        ensureUngroupedGroup(user);
        addHostToGroup(user, UNGROUPED_GROUP_ID, newHost);
      }

      this.logger.log(`Host added: ${newHost.uid}`);
      return user;
    });

    return sanitizeHostGroups(updatedUser);
  }

  @HandleHostErrors()
  async createHostGroup(userId: string, name: string): Promise<SafeHostGroupsMap> {
    const updatedUser = await this.repository.atomicUpdateUser(userId, async (user: User) => {
      const trimmed = String(name ?? '').trim();
      if (!trimmed) {
        throw HostError.InvalidFormat({ field: 'name', reason: 'BLANK_GROUP_NAME_NOT_ALLOWED', message: 'A group name is required.' });
      }
      if (!isValidGroupNameStart(trimmed)) {
        throw HostError.InvalidFormat({ field: 'name', reason: 'GROUP_NAME_INVALID_START', message: `"${trimmed}" is not a valid group name — it must start with a letter or digit.` });
      }
      createEmptyGroup(user, trimmed);
      return user;
    });
    return sanitizeHostGroups(updatedUser);
  }

  @HandleHostErrors()
  async updateHostGroup(
    userId: string,
    groupId: string,
    patch: { name?: string; defaultHostUid?: string | null }
  ): Promise<SafeHostGroupsMap> {
    const updatedUser = await this.repository.atomicUpdateUser(userId, async (user: User) => {
      try {
        const ok = updateGroup(user, groupId, patch);
        if (!ok) {
          throw HostError.InvalidFormat({ field: 'groupId', reason: 'GROUP_NOT_FOUND', message: `Group "${groupId}" does not exist.` });
        }
      } catch (e: any) {
        const code = String(e?.message || '');
        if (code === 'BLANK_GROUP_NAME_NOT_ALLOWED') {
          throw HostError.InvalidFormat({ field: 'name', reason: 'BLANK_GROUP_NAME_NOT_ALLOWED', message: 'A group name is required.' });
        }
        if (code === 'GROUP_NAME_INVALID_START') {
          throw HostError.InvalidFormat({ field: 'name', reason: 'GROUP_NAME_INVALID_START', message: `"${patch.name}" is not a valid group name — it must start with a letter or digit.` });
        }
        if (code === 'DEFAULT_HOST_NOT_IN_GROUP') {
          throw HostError.InvalidFormat({ field: 'defaultHostUid', reason: 'DEFAULT_HOST_NOT_IN_GROUP', message: 'The default host must already be a member of this group.' });
        }
        if (code === 'CANNOT_RENAME_UNGROUPED') {
          throw HostError.InvalidFormat({ field: 'name', reason: 'CANNOT_RENAME_UNGROUPED', message: 'The "Ungrouped" bucket cannot be renamed.' });
        }
        throw e;
      }
      return user;
    });
    return sanitizeHostGroups(updatedUser);
  }

  @HandleHostErrors()
  async deleteHostGroup(userId: string, groupId: string): Promise<SafeHostGroupsMap> {
    const updatedUser = await this.repository.atomicUpdateUser(userId, async (user: User) => {
      if (groupId === UNGROUPED_GROUP_ID) {
        throw HostError.InvalidFormat({ field: 'groupId', reason: 'CANNOT_DELETE_UNGROUPED', message: 'The "Ungrouped" bucket cannot be deleted.' });
      }
      deleteGroup(user, groupId);
      return user;
    });
    return sanitizeHostGroups(updatedUser);
  }

  @HandleHostErrors()
  async updateHost(
    userId: string,
    hostUid: string,
    hostInfo: UpdateHostRequest
  ): Promise<SafeHostGroupsMap> {
    const updatedUser = await this.repository.atomicUpdateUser(userId, async (user: User) => {
      const ref = findHostRef(user, hostUid);
      if (!ref) {
        throw HostError.NoSuchHost({ hostUid });
      }

      const existingHost = ref.host;
      let proposedAlias = existingHost.alias;
      if (hostInfo.alias !== undefined) {
        const trimmed = String(hostInfo.alias).trim();
        if (!trimmed) {
          throw HostError.InvalidFormat({ field: 'alias', reason: 'BLANK_ALIAS_NOT_ALLOWED', message: 'The alias cannot be blank.' });
        }
        if (trimmed.length > MAX_HOST_ALIAS_LENGTH) {
          throw HostError.InvalidFormat({ field: 'alias', reason: 'ALIAS_TOO_LONG', max: MAX_HOST_ALIAS_LENGTH });
        }
        proposedAlias = trimmed;
      }

      const duplicate = findDuplicateHost(
        user,
        {
          address: hostInfo.address ?? existingHost.address,
          port: hostInfo.port ?? existingHost.port,
          id: hostInfo.id ?? existingHost.id,
          alias: proposedAlias,
        },
        hostUid
      );
      if (duplicate) {
        throw HostError.DuplicatedHost({ duplicatedHostId: duplicate.uid });
      }

      const duplicateAlias = findDuplicateAlias(user, proposedAlias, hostUid);
      if (duplicateAlias) {
        throw HostError.DuplicatedAlias({ duplicatedHostId: duplicateAlias.uid, alias: proposedAlias });
      }

      // A different server or CMS account makes the stored session meaningless.
      const nextTarget = [
        hostInfo.address ?? existingHost.address,
        hostInfo.port ?? existingHost.port,
        hostInfo.id ?? existingHost.id,
        hostInfo.password ?? existingHost.password,
      ];
      const sameTarget = [existingHost.address, existingHost.port, existingHost.id, existingHost.password]
        .every((value, i) => String(value) === String(nextTarget[i]));
      if (!sameTarget) forgetCmsToken(existingHost.token);

      ref.group.hosts[hostUid] = {
        uid: hostUid,
        id: hostInfo.id ?? existingHost.id,
        address: hostInfo.address ?? existingHost.address,
        port: hostInfo.port ?? existingHost.port,
        password: hostInfo.password ?? existingHost.password,
        initialLogin: existingHost.initialLogin ?? true,
        alias: proposedAlias,
        token: hostInfo.token ?? existingHost.token,
        cmsTokenIssuedAt: sameTarget ? existingHost.cmsTokenIssuedAt : undefined,
        cmsTokenActiveTimeSec: sameTarget ? existingHost.cmsTokenActiveTimeSec : undefined,
        dbProfiles: hostInfo.dbProfiles ?? existingHost.dbProfiles ?? {},
      };

      return user;
    });

    return sanitizeHostGroups(updatedUser);
  }

  @HandleHostErrors()
  async moveHost(
    userId: string,
    hostUid: string,
    targetGroupId: string
  ): Promise<SafeHostGroupsMap> {
    const updatedUser = await this.repository.atomicUpdateUser(userId, async (user: User) => {
      const ok = moveHostToGroup(user, hostUid, targetGroupId);
      if (!ok) {
        const ref = findHostRef(user, hostUid);
        if (!ref) {
          throw HostError.NoSuchHost({ hostUid });
        }
        throw HostError.InvalidFormat({ field: 'targetGroupId', reason: 'GROUP_NOT_FOUND', message: `Group "${targetGroupId}" does not exist.` });
      }
      return user;
    });
    return sanitizeHostGroups(updatedUser);
  }

  @HandleHostErrors()
  async deleteHost(userId: string, hostUid: string): Promise<SafeHostGroupsMap> {
    const updatedUser = await this.repository.atomicUpdateUser(userId, async (user: User) => {
      const removedToken = getHost(user, hostUid)?.token;
      if (!removeHostFromUser(user, hostUid)) {
        throw HostError.NoSuchHost({ hostUid });
      }
      forgetCmsToken(removedToken);
      return user;
    });
    return sanitizeHostGroups(updatedUser);
  }

  @HandleHostErrors()
  async findHostInternal(userId: string, hostUid: string): Promise<HostInfo> {
    const user = await this.repository.loadUserById(userId);
    const host = getHost(user, hostUid);
    if (!host) {
      throw HostError.NoSuchHost({ hostUid });
    }
    return { ...host, initialLogin: host.initialLogin ?? true };
  }

  async findHost(userId: string, hostUid: string): Promise<HostResponse> {
    return toSafeHost(await this.findHostInternal(userId, hostUid));
  }

  /** Mark the group containing this host as an HA cluster group. */
  @HandleHostErrors()
  async markGroupHa(userId: string, hostUid: string, groupName?: string): Promise<SafeHostGroupsMap> {
    const updatedUser = await this.repository.atomicUpdateUser(userId, async (user: User) => {
      const ref = findHostRef(user, hostUid);
      if (!ref) {
        throw HostError.NoSuchHost({ hostUid });
      }
      if (groupName?.trim()) {
        ref.group.name = groupName.trim();
      }
      return user;
    });
    return sanitizeHostGroups(updatedUser);
  }
}
