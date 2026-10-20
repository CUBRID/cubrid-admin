import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import { setSelectedGroup, moveHost } from '../../../host/hostSlice';
import { orderedGroupEntries, sortHostUidsByHaRole, UNGROUPED_GROUP_ID, HOST_DRAG_MIME } from '../../../host/hostGroupUtils';
import ServerListItem from './ServerListItem';
import { TreeNode } from '../../../../components/domain/tree/TreeNode';
import { useCM } from '../../../../constants/useCM';

export default function HostGroupTree({
  hostGroups,
  selectedGroupUid,
  selectedHostUid,
  authorizedHosts,
  haInfo,
  onContextMenu,
  onGroupContextMenu,
  onHostActivate,
  selectedHostUids,
  onSelectedHostUidsChange,
}) {
  const CM = useCM();
  const dispatch = useDispatch();
  const [expandedGroups, setExpandedGroups] = useState(() => new Set());
  const [focusedHostUid, setFocusedHostUid] = useState(selectedHostUid);
  const [draggedHost, setDraggedHost] = useState(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState(null);
  const draggedHostRef = useRef(null);
  // Anchor for shift-click range selection — the last host clicked WITHOUT
  // shift (plain or cmd/ctrl click). Not reset by shift-clicks themselves,
  // matching standard file-manager range-select behavior.
  const lastClickedHostUidRef = useRef(null);

  // External activation (or host deletion) should bring list focus back in
  // sync. Merely focusing another row does not change selectedHostUid.
  useEffect(() => {
    setFocusedHostUid(selectedHostUid);
  }, [selectedHostUid]);

  const clearDragState = useCallback(() => {
    draggedHostRef.current = null;
    setDraggedHost(null);
    setDropTargetGroupId(null);
  }, []);

  const handleHostDragStart = useCallback((e, hostUid, sourceGroupId) => {
    const payload = { hostUid, sourceGroupId };
    draggedHostRef.current = payload;
    setDraggedHost(payload);
    e.dataTransfer.setData(HOST_DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleHostDragEnd = useCallback(() => {
    clearDragState();
  }, [clearDragState]);

  const handleGroupDragOver = useCallback((e, groupId) => {
    const payload = draggedHostRef.current;
    if (!payload) return;
    e.preventDefault();
    if (payload.sourceGroupId === groupId) {
      e.dataTransfer.dropEffect = 'none';
      setDropTargetGroupId(null);
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    setDropTargetGroupId(groupId);
  }, []);

  const handleGroupDragLeave = useCallback((e, groupId) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropTargetGroupId((prev) => (prev === groupId ? null : prev));
    }
  }, []);

  const handleGroupDrop = useCallback(async (e, groupId) => {
    e.preventDefault();
    e.stopPropagation();

    let payload = draggedHostRef.current || draggedHost;
    if (!payload) {
      try {
        payload = JSON.parse(e.dataTransfer.getData(HOST_DRAG_MIME));
      } catch {
        clearDragState();
        return;
      }
    }

    clearDragState();

    if (!payload?.hostUid) {
      return;
    }

    // Dragging a host that's part of the current multi-selection moves every
    // selected host, not just the one under the cursor — matching how
    // multi-select drags work in a normal file manager.
    const hostUidsToMove =
      selectedHostUids?.size > 1 && selectedHostUids.has(payload.hostUid)
        ? [...selectedHostUids]
        : [payload.hostUid];

    // Each host may currently live in a different group when moving a
    // multi-selection, so look up each one's own current group instead of
    // relying on the single dragged host's sourceGroupId.
    const currentGroupIdByHostUid = new Map();
    for (const [gid, group] of Object.entries(hostGroups || {})) {
      for (const uid of Object.keys(group.hosts || {})) {
        currentGroupIdByHostUid.set(uid, gid);
      }
    }

    const targets = hostUidsToMove.filter((uid) => currentGroupIdByHostUid.get(uid) !== groupId);
    if (targets.length === 0) {
      return;
    }

    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.add(groupId);
      return next;
    });

    for (const hostUid of targets) {
      await dispatch(moveHost({ hostUid, targetGroupId: groupId }));
    }
  }, [clearDragState, dispatch, selectedHostUids, hostGroups]);

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // A single click both selects and toggles expand/collapse — no double-click needed.
  const handleGroupSelect = (groupId) => {
    dispatch(setSelectedGroup({ groupId, hostUid: selectedHostUid }));
    toggleGroup(groupId);
  };

  const allEntries = orderedGroupEntries(hostGroups);
  const groupEntries = allEntries.filter(([groupId]) => groupId !== UNGROUPED_GROUP_ID);
  const ungroupedEntry = allEntries.find(([groupId]) => groupId === UNGROUPED_GROUP_ID);
  const ungroupedHostsMap = ungroupedEntry?.[1]?.hosts || {};
  const ungroupedHostUids = sortHostUidsByHaRole(Object.keys(ungroupedHostsMap), ungroupedHostsMap, haInfo);
  const isUngroupedDropTarget = dropTargetGroupId === UNGROUPED_GROUP_ID && draggedHost?.sourceGroupId !== UNGROUPED_GROUP_ID;

  // Flattened top-to-bottom host order (regardless of group collapse state)
  // for shift-click range selection — must match the order rendered below.
  const flattenedHostUids = [
    ...groupEntries.flatMap(([, group]) => {
      const hostsMap = group.hosts || {};
      return sortHostUidsByHaRole(Object.keys(hostsMap), hostsMap, haInfo);
    }),
    ...ungroupedHostUids,
  ];

  const handleMultiSelect = useCallback((e, uid) => {
    if (!onSelectedHostUidsChange) return;

    if (e.shiftKey && lastClickedHostUidRef.current) {
      const startIdx = flattenedHostUids.indexOf(lastClickedHostUidRef.current);
      const endIdx = flattenedHostUids.indexOf(uid);
      if (startIdx !== -1 && endIdx !== -1) {
        const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        onSelectedHostUidsChange(new Set(flattenedHostUids.slice(from, to + 1)));
        return;
      }
    }

    if (e.metaKey || e.ctrlKey) {
      onSelectedHostUidsChange((prev) => {
        const next = new Set(prev);
        if (next.has(uid)) next.delete(uid);
        else next.add(uid);
        return next;
      });
      lastClickedHostUidRef.current = uid;
      return;
    }

    // Plain click on a host that's already part of the current
    // multi-selection: leave the selection alone instead of collapsing it.
    // A drag can start from the exact same mousedown that produced this
    // click (browsers don't always suppress click cleanly once a drag
    // begins), so clearing here was intermittently wiping the selection
    // out from under a multi-host drag before handleGroupDrop ever saw it.
    if (selectedHostUids?.has(uid)) {
      lastClickedHostUidRef.current = uid;
      return;
    }

    // Plain click on a host outside the current selection — clear
    // multi-select, ServerListItem still runs its own normal
    // single-select/activate-tab logic for this case.
    onSelectedHostUidsChange(new Set());
    lastClickedHostUidRef.current = uid;
  }, [flattenedHostUids, onSelectedHostUidsChange, selectedHostUids]);

  return (
    <div className="py-1">
      {groupEntries.map(([groupId, group]) => {
        const hostsMap = group.hosts || {};
        const hostUids = sortHostUidsByHaRole(Object.keys(hostsMap), hostsMap, haInfo);
        const isExpanded = expandedGroups.has(groupId);
        const isGroupSelected = selectedGroupUid === groupId;
        const isDropTarget = dropTargetGroupId === groupId && draggedHost?.sourceGroupId !== groupId;

        return (
          <div
            key={groupId}
            onDragOver={(e) => handleGroupDragOver(e, groupId)}
            onDragLeave={(e) => handleGroupDragLeave(e, groupId)}
            onDrop={(e) => handleGroupDrop(e, groupId)}
            className={`rounded-md transition-colors ${
              isDropTarget ? 'bg-amber-500/8 ring-1 ring-amber-400/40' : ''
            }`}
          >
            <TreeNode
              id={groupId}
              label={group.name}
              icon="folder"
              level={0}
              isActive={isGroupSelected}
              hasChildren={hostUids.length > 0}
              isExpanded={isExpanded}
              open={isExpanded}
              onToggle={() => toggleGroup(groupId)}
              onSelect={() => handleGroupSelect(groupId)}
              onContextMenu={(e) => {
                if (onGroupContextMenu) onGroupContextMenu(e, groupId, group.name);
              }}
            >
              {hostUids.map((uid) => {
                const host = hostsMap[uid];
                return (
                  <div key={uid} className="pl-2">
                    <ServerListItem
                      host={host}
                      isSelected={focusedHostUid === uid}
                      isMultiSelected={selectedHostUids?.has(uid)}
                      onMultiSelect={handleMultiSelect}
                      isAuthorized={authorizedHosts.includes(uid)}
                      haInfo={haInfo[uid]}
                      onContextMenu={onContextMenu}
                      onSelect={setFocusedHostUid}
                      onActivate={onHostActivate}
                      compact
                      draggable
                      isDragging={draggedHost?.hostUid === uid}
                      onDragStart={(e) => handleHostDragStart(e, uid, groupId)}
                      onDragEnd={handleHostDragEnd}
                    />
                  </div>
                );
              })}
            </TreeNode>
          </div>
        );
      })}

      {/* Always rendered (even with zero hosts) so it stays a valid drop target for un-grouping a host. */}
      <div
        onDragOver={(e) => handleGroupDragOver(e, UNGROUPED_GROUP_ID)}
        onDragLeave={(e) => handleGroupDragLeave(e, UNGROUPED_GROUP_ID)}
        onDrop={(e) => handleGroupDrop(e, UNGROUPED_GROUP_ID)}
        className={`rounded-md transition-colors ${ungroupedHostUids.length === 0 ? 'min-h-[8px]' : ''} ${
          isUngroupedDropTarget ? 'bg-amber-500/8 ring-1 ring-amber-400/40' : ''
        }`}
      >
        {ungroupedHostUids.map((uid) => {
          const host = ungroupedHostsMap[uid];
          return (
            <ServerListItem
              key={uid}
              host={host}
              isSelected={focusedHostUid === uid}
              isMultiSelected={selectedHostUids?.has(uid)}
              onMultiSelect={handleMultiSelect}
              isAuthorized={authorizedHosts.includes(uid)}
              haInfo={haInfo[uid]}
              onContextMenu={onContextMenu}
              onSelect={setFocusedHostUid}
              onActivate={onHostActivate}
              draggable
              isDragging={draggedHost?.hostUid === uid}
              onDragStart={(e) => handleHostDragStart(e, uid, UNGROUPED_GROUP_ID)}
              onDragEnd={handleHostDragEnd}
            />
          );
        })}
      </div>
    </div>
  );
}
