import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Select } from '../components/ui';
import { useAuth } from '../state/auth';

interface Branch {
  id: string;
  name: string;
}

interface RoleOption {
  id: string;
  name: string;
}

interface MemberRole {
  membershipRoleId: string;
  name: string;
  branch: string | null;
}

interface Member {
  membershipId: string;
  membershipStatus: 'active' | 'suspended';
  id: string;
  fullName: string;
  email: string | null;
  mobile: string | null;
  username: string | null;
  roles: MemberRole[];
}

const emptyCreateForm = {
  fullName: '',
  username: '',
  password: '',
  roleId: '',
  branchId: '',
};

/** Team management (docs/DOMAIN_MODEL.md "Team accounts") - a merchant creates POS/accountant/... accounts with only a name, username, password and role, no email required. */
export function TeamPage() {
  const { t } = useTranslation('team');
  const { hasPermission } = useAuth();
  const canManage = hasPermission('iam.users.manage');

  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyMembershipRoleId, setBusyMembershipRoleId] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [addRoleTargetUserId, setAddRoleTargetUserId] = useState<string | null>(null);
  const [addRoleForm, setAddRoleForm] = useState({ roleId: '', branchId: '' });
  const [addRoleError, setAddRoleError] = useState<string | null>(null);
  const [addingRole, setAddingRole] = useState(false);

  const load = async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await api.get('/iam/users', { pageSize: 100 });
      setMembers(res.data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : t('loadError'));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (!hasPermission('iam.users.view')) return;
    load();
    api
      .get('/tenancy/branches')
      .then((r) => setBranches(r))
      .catch(() => undefined);
    api
      .get('/iam/roles')
      .then((r: { id: string; name: string }[]) =>
        // "Integration" is a non-human system-actor role, never assignable from this UI.
        setRoles(r.filter((role) => role.name !== 'Integration')),
      )
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreateModal = () => {
    setCreateForm(emptyCreateForm);
    setCreateError(null);
    setCreateModalOpen(true);
  };

  const onCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await api.post('/iam/users', {
        fullName: createForm.fullName,
        username: createForm.username,
        password: createForm.password,
        roleId: createForm.roleId,
        branchId: createForm.branchId || undefined,
      });
      setCreateModalOpen(false);
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : t('errors.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const openAddRoleModal = (userId: string) => {
    setAddRoleTargetUserId(userId);
    setAddRoleForm({ roleId: '', branchId: '' });
    setAddRoleError(null);
  };

  const onAddRoleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!addRoleTargetUserId) return;
    setAddRoleError(null);
    setAddingRole(true);
    try {
      await api.post(`/iam/users/${addRoleTargetUserId}/roles`, {
        roleId: addRoleForm.roleId,
        branchId: addRoleForm.branchId || undefined,
      });
      setAddRoleTargetUserId(null);
      await load();
    } catch (err) {
      setAddRoleError(err instanceof ApiError ? err.message : t('errors.roleActionFailed'));
    } finally {
      setAddingRole(false);
    }
  };

  const removeRole = async (userId: string, membershipRoleId: string) => {
    setActionError(null);
    setBusyMembershipRoleId(membershipRoleId);
    try {
      await api.delete(`/iam/users/${userId}/roles/${membershipRoleId}`);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('errors.roleActionFailed'));
    } finally {
      setBusyMembershipRoleId(null);
    }
  };

  if (!hasPermission('iam.users.view')) {
    return <ErrorBanner message={t('noPermission')} />;
  }

  return (
    <div>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={canManage && <Button onClick={openCreateModal}>{t('addButton')}</Button>}
      />

      <ErrorBanner message={actionError} />
      <ErrorBanner message={listError} />
      {listLoading && <div className="py-6 text-center text-slate-400">{t('loading')}</div>}

      {!listLoading && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2">{t('table.name')}</th>
                  <th className="py-2">{t('table.identifier')}</th>
                  <th className="py-2">{t('table.roles')}</th>
                  <th className="py-2">{t('table.status')}</th>
                  <th className="py-2">{t('table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId} className="border-b last:border-0">
                    <td className="py-2 font-medium">{m.fullName}</td>
                    <td className="py-2 text-slate-500">{m.username ?? m.email ?? m.mobile ?? '—'}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {m.roles.length === 0 && <span className="text-slate-400">{t('noRoles')}</span>}
                        {m.roles.map((r) => (
                          <Badge key={r.membershipRoleId} variant="brand" className="gap-1.5">
                            {r.name}
                            {r.branch && <span className="text-brand-500">· {r.branch}</span>}
                            {canManage && (
                              <button
                                type="button"
                                disabled={busyMembershipRoleId === r.membershipRoleId}
                                onClick={() => removeRole(m.id, r.membershipRoleId)}
                                className="text-brand-700 hover:text-red-600 disabled:opacity-50"
                                aria-label={t('removeRole')}
                              >
                                ✕
                              </button>
                            )}
                          </Badge>
                        ))}
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => openAddRoleModal(m.id)}
                            className="text-xs text-brand-600 hover:underline"
                          >
                            {t('addRole')}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2">
                      {m.membershipStatus === 'active' ? (
                        <span className="text-emerald-600">{t('status.active')}</span>
                      ) : (
                        <span className="text-red-500">{t('status.suspended')}</span>
                      )}
                    </td>
                    <td className="py-2" />
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      {t('empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title={t('createModal.title')}>
        <form onSubmit={onCreateSubmit} className="space-y-3">
          <ErrorBanner message={createError} />
          <Field label={t('createModal.fullName')}>
            <Input
              value={createForm.fullName}
              onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
              required
              autoFocus
            />
          </Field>
          <Field label={t('createModal.username')}>
            <Input
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              pattern="[a-zA-Z0-9_.\-]{3,32}"
              required
              dir="ltr"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('createModal.usernameHint')}</span>
          </Field>
          <Field label={t('createModal.password')}>
            <Input
              type="password"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              minLength={8}
              required
              dir="ltr"
            />
            <span className="mt-1 block text-xs text-slate-500">{t('createModal.passwordHint')}</span>
          </Field>
          <Field label={t('createModal.role')}>
            <Select
              value={createForm.roleId}
              onChange={(e) => setCreateForm({ ...createForm, roleId: e.target.value })}
              required
            >
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('createModal.branch')}>
            <Select
              value={createForm.branchId}
              onChange={(e) => setCreateForm({ ...createForm, branchId: e.target.value })}
            >
              <option value="">{t('createModal.allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="w-full" disabled={creating}>
            {creating ? t('createModal.submitting') : t('createModal.submit')}
          </Button>
        </form>
      </Modal>

      <Modal open={!!addRoleTargetUserId} onClose={() => setAddRoleTargetUserId(null)} title={t('addRoleModal.title')}>
        <form onSubmit={onAddRoleSubmit} className="space-y-3">
          <ErrorBanner message={addRoleError} />
          <Field label={t('addRoleModal.role')}>
            <Select
              value={addRoleForm.roleId}
              onChange={(e) => setAddRoleForm({ ...addRoleForm, roleId: e.target.value })}
              required
            >
              <option value="">—</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('addRoleModal.branch')}>
            <Select
              value={addRoleForm.branchId}
              onChange={(e) => setAddRoleForm({ ...addRoleForm, branchId: e.target.value })}
            >
              <option value="">{t('createModal.allBranches')}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="w-full" disabled={addingRole}>
            {addingRole ? t('addRoleModal.submitting') : t('addRoleModal.submit')}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
