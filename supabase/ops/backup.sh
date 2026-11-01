#!/bin/sh
# Ночная резервная копия базы OvaBMҚ (сервер вилоята). Запуск по cron: 30 2 * * * /opt/ovabmk/backup.sh
# Нужны: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE в /etc/ovabmk/backup.env; парольная фраза шифрования — /etc/ovabmk/backup.pass (chmod 600);
# OFFSITE — куда копировать (например user@backup-host:/srv/ovabmk), можно не задавать.
set -eu
. /etc/ovabmk/backup.env
DIR=/var/backups/ovabmk
KEEP_DAYS=14
mkdir -p "$DIR"
F="$DIR/ovabmk_$(date +%Y-%m-%d_%H%M).dump.gpg"
pg_dump -Fc --no-owner | gpg --batch --yes --pinentry-mode loopback --passphrase-file /etc/ovabmk/backup.pass -c -o "$F"
test -s "$F"
find "$DIR" -name 'ovabmk_*.dump.gpg' -mtime +"$KEEP_DAYS" -delete
if [ -n "${OFFSITE:-}" ]; then rsync -a "$F" "$OFFSITE/"; fi
echo "ok $F"
# Восстановление: gpg -d --passphrase-file /etc/ovabmk/backup.pass ФАЙЛ | pg_restore --clean --if-exists -d ovabmk
