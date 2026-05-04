.PHONY: help lint lint-backend lint-frontend test test-backend test-frontend format format-backend format-frontend

help:
	@echo "Targets:"
	@echo "  lint           Backend (ruff/mypy) + Frontend (eslint/prettier/tsc)"
	@echo "  test           Backend (pytest) + Frontend (vitest)"
	@echo "  format         Auto-fix Backend + Frontend"
	@echo "  lint-backend / lint-frontend / test-backend / test-frontend"

lint: lint-backend lint-frontend

lint-backend:
	cd backend && uv run ruff check .
	cd backend && uv run ruff format --check .
	cd backend && uv run mypy

lint-frontend:
	cd frontend && pnpm lint
	cd frontend && pnpm format:check
	cd frontend && pnpm type-check

test: test-backend test-frontend

test-backend:
	cd backend && uv run pytest -q

test-frontend:
	cd frontend && pnpm exec vitest run

format: format-backend format-frontend

format-backend:
	cd backend && uv run ruff check . --fix
	cd backend && uv run ruff format .

format-frontend:
	cd frontend && pnpm format
