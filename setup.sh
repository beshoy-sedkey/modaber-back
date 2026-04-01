#!/bin/bash
# ═══════════════════════════════════════════════
# SETUP SCRIPT — Run this ONCE after extracting
# ═══════════════════════════════════════════════

echo ""
echo "=========================================="
echo " E-Commerce AI — Project Setup"
echo "=========================================="
echo ""

# 1. Create .claude/ from dot-claude/
if [ -d "dot-claude" ]; then
  rm -rf .claude
  cp -r dot-claude .claude
  echo "✅ .claude/ folder created (29 agents, 4 commands, 3 rules, 2 skills)"
else
  echo "❌ ERROR: dot-claude/ folder not found. Make sure you extracted the zip first."
  exit 1
fi

# 2. Rename dot-files
[ -f "env.txt" ] && mv env.txt .env && echo "✅ .env created"
[ -f "gitignore.txt" ] && mv gitignore.txt .gitignore && echo "✅ .gitignore created"
[ -f "dockerignore.txt" ] && mv dockerignore.txt .dockerignore && echo "✅ .dockerignore created"

echo ""
echo "=========================================="
echo " Verification"
echo "=========================================="
echo ""

# 3. Verify all critical files
FILES=(
  "Dockerfile"
  "docker-compose.yml"
  "docker/init.sql"
  "package.json"
  "tsconfig.json"
  "tsconfig.build.json"
  "nest-cli.json"
  "prisma/schema.prisma"
  "src/main.ts"
  "src/app.module.ts"
  "CLAUDE.md"
  "HOW-TO-USE.md"
  ".env"
  ".gitignore"
  ".dockerignore"
)

ALL_OK=true
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    echo "  ✅ $f"
  else
    echo "  ❌ MISSING: $f"
    ALL_OK=false
  fi
done

echo ""
echo "  📂 .claude/agents/     : $(ls .claude/agents/ 2>/dev/null | wc -l) agent files"
echo "  📂 .claude/commands/   : $(ls .claude/commands/ 2>/dev/null | wc -l) command files"
echo "  📂 .claude/rules/      : $(ls .claude/rules/ 2>/dev/null | wc -l) rule files"
echo "  📂 .claude/skills/     : $(find .claude/skills/ -name 'SKILL.md' 2>/dev/null | wc -l) skill files"

echo ""

if [ "$ALL_OK" = true ]; then
  echo "=========================================="
  echo " ✅ ALL FILES PRESENT — Ready to go!"
  echo "=========================================="
  echo ""
  echo " Next steps:"
  echo ""
  echo "   1. Edit .env — add your OPENAI_API_KEY"
  echo "      nano .env"
  echo ""
  echo "   2. Start Docker (PostgreSQL + Redis + App)"
  echo "      docker compose up -d --build"
  echo ""
  echo "   3. Wait 2-3 minutes, then verify"
  echo "      docker compose ps"
  echo ""
  echo "   4. Run your first agent"
  echo "      claude --agent project-scaffold"
  echo ""
else
  echo "=========================================="
  echo " ❌ SOME FILES MISSING — check errors above"
  echo "=========================================="
fi
