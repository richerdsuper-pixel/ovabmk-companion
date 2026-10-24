#!/bin/sh
# Пересоздать локальную базу t1 и применить миграции
P="psql -h /tmp/pgsock -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
cd "$(dirname "$0")/.."
$P -c "drop database if exists t1" -c "create database t1" >/dev/null 2>&1
$P -d t1 -f tests/stub_supabase.sql 2>&1 | grep -v NOTICE
for f in supabase/migrations/*.sql; do $P -d t1 -f "$f" 2>&1 | grep -v "NOTICE" || true; done
