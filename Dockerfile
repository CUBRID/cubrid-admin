# Wraps the self-contained pkg executable (see README.md's "방법 B" packaging
# docs) in a minimal image — Node.js isn't needed at runtime since pkg embeds
# it. Built primarily for the e2e test pipeline (cubrid-webmanager-e2e repo),
# which runs this alongside a CUBRID container via testcontainers.
#
# Build (from repo root, after `npm run package:server:linux`):
#   docker build -t cubrid-webmanager:local .
#
# Platform pinned to amd64: the pkg executable is built for node18-linux-x64
# (see package.json's package:server:linux script). On an arm64 Docker host
# (Apple Silicon + colima, or arm64 CI runners), letting the base image
# resolve to native arm64 while the binary inside is x86_64 fails at
# startup ("Could not open '/lib64/ld-linux-x86-64.so.2'") since the arm64
# base doesn't ship the x86_64 dynamic linker QEMU needs. Pinning the
# platform pulls the amd64 base image too, so the whole userland matches.
FROM --platform=linux/amd64 debian:bookworm-slim

RUN useradd -m -u 1000 cubrid
WORKDIR /app

COPY dist/executables/cubrid-admin-linux ./cubrid-admin-linux
COPY dist/executables/conf ./conf
RUN chmod +x ./cubrid-admin-linux && chown -R cubrid:cubrid /app

USER cubrid
EXPOSE 8080
ENTRYPOINT ["./cubrid-admin-linux"]
