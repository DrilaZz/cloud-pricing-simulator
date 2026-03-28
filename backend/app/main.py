from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.pricing import router as pricing_router
from app.api.routes.projects import router as projects_router
from app.api.routes.templates import router as templates_router
from app.api.routes.export import router as export_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.data_status import router as data_status_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.scripts.seed_templates import seed_default_templates
    seed_default_templates()
    yield


app = FastAPI(
    title="Cloud Pricing Simulator API",
    version="1.0.0",
    description="Multi-provider cloud pricing comparison API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pricing_router)
app.include_router(projects_router)
app.include_router(templates_router)
app.include_router(export_router)
app.include_router(dashboard_router)
app.include_router(data_status_router)


@app.get("/health")
def health():
    return {"status": "ok"}
