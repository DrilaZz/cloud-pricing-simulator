"""Export endpoints: PDF and CSV for a cloud cost estimate."""

import csv
import io
from datetime import datetime, date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import AppService, Application, InstanceType, Pricing, Project, Region
from app.api.routes.projects import _service_monthly_cost, HOURS_PER_MONTH
from app.api.routes.pricing import (
    _find_best_pricing, _compute_monthly, _effective_monthly, ALL_PROVIDERS,
)
from app.schemas.pricing import CompareServiceInput
from app.utils.region_mapping import get_equivalent_regions

router = APIRouter(prefix="/api")

# ── Helpers ───────────────────────────────────────────────────────────────────


def _load_app(app_id: str, db: Session) -> Application:
    app_ = (
        db.scalars(
            select(Application)
            .where(Application.id == app_id)
            .options(
                joinedload(Application.region),
                joinedload(Application.project),
                joinedload(Application.services)
                .joinedload(AppService.instance_type)
                .joinedload(InstanceType.service_category),
            )
        )
        .unique()
        .first()
    )
    if not app_:
        raise HTTPException(404, "Application not found")
    return app_


def _svc_costs(svc: AppService, region_id: int, db: Session) -> tuple[float, float]:
    """Return (ondemand_monthly, effective_monthly) for a service."""
    pricing = db.scalars(
        select(Pricing).where(
            Pricing.instance_type_id == svc.instance_type_id,
            Pricing.region_id == region_id,
        )
    ).first()
    if not pricing:
        return 0.0, 0.0
    od = _service_monthly_cost(svc, pricing)
    # Effective (RI) cost
    if svc.reserved:
        svc_tmp = svc  # same object — _service_monthly_cost respects reserved flag
    effective = _service_monthly_cost(svc, pricing)
    return od, effective


def _config_details(svc: AppService) -> str:
    parts = []
    util = float(svc.utilization_rate)
    if util < 1.0:
        parts.append(f"{round(util * 100)}% util")
    if svc.reserved:
        parts.append(f"RI {svc.reserved_term or '1y'}")
    if svc.volume_gb:
        parts.append(f"{svc.volume_gb:.0f} GB")
    if svc.monthly_requests:
        parts.append(f"{svc.monthly_requests:,} req/mo")
    if svc.avg_duration_ms:
        parts.append(f"{svc.avg_duration_ms:.0f} ms")
    if svc.memory_mb:
        parts.append(f"{svc.memory_mb} MB")
    if svc.node_count and svc.node_count > 1:
        parts.append(f"{svc.node_count} nodes")
    if svc.deployment_option:
        parts.append(svc.deployment_option)
    return ", ".join(parts) if parts else "—"


def _build_compare_inputs(app_: Application, db: Session) -> list[CompareServiceInput]:
    inputs = []
    for svc in app_.services:
        if not svc.instance_type or not svc.instance_type.equivalent_group:
            continue
        pricing = db.scalars(
            select(Pricing).where(
                Pricing.instance_type_id == svc.instance_type_id,
                Pricing.region_id == app_.region_id,
            )
        ).first()
        inputs.append(
            CompareServiceInput(
                service_id=svc.id,
                instance_type_id=svc.instance_type_id,
                region_id=app_.region_id,
                utilization_rate=float(svc.utilization_rate),
                reserved=svc.reserved,
                reserved_term=svc.reserved_term,
                pricing_unit=svc.instance_type.pricing_unit,
                volume_gb=svc.volume_gb,
                monthly_requests=svc.monthly_requests,
                avg_duration_ms=svc.avg_duration_ms,
                memory_mb=svc.memory_mb,
                node_count=svc.node_count,
            )
        )
    return inputs


