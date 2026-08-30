# ═══════════════════════════════════════════════════════════════════════════
#  URBAN TWIN — one Makefile for six developers
#  `make help` lists everything.
# ═══════════════════════════════════════════════════════════════════════════
SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help setup dev demo prod down logs migrate revision seed smoke test test-py test-js fmt lint typecheck mine up up-full reset buildings types clean

# prefer 3.11/3.12 — some geo/ML wheels lag on the newest interpreter
PYTHON_BIN := $(shell command -v python3.11 || command -v python3.12 || command -v python3)
VENV    := .venv
PY      := $(VENV)/bin/python
PIP     := $(VENV)/bin/pip
PYTEST  := $(VENV)/bin/pytest
RUFF    := $(VENV)/bin/ruff
MYPY    := $(VENV)/bin/mypy
ALEMBIC := $(VENV)/bin/alembic
COMPOSE := docker compose

# `make mine` figures out who you are from your git branch (m1-defects → m1),
# or from MEMBER=m3 on the command line.
BRANCH  := $(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
MEMBER  ?= $(shell echo "$(BRANCH)" | grep -oE '^m[1-6]' || echo all)

help: ## show this help
	grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

# ── setup ──────────────────────────────────────────────────────────────────
setup: ## create venv, install python + node deps, generate .env if missing
	test -f .env || cp .env.example .env
	test -d $(VENV) || $(PYTHON_BIN) -m venv $(VENV)
	$(PIP) install --upgrade pip -q
	$(PIP) install -e ".[dev]" -q
	echo "→ python core installed. Perception owners (M1/M3/M4): $(PIP) install -e '.[ml]'"
	echo "→ traffic owner (M2):                                   $(PIP) install -e '.[geo]'"
	cd apps/web && npm install --silent
	echo ""
	echo "  ✔ setup complete →  make dev"

# ── run ────────────────────────────────────────────────────────────────────
up: ## start postgres + redis + mosquitto and wait until healthy
	$(COMPOSE) up -d postgres redis mosquitto
	bash scripts/wait_healthy.sh

up-full: ## start EVERYTHING in docker, api included
	$(COMPOSE) --profile full up -d --build
	bash scripts/wait_healthy.sh

dev: up migrate seed ## THE COMMAND: full system, mock data, hot reload
	bash scripts/dev.sh

demo: ## DEMO DAY: built frontend served by the api, one port, zero network
	bash scripts/demo.sh

prod: ## whole stack in docker, production shape, one container serves api + ui
	docker compose -f docker-compose.prod.yml up --build

down: ## stop containers (data survives)
	$(COMPOSE) --profile full down

reset: ## stop containers AND wipe the database volume
	$(COMPOSE) --profile full down -v
	echo "  volumes wiped — next 'make dev' reseeds from scratch"

logs: ## tail container logs
	$(COMPOSE) logs -f --tail=120

# ── database (M5 owns these) ───────────────────────────────────────────────
migrate: ## apply all alembic migrations
	$(ALEMBIC) -c packages/db/alembic.ini upgrade head

revision: ## autogenerate a migration:  make revision m="add work orders"
	$(ALEMBIC) -c packages/db/alembic.ini revision --autogenerate -m "$(m)"

seed: ## load 6 Chennai routes, 6 buses, 3 school zones, ~40 events
	$(PY) scripts/seed.py

buildings: ## re-fetch OSM building footprints for the 3D twin (needs network)
	$(PY) scripts/fetch_buildings.py --tagged-only

types: ## regenerate the frontend's contract types from packages/contracts
	$(PY) scripts/gen_frontend_types.py

# ── quality ────────────────────────────────────────────────────────────────
smoke: ## green/red checklist of every moving part
	$(PY) scripts/smoke_test.py

test: test-py test-js ## run everything

test-py: ## all python tests
	$(PYTEST)

test-js: ## frontend unit tests
	cd apps/web && npm run test -- --run

mine: ## run ONLY your module's tests (uses your git branch, or MEMBER=m3)
	bash scripts/mine.sh $(MEMBER)

fmt: ## format + autofix
	$(RUFF) format .
	$(RUFF) check --fix .

lint: ## lint without fixing
	$(RUFF) check .

typecheck: ## mypy strict on the frozen shared layer
	$(MYPY) packages/contracts/src packages/db/src packages/citydata/src

clean: ## remove caches
	find . -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
	rm -rf .pytest_cache .mypy_cache .ruff_cache
