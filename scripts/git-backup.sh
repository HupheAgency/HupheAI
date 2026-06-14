#!/bin/bash
cd /Users/tom.zwarts/HupheAI

git add -A

if git diff --cached --quiet; then
  echo "$(date): geen wijzigingen, niets te pushen." >> /tmp/hupheai-backup.log
  exit 0
fi

git commit -m "auto: daily backup $(date +%Y-%m-%d)"
git push origin main >> /tmp/hupheai-backup.log 2>&1

echo "$(date): backup voltooid." >> /tmp/hupheai-backup.log
