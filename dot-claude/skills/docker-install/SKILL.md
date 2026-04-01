# Docker Install Skill

This skill auto-triggers when you need to install npm packages or run any project commands.

## Rule
ALL commands run inside Docker. Never on the host machine.

## Install a Package
```bash
docker compose exec app npm install <package-name>
docker compose exec app npm install -D <package-name>
```

## Run Commands
```bash
docker compose exec app npx tsc --noEmit           # typecheck
docker compose exec app npx jest                    # tests
docker compose exec app npx jest --passWithNoTests  # if no tests yet
docker compose exec app npx prisma generate         # after schema change
docker compose exec app npx prisma migrate dev --name <n>  # migration
docker compose exec app npx prisma studio           # visual DB browser
```

## After Installing a Package
The package is immediately available inside the container. No rebuild needed.
Only rebuild if you change the Dockerfile itself:
```bash
# Human runs this, NOT the agent:
docker compose down && docker compose up -d --build
```
