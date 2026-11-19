import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/api/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { ErrorNotice } from "@/components/ui/ErrorNotice";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import {
  acceptInvitation,
  changeMemberRoles,
  createRole,
  deleteRole,
  inviteMember,
  listMembers,
  listPermissionCatalog,
  listRoles,
  resendInvitation,
  revokeMember,
  updateRole,
  type MemberView,
  type PermissionView,
  type RoleView,
} from "@/api/users";

/**
 * USUARIOS page (fase 10 · ADR-020): members, invitations and roles of the
 * ACTIVE tenant. The UI is courtesy — the backend PermissionGuard is the
 * law — so every action here is also enforced server-side:
 *  - listing/inviting/changing/revoking members needs users.manage;
 *  - role authoring needs roles.manage (read: either of the two);
 *  - system roles ("Administrador") are immutable server-side and shown
 *    locked in the UI.
 * The invitation token is returned ONCE by the API (no SMTP in foundation):
 * it is shown in a highlighted box with a copy button and then discarded
 * from state.
 */

const when = (iso: string | null): string =>
  iso === null ? "—" : new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });

const statusBadge = (status: MemberView["status"]): { tone: BadgeTone; label: string } => {
  switch (status) {
    case "ACTIVE":
      return { tone: "success", label: "Activo" };
    case "PENDING":
      return { tone: "warning", label: "Invitación pendiente" };
    default:
      return { tone: "danger", label: "Revocado" };
  }
};