def _compare_totals(
    inputs: list[CompareServiceInput], region_code: str, db: Session
) -> dict[str, float]:
    """Return {provider: total_effective_monthly} for cross-provider comparison."""
    from sqlalchemy import select as sel
    from app.models import Provider as Prov

    equiv_regions = get_equivalent_regions(region_code)
    totals: dict[str, float] = {p: 0.0 for p in ALL_PROVIDERS}

    for svc in inputs:
        it = db.get(InstanceType, svc.instance_type_id)
        if not it or not it.equivalent_group:
            continue
        for pname in ALL_PROVIDERS:
            target_region = equiv_regions.get(pname, region_code)
            pricing = _find_best_pricing(it.equivalent_group, pname, target_region, db)
            if not pricing:
                continue
            eff = _effective_monthly(
                float(pricing.price_per_hour_ondemand),
                float(pricing.price_per_hour_reserved_1y) if pricing.price_per_hour_reserved_1y else None,
                float(pricing.price_per_hour_reserved_3y) if pricing.price_per_hour_reserved_3y else None,
                svc,
            )
            totals[pname] += eff
    return totals


# ── PDF ───────────────────────────────────────────────────────────────────────

PROVIDER_DISPLAY = {"aws": "Amazon Web Services (AWS)", "azure": "Microsoft Azure", "gcp": "Google Cloud Platform (GCP)"}

