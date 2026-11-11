# electron-builder 26.18.1's templates/linux/apparmor-profile.tpl with the install folder
# fixed to /opt/cubrid-admin-desktop (see apps/desktop/electron-builder.config.cjs beforePack).
abi <abi/4.0>,
include <tunables/global>

profile "${executable}" "/opt/cubrid-admin-desktop/${executable}" flags=(unconfined) {
  userns,

  # Site-specific additions and overrides. See local/README for details.
  include if exists <local/${executable}>
}