export function UsersPage() {
  const { activeTenantId, can } = useAuth();
  const canManageUsers = can("users.manage");
  const canManageRoles = can("roles.manage");
  const canReadRoles = canManageUsers || canManageRoles;

  const [members, setMembers] = useState<readonly MemberView[]>([]);
  const [roles, setRoles] = useState<readonly RoleView[]>([]);
  const [catalog, setCatalog] = useState<readonly PermissionView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<ApiError | null>(null);

  // Invitation shown ONCE (from invite or resend) until the next action.
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRoleIds, setInviteRoleIds] = useState<readonly string[]>([]);

  // Per-member role editor
  const [rolesTarget, setRolesTarget] = useState<string | null>(null);
  const [rolesDraft, setRolesDraft] = useState<readonly string[]>([]);

  // Role authoring
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");
  const [newRolePerms, setNewRolePerms] = useState<readonly string[]>([]);
  const [permsTarget, setPermsTarget] = useState<string | null>(null);
  const [permsDraft, setPermsDraft] = useState<readonly string[]>([]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      if (canManageUsers) {
        setMembers(await listMembers());
      }
      if (canReadRoles) {
        const [roleList, permCatalog] = await Promise.all([listRoles(), listPermissionCatalog()]);
        setRoles(roleList);
        setCatalog(permCatalog);
      }
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause);
    } finally {
      setLoading(false);
    }
  };

  // First load + every tenant switch or permission-grant change refetches
  // (users/roles are per tenant, and the fetches are gated by the grants the
  // AuthProvider loads ASYNC after mount — without grants in the deps the
  // first pass would run unpermitted and never refetch).
  const firstRun = useRef(true);
  const prevTenant = useRef(activeTenantId);
  const prevGrants = useRef("");
  const grantKey = `${canManageUsers ? "u" : "-"}${canReadRoles ? "r" : "-"}`;
  useEffect(() => {
    const grantsChanged = prevGrants.current !== grantKey;
    if (!firstRun.current && prevTenant.current === activeTenantId && !grantsChanged) return;
    firstRun.current = false;
    prevTenant.current = activeTenantId;
    prevGrants.current = grantKey;
    setInvitationToken(null);
    setRolesTarget(null);
    setPermsTarget(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId, canManageUsers, canReadRoles]);

  const toggle = (list: readonly string[], id: string): readonly string[] =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const copyToken = async () => {
    if (invitationToken === null) return;
    try {
      await navigator.clipboard.writeText(invitationToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const submitInvite = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setSuccess(null);
    try {
      const command: { email: string; roleIds: readonly string[]; displayName?: string } = {
        email: inviteEmail.trim(),
        roleIds: inviteRoleIds,
      };
      const name = inviteName.trim();
      if (name !== "") command.displayName = name;
      const outcome = await inviteMember(command);
      setInvitationToken(outcome.invitationToken);
      setCopied(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRoleIds([]);
      setSuccess(`Invitación creada para ${outcome.member.email}. Comparte el token por tu canal.`);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError) setFormError(cause);
    } finally {
      setBusy(false);
    }
  };

  const submitResend = async (membershipId: string) => {
    setBusy(true);
    setFormError(null);
    setSuccess(null);
    try {
      const outcome = await resendInvitation(membershipId);
      setInvitationToken(outcome.invitationToken);
      setCopied(false);
      setSuccess(`Invitación reenviada: el token anterior quedó invalidado.`);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError) setFormError(cause);
    } finally {
      setBusy(false);
    }
  };

  const submitMemberRoles = async (membershipId: string) => {
    setBusy(true);
    setFormError(null);
    setSuccess(null);
    try {
      const updated = await changeMemberRoles(membershipId, rolesDraft);
      setRolesTarget(null);
      setSuccess(`Roles actualizados para ${updated.email}.`);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError) setFormError(cause);
    } finally {
      setBusy(false);
    }
  };

  const submitRevoke = async (membershipId: string) => {
    setBusy(true);
    setFormError(null);
    setSuccess(null);
    try {
      const revoked = await revokeMember(membershipId);
      setSuccess(`${revoked.email} quedó sin acceso a la organización.`);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError) setFormError(cause);
    } finally {
      setBusy(false);
    }
  };

  const submitCreateRole = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setSuccess(null);
    try {
      const command: { name: string; permissions: readonly string[]; description?: string } = {
        name: newRoleName.trim(),
        permissions: newRolePerms,
      };
      const description = newRoleDesc.trim();
      if (description !== "") command.description = description;
      const created = await createRole(command);
      setNewRoleName("");
      setNewRoleDesc("");
      setNewRolePerms([]);
      setSuccess(`Rol "${created.name}" creado.`);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError) setFormError(cause);
    } finally {
      setBusy(false);
    }
  };

  const submitUpdateRole = async (roleId: string) => {
    setBusy(true);
    setFormError(null);
    setSuccess(null);
    try {
      const updated = await updateRole(roleId, { permissions: permsDraft });
      setPermsTarget(null);
      setSuccess(`Permisos del rol "${updated.name}" actualizados.`);
      await load();
    } catch (cause) {
      if (cause instanceof ApiError) setFormError(cause);
    } finally {
      setBusy(false);
    }
  };

  const submitDeleteRole = async (roleId: string) => {
    setBusy(true);
    setFormError(null);
    setSuccess(null);
    try {
      await deleteRole(roleId);
      setSuccess("Rol eliminado.");
      await load();
    } catch (cause) {
      if (cause instanceof ApiError) setFormError(cause);
    } finally {
      setBusy(false);
    }
  };

  // ---- PUBLIC invitation acceptance is a separate route (see App.tsx) ----

  if (!canManageUsers && !canReadRoles) {
    return (
      <div className="page">
        <div className="card card--pad">
          <div className="card__title">Usuarios y accesos</div>
          <p className="org-page__muted">
            No tienes permisos para administrar usuarios ni roles en esta organización.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {success !== null ? (
        <p className="org-page__ok" role="status">
          {success}
        </p>
      ) : null}
      {error !== null ? <ErrorNotice error={error} onRetry={() => void load()} /> : null}

      <div className="org-grid">
        {canManageUsers ? (
          <div className="card card--pad org-grid__wide">
            <div className="card__title">Miembros de la organización</div>
            {loading ? (
              <span className="loading-block">
                <span className="spinner" aria-hidden="true" /> Cargando miembros…
              </span>
            ) : members.length === 0 ? (
              <p className="org-page__muted">Sin miembros registrados.</p>
            ) : (
              <div style={{ display: "grid", gap: "var(--space-4)" }}>
                {members.map((member) => {
                  const badge = statusBadge(member.status);
                  return (
                    <div key={member.membershipId} className="org-page__product">
                      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
                        <strong>{member.displayName}</strong>
                        <span className="org-page__muted">{member.email}</span>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                        {member.roles.length === 0 ? (
                          <span className="org-page__muted">Sin roles asignados</span>
                        ) : (
                          member.roles.map((role) => (
                            <span key={role.roleId} className="org-page__code">
                              {role.roleName}
                            </span>
                          ))
                        )}
                      </div>
                      <p className="org-page__muted" style={{ margin: 0 }}>
                        Invitado {when(member.invitedAt)} · Aceptado {when(member.acceptedAt)}
                      </p>
                      {member.status !== "REVOKED" ? (
                        <div className="org-page__add" style={{ marginTop: "var(--space-2)" }}>
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            aria-expanded={rolesTarget === member.membershipId}
                            onClick={() => {
                              if (rolesTarget === member.membershipId) {
                                setRolesTarget(null);
                              } else {
                                setRolesTarget(member.membershipId);
                                setRolesDraft(member.roles.map((role) => role.roleId));
                                setFormError(null);
                              }
                            }}
                          >
                            {rolesTarget === member.membershipId ? "Cancelar" : "Cambiar roles"}
                          </button>
                          {member.invitationPending ? (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={busy}
                              onClick={() => void submitResend(member.membershipId)}
                            >
                              Reenviar invitación
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            disabled={busy}
                            onClick={() => void submitRevoke(member.membershipId)}
                          >
                            Revocar acceso
                          </button>
                          {rolesTarget === member.membershipId ? (
                            <form
                              className="org-form-grid"
                              onSubmit={(event) => {
                                event.preventDefault();
                                void submitMemberRoles(member.membershipId);
                              }}
                            >
                              <fieldset
                                style={{ display: "grid", gap: "var(--space-1)", gridColumn: "1 / -1" }}
                              >
                                <legend className="field__label">Roles del member</legend>
                                {roles.map((role) => (
                                  <label
                                    key={role.id}
                                    style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={rolesDraft.includes(role.id)}
                                      onChange={() => setRolesDraft((prev) => toggle(prev, role.id))}
                                    />
                                    {role.name}
                                    {role.system ? <span className="org-page__muted">(sistema)</span> : null}
                                  </label>
                                ))}
                              </fieldset>
                              <div>
                                <button type="submit" className="btn btn--primary" disabled={busy}>
                                  {busy ? "Guardando…" : "Guardar roles"}
                                </button>
                              </div>
                            </form>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {canManageUsers ? (
          <div className="card card--pad">
            <div className="card__title">Invitar a un colaborador</div>
            <form className="org-form-grid" onSubmit={submitInvite}>
              <div className="field">
                <label className="field__label" htmlFor="invite-email">
                  Correo *
                </label>
                <input
                  id="invite-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="persona@empresa.com"
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="invite-name">
                  Nombre a mostrar
                </label>
                <input
                  id="invite-name"
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="Ana López"
                />
              </div>
              <fieldset style={{ display: "grid", gap: "var(--space-1)", gridColumn: "1 / -1" }}>
                <legend className="field__label">Roles *</legend>
                {roles.map((role) => (
                  <label key={role.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <input
                      type="checkbox"
                      checked={inviteRoleIds.includes(role.id)}
                      onChange={() => setInviteRoleIds((prev) => toggle(prev, role.id))}
                    />
                    {role.name}
                  </label>
                ))}
              </fieldset>
              {formError !== null ? (
                <p className="org-page__form-error" style={{ gridColumn: "1 / -1" }}>
                  {formError.userMessage}
                </p>
              ) : null}
              <div>
                <button type="submit" className="btn btn--primary" disabled={busy || inviteRoleIds.length === 0}>
                  {busy ? "Enviando…" : "Crear invitación"}
                </button>
              </div>
            </form>
            {invitationToken !== null ? (
              <div style={{ marginTop: "var(--space-4)" }}>
                <p className="org-page__muted" style={{ margin: 0 }}>
                  Token de invitación (se muestra una sola vez; TTL 7 días):
                </p>
                <code style={{ wordBreak: "break-all", display: "block", marginTop: "var(--space-2)" }}>
                  {invitationToken}
                </code>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => void copyToken()}>
                  {copied ? "¡Copiado!" : "Copiar token"}
                </button>
                <p className="org-page__muted" style={{ marginTop: "var(--space-2)" }}>
                  Comparte el enlace: <code>/aceptar-invitacion?token=…</code>
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {canReadRoles ? (
          <div className="card card--pad org-grid__wide">
            <div className="card__title">Roles y permisos</div>
            {loading ? (
              <span className="loading-block">
                <span className="spinner" aria-hidden="true" /> Cargando roles…
              </span>
            ) : (
              <div style={{ display: "grid", gap: "var(--space-4)" }}>
                {roles.map((role) => (
                  <div key={role.id} className="org-page__product">
                    <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)" }}>
                      <strong>{role.name}</strong>
                      {role.system ? <Badge tone="info">Rol del sistema</Badge> : <Badge tone="neutral">Personalizado</Badge>}
                    </div>
                    {role.description !== null ? (
                      <p className="org-page__muted" style={{ margin: 0 }}>
                        {role.description}
                      </p>
                    ) : null}
                    <p className="org-page__muted" style={{ margin: 0 }}>
                      {role.permissions.length} permisos
                    </p>
                    {canManageRoles ? (
                      <div className="org-page__add" style={{ marginTop: "var(--space-2)" }}>
                        {role.system ? null : (
                          <>
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              aria-expanded={permsTarget === role.id}
                              onClick={() => {
                                if (permsTarget === role.id) {
                                  setPermsTarget(null);
                                } else {
                                  setPermsTarget(role.id);
                                  setPermsDraft([...role.permissions]);
                                  setFormError(null);
                                }
                              }}
                            >
                              {permsTarget === role.id ? "Cancelar" : "Editar permisos"}
                            </button>
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              disabled={busy}
                              onClick={() => void submitDeleteRole(role.id)}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                        {permsTarget === role.id ? (
                          <form
                            className="org-form-grid"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void submitUpdateRole(role.id);
                            }}
                          >
                            <fieldset style={{ display: "grid", gap: "var(--space-1)", gridColumn: "1 / -1" }}>
                              <legend className="field__label">Permisos del rol</legend>
                              {catalog.map((permission) => (
                                <label
                                  key={permission.code}
                                  style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={permsDraft.includes(permission.code)}
                                    onChange={() => setPermsDraft((prev) => toggle(prev, permission.code))}
                                  />
                                  <span>
                                    <code>{permission.code}</code> — {permission.name}
                                  </span>
                                </label>
                              ))}
                            </fieldset>
                            <div>
                              <button type="submit" className="btn btn--primary" disabled={busy}>
                                {busy ? "Guardando…" : "Guardar permisos"}
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {canManageRoles ? (
          <div className="card card--pad">
            <div className="card__title">Nuevo rol personalizado</div>
            <form className="org-form-grid" onSubmit={submitCreateRole}>
              <div className="field">
                <label className="field__label" htmlFor="role-name">
                  Nombre *
                </label>
                <input
                  id="role-name"
                  type="text"
                  required
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="Vendedor"
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="role-desc">
                  Descripción
                </label>
                <input
                  id="role-desc"
                  type="text"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                />
              </div>
              <fieldset style={{ display: "grid", gap: "var(--space-1)", gridColumn: "1 / -1" }}>
                <legend className="field__label">Permisos</legend>
                {catalog.map((permission) => (
                  <label key={permission.code} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <input
                      type="checkbox"
                      checked={newRolePerms.includes(permission.code)}
                      onChange={() => setNewRolePerms((prev) => toggle(prev, permission.code))}
                    />
                    <span>
                      <code>{permission.code}</code> — {permission.name}
                    </span>
                  </label>
                ))}
              </fieldset>
              <div>
                <button type="submit" className="btn btn--primary" disabled={busy || newRoleName.trim() === ""}>
                  {busy ? "Creando…" : "Crear rol"}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * PUBLIC screen for invited people (no session): consumes the token from
 * /aceptar-invitacion?token=…, sets the password (new users) and activates
 * the membership. The backend answers 200 idempotently on replay.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const outcome = await acceptInvitation({ token, password });
      setDone(
        `¡Listo, ${outcome.displayName}! Ya eres member de ${outcome.organizationName}. Inicia sesión con tu correo y esta contraseña.`,
      );
    } catch (cause) {
      if (cause instanceof ApiError) setError(cause.userMessage);
      else setError("No se pudo aceptar la invitación.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Acepta tu invitación</h1>
        {done !== null ? (
          <p role="status">{done}</p>
        ) : (
          <form onSubmit={submit}>
            <p className="org-page__muted">
              Define tu contraseña para activar el acceso a la organización.
            </p>
            <div className="field">
              <label className="field__label" htmlFor="accept-password">
                Contraseña (mínimo 8 caracteres)
              </label>
              <input
                id="accept-password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error !== null ? (
              <p className="org-page__form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? "Activando…" : "Aceptar invitación"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