def _build_pdf(app_: Application, db: Session) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        BaseDocTemplate, Frame, PageTemplate, Paragraph,
        Spacer, Table, TableStyle, NextPageTemplate, PageBreak,
    )
    from reportlab.lib.enums import TA_CENTER, TA_RIGHT

    PAGE_W, PAGE_H = A4
    MARGIN = 2 * cm
    CONTENT_W = PAGE_W - 2 * MARGIN

    # ── Colour palette ────────────────────────────────────────────────────────
    INDIGO = colors.HexColor("#4F46E5")
    INDIGO_LIGHT = colors.HexColor("#EEF2FF")
    SLATE_50 = colors.HexColor("#F8FAFC")
    SLATE_200 = colors.HexColor("#E2E8F0")
    SLATE_700 = colors.HexColor("#334155")
    AWS_C = colors.HexColor("#FF9900")
    AZURE_C = colors.HexColor("#0078D4")
    GCP_C = colors.HexColor("#4285F4")
    PROV_COLORS = {"aws": AWS_C, "azure": AZURE_C, "gcp": GCP_C}
    RED_600 = colors.HexColor("#DC2626")
    GREEN_600 = colors.HexColor("#16A34A")

    styles = getSampleStyleSheet()
    normal = styles["Normal"]
    normal.fontName = "Helvetica"
    normal.fontSize = 9
    normal.textColor = SLATE_700

    def style(name, **kw):
        s = ParagraphStyle(name, parent=normal, **kw)
        return s

    title_style = style("Title", fontSize=20, fontName="Helvetica-Bold", textColor=INDIGO, spaceAfter=4)
    sub_style = style("Sub", fontSize=11, textColor=SLATE_700, spaceAfter=2)
    section_style = style("Section", fontSize=12, fontName="Helvetica-Bold", textColor=INDIGO, spaceBefore=12, spaceAfter=6)
    cell_style = style("Cell", fontSize=8, fontName="Helvetica", leading=11)
    cell_bold = style("CellBold", fontSize=8, fontName="Helvetica-Bold", leading=11)
    cell_right = style("CellRight", fontSize=8, fontName="Helvetica", alignment=TA_RIGHT, leading=11)
    cell_right_bold = style("CellRightBold", fontSize=8, fontName="Helvetica-Bold", alignment=TA_RIGHT, leading=11)

    def fmt_cur(v: float) -> str:
        return f"${v:,.2f}"

    def fmt_pct(v: float) -> str:
        return f"{v:.1f}%"

    # ── Gather data ───────────────────────────────────────────────────────────
    region_code = app_.region.code if app_.region else ""
    project_name = app_.project.name if app_.project else ""

    rows_detail = []
    total_od = 0.0
    total_eff = 0.0

    for svc in app_.services:
        pricing = db.scalars(
            select(Pricing).where(
                Pricing.instance_type_id == svc.instance_type_id,
                Pricing.region_id == app_.region_id,
            )
        ).first()
        od = _service_monthly_cost(svc, pricing)
        eff = od  # same object handles reserved flag
        total_od += od
        total_eff += eff
        saving = od - eff
        cat = svc.instance_type.service_category.name if svc.instance_type and svc.instance_type.service_category else "—"
        rows_detail.append({
            "cat": cat.capitalize(),
            "instance": svc.instance_type.name if svc.instance_type else "—",
            "config": _config_details(svc),
            "od": od,
            "eff": eff,
            "saving": saving,
        })

    total_saving = total_od - total_eff
    ri_services = sum(1 for svc in app_.services if svc.reserved)
    ri_rate = (ri_services / len(app_.services) * 100) if app_.services else 0.0

    compare_inputs = _build_compare_inputs(app_, db)
    compare_totals = _compare_totals(compare_inputs, region_code, db) if compare_inputs else {}
    has_comparison = any(v > 0 for v in compare_totals.values())

    # ── Footer ────────────────────────────────────────────────────────────────
    def draw_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#94A3B8"))
        canvas.drawCentredString(PAGE_W / 2, MARGIN * 0.5, "Generated by Cloud Pricing Simulator")
        canvas.drawRightString(PAGE_W - MARGIN, MARGIN * 0.5, f"Page {doc.page}")
        canvas.restoreState()

    # ── Build document ────────────────────────────────────────────────────────
    buf = io.BytesIO()
    frame = Frame(MARGIN, MARGIN, CONTENT_W, PAGE_H - 2 * MARGIN, id="normal")
    template = PageTemplate(id="main", frames=[frame], onPage=draw_footer)
    doc = BaseDocTemplate(buf, pagesize=A4, pageTemplates=[template])

    story = []

    # ── PAGE 1 — Summary ──────────────────────────────────────────────────────
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph("Cloud Cost Estimate", title_style))
    story.append(Paragraph(f"{project_name} · {app_.name}", sub_style))
    story.append(Paragraph(
        f"Generated on {date.today().strftime('%B %d, %Y')} · "
        f"{PROVIDER_DISPLAY.get(app_.provider, app_.provider)} · "
        f"{app_.region.display_name if app_.region else region_code}",
        style("Meta", fontSize=8, textColor=colors.HexColor("#64748B"), spaceAfter=16),
    ))

    story.append(Paragraph("Cost Summary", section_style))

    summary_data = [
        [Paragraph("<b>Metric</b>", cell_bold), Paragraph("<b>Value</b>", cell_bold)],
        [Paragraph("Monthly cost (on-demand)", cell_style), Paragraph(fmt_cur(total_od), cell_right)],
        [Paragraph("Monthly cost (with RI)", cell_style), Paragraph(fmt_cur(total_eff), cell_right)],
        [Paragraph("Monthly savings (RI)", cell_style), Paragraph(fmt_cur(total_saving), cell_right if total_saving == 0 else style("Sv", fontSize=8, fontName="Helvetica", alignment=TA_RIGHT, textColor=GREEN_600))],
        [Paragraph("Annual savings (RI)", cell_style), Paragraph(fmt_cur(total_saving * 12), cell_right if total_saving == 0 else style("SvA", fontSize=8, fontName="Helvetica", alignment=TA_RIGHT, textColor=GREEN_600))],
        [Paragraph("RI coverage", cell_style), Paragraph(fmt_pct(ri_rate), cell_right)],
    ]

    col_w = [CONTENT_W * 0.65, CONTENT_W * 0.35]
    tbl = Table(summary_data, colWidths=col_w)
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INDIGO_LIGHT),
        ("TEXTCOLOR", (0, 0), (-1, 0), INDIGO),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SLATE_50]),
        ("GRID", (0, 0), (-1, -1), 0.5, SLATE_200),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(tbl)

    # ── PAGE 2 — Service detail ───────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("Service Details", section_style))

    col_widths = [
        CONTENT_W * 0.12,  # category
        CONTENT_W * 0.22,  # instance
        CONTENT_W * 0.26,  # config
        CONTENT_W * 0.14,  # on-demand
        CONTENT_W * 0.13,  # ri cost
        CONTENT_W * 0.13,  # saving
    ]
    header = [
        Paragraph("<b>Category</b>", cell_bold),
        Paragraph("<b>Instance</b>", cell_bold),
        Paragraph("<b>Configuration</b>", cell_bold),
        Paragraph("<b>On-demand/mo</b>", cell_bold),
        Paragraph("<b>RI/mo</b>", cell_bold),
        Paragraph("<b>Saving</b>", cell_bold),
    ]
    detail_rows = [header]
    for r in rows_detail:
        sv_style = style(f"sv_{id(r)}", fontSize=8, alignment=TA_RIGHT,
                         textColor=GREEN_600 if r["saving"] > 0 else SLATE_700)
        detail_rows.append([
            Paragraph(r["cat"], cell_style),
            Paragraph(r["instance"], cell_style),
            Paragraph(r["config"], cell_style),
            Paragraph(fmt_cur(r["od"]), cell_right),
            Paragraph(fmt_cur(r["eff"]), cell_right),
            Paragraph(fmt_cur(r["saving"]), sv_style),
        ])
    # Total row
    total_sv_style = style("tsv", fontSize=8, fontName="Helvetica-Bold", alignment=TA_RIGHT,
                           textColor=GREEN_600 if total_saving > 0 else SLATE_700)
    detail_rows.append([
        Paragraph("", cell_bold),
        Paragraph("", cell_bold),
        Paragraph("<b>TOTAL</b>", cell_bold),
        Paragraph(fmt_cur(total_od), cell_right_bold),
        Paragraph(fmt_cur(total_eff), cell_right_bold),
        Paragraph(fmt_cur(total_saving), total_sv_style),
    ])

    det_tbl = Table(detail_rows, colWidths=col_widths, repeatRows=1)
    det_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INDIGO_LIGHT),
        ("TEXTCOLOR", (0, 0), (-1, 0), INDIGO),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, SLATE_50]),
        ("BACKGROUND", (0, -1), (-1, -1), INDIGO_LIGHT),
        ("GRID", (0, 0), (-1, -1), 0.5, SLATE_200),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEABOVE", (0, -1), (-1, -1), 1.0, INDIGO),
    ]))
    story.append(det_tbl)

    # ── PAGE 3 — Multi-cloud comparison ──────────────────────────────────────
    if has_comparison:
        story.append(PageBreak())
        story.append(Paragraph("Multi-Cloud Comparison", section_style))
        story.append(Paragraph(
            "Estimated monthly cost for equivalent architecture on each provider "
            "(mapped via equivalent instance groups).",
            style("CompNote", fontSize=8, textColor=colors.HexColor("#64748B"), spaceAfter=10),
        ))

        comp_col_w = [CONTENT_W * 0.25, CONTENT_W * 0.35, CONTENT_W * 0.25, CONTENT_W * 0.15]
        comp_header = [
            Paragraph("<b>Provider</b>", cell_bold),
            Paragraph("<b>Full Name</b>", cell_bold),
            Paragraph("<b>Total Monthly (eff.)</b>", cell_bold),
            Paragraph("<b>vs Current</b>", cell_bold),
        ]
        comp_rows = [comp_header]
        for pname in ALL_PROVIDERS:
            pval = compare_totals.get(pname, 0.0)
            if pval == 0.0:
                continue
            diff = pval - total_eff
            diff_str = ("+" if diff > 0 else "") + fmt_cur(diff)
            diff_col = RED_600 if diff > 0 else GREEN_600
            pc = PROV_COLORS.get(pname, SLATE_700)
            comp_rows.append([
                Paragraph(f"<b>{pname.upper()}</b>", style(f"p_{pname}", fontSize=9, fontName="Helvetica-Bold", textColor=pc)),
                Paragraph(PROVIDER_DISPLAY.get(pname, pname), cell_style),
                Paragraph(fmt_cur(pval), cell_right_bold if pname == app_.provider else cell_right),
                Paragraph(diff_str if pname != app_.provider else "—",
                          style(f"d_{pname}", fontSize=8, alignment=TA_RIGHT,
                                textColor=diff_col if pname != app_.provider else SLATE_700)),
            ])

        comp_tbl = Table(comp_rows, colWidths=comp_col_w)
        comp_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INDIGO_LIGHT),
            ("TEXTCOLOR", (0, 0), (-1, 0), INDIGO),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SLATE_50]),
            ("GRID", (0, 0), (-1, -1), 0.5, SLATE_200),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ]))
        # Highlight current provider row
        for i, pname in enumerate([p for p in ALL_PROVIDERS if compare_totals.get(p, 0) > 0], start=1):
            if pname == app_.provider:
                comp_tbl.setStyle(TableStyle([
                    ("BACKGROUND", (0, i), (-1, i), colors.HexColor("#F0F4FF")),
                    ("LINEABOVE", (0, i), (-1, i), 1.0, INDIGO),
                    ("LINEBELOW", (0, i), (-1, i), 1.0, INDIGO),
                ]))
        story.append(comp_tbl)

    doc.build(story)
    return buf.getvalue()


