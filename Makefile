# Neuro — developer tasks
.DEFAULT_GOAL := help
.PHONY: help db-up db-down backend-install backend-dev backend-test frontend-install frontend-dev frontend-build gen-types

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

db-up: ## Start Postgres + PostGIS
	docker compose -f infra/docker-compose.yml up -d db

db-down: ## Stop infrastructure
	docker compose -f infra/docker-compose.yml down

backend-install: ## Install backend deps into a venv
	cd backend && python -m venv .venv && .venv/Scripts/pip install -U pip -r requirements.txt

backend-dev: ## Run FastAPI with reload
	cd backend && .venv/Scripts/uvicorn app.main:app --reload --port 8000

backend-test: ## Run backend tests
	cd backend && .venv/Scripts/pytest -q

frontend-install: ## Install frontend deps
	cd frontend && npm install

frontend-dev: ## Run Next.js dev server
	cd frontend && npm run dev

frontend-build: ## Production build
	cd frontend && npm run build

gen-types: ## Regenerate frontend API types from backend OpenAPI
	cd frontend && npm run gen:types