# ── CSV ───────────────────────────────────────────────────────────────────────

def _build_csv(app_: Application, db: Session) -> str:
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "project_name", "application_name", "provider", "region",
        "service_category", "instance_type", "configuration_details",
        "utilization_rate", "reserved", "reserved_term", "volume_gb",
        "monthly_requests", "cost_ondemand_monthly", "cost_reserved_monthly",
        "savings_monthly",
    ])

    project_name = app_.project.name if app_.project else ""
    total_od = 0.0
    total_eff = 0.0

    for svc in app_.services:
        pricing = db.scalars(
            select(Pricing).where(
                Pricing.instance_type_id == svc.instance_type_id,
                Pricing.region_id == app_.region_id,
            )
        ).first()
        od = _service_monthly_cost(svc, pricing)
        eff = od
        total_od += od
        total_eff += eff

        cat = svc.instance_type.service_category.name if svc.instance_type and svc.instance_type.service_category else ""
        writer.writerow([
            project_name,
            app_.name,
            app_.provider,
            app_.region.code if app_.region else "",
            cat,
            svc.instance_type.name if svc.instance_type else "",
            _config_details(svc),
            float(svc.utilization_rate),
            svc.reserved,
            svc.reserved_term or "",
            svc.volume_gb or "",
            svc.monthly_requests or "",
            round(od, 4),
            round(eff, 4),
            round(od - eff, 4),
        ])

    # Total row
    writer.writerow([
        "", "", "", "", "", "",
        "TOTAL", "", "", "", "", "",
        round(total_od, 4),
        round(total_eff, 4),
        round(total_od - total_eff, 4),
    ])

    return output.getvalue()


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/applications/{app_id}/export-pdf")
def export_pdf(app_id: str, db: Session = Depends(get_db)):
    app_ = _load_app(app_id, db)
    pdf_bytes = _build_pdf(app_, db)
    safe_name = f"{(app_.project.name or 'project').replace(' ', '_')}_{app_.name.replace(' ', '_')}_estimate.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.get("/applications/{app_id}/export-csv")
def export_csv(app_id: str, db: Session = Depends(get_db)):
    app_ = _load_app(app_id, db)
    csv_str = _build_csv(app_, db)
    safe_name = f"{(app_.project.name or 'project').replace(' ', '_')}_{app_.name.replace(' ', '_')}_estimate.csv"
    return StreamingResponse(
        io.StringIO(csv_str),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )
