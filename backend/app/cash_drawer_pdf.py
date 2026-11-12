"""PDF generation for Cash Drawer (Daily shift closing and Monthly ledger)."""
from io import BytesIO
from pathlib import Path
from datetime import datetime
from decimal import Decimal
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether


def money(value):
    if value is None:
        return "$ 0,00"
    v = Decimal(str(value))
    return "$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def format_dt(dt_str):
    if not dt_str:
        return "-"
    try:
        dt = datetime.fromisoformat(dt_str)
        return dt.strftime("%d/%m/%Y %H:%M")
    except Exception:
        return str(dt_str)


def format_time_short(dt_str):
    if not dt_str:
        return "-"
    try:
        dt = datetime.fromisoformat(dt_str)
        return dt.strftime("%d/%m %H:%M")
    except Exception:
        return str(dt_str)


def format_date_only(dt_str):
    if not dt_str:
        return "-"
    try:
        dt = datetime.fromisoformat(dt_str)
        return dt.strftime("%d/%m/%Y")
    except Exception:
        return str(dt_str)


def get_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="SheetTitle",
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#3d2314"),
        alignment=1  # Center
    ))
    styles.add(ParagraphStyle(
        name="SheetSubtitle",
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#5c4033"),
        alignment=1  # Center
    ))
    styles.add(ParagraphStyle(
        name="MetaLabel",
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#4a3b32")
    ))
    styles.add(ParagraphStyle(
        name="MetaValue",
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#222222")
    ))
    styles.add(ParagraphStyle(
        name="Th",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#1f140e"),
        alignment=1  # Center
    ))
    styles.add(ParagraphStyle(
        name="Td",
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#2b221b")
    ))
    styles.add(ParagraphStyle(
        name="TdCenter",
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#2b221b"),
        alignment=1
    ))
    styles.add(ParagraphStyle(
        name="TdRight",
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#2b221b"),
        alignment=2  # Right
    ))
    styles.add(ParagraphStyle(
        name="TdBoldRight",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#1f140e"),
        alignment=2
    ))
    styles.add(ParagraphStyle(
        name="TdBold",
        fontName="Helvetica-Bold",
        fontSize=7.5,
        leading=9.5,
        textColor=colors.HexColor("#1f140e")
    ))
    styles.add(ParagraphStyle(
        name="SmallNote",
        fontName="Helvetica-Oblique",
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor("#6c5b51")
    ))
    return styles


def p_cell(text, style_name, styles):
    clean = escape(str(text or "")).replace("\n", "<br/>")
    return Paragraph(clean, styles[style_name])


def build_shift_pdf(summary_data):
    """Builds a single daily shift closing document in A4."""
    out = BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=32,
        rightMargin=32,
        topMargin=32,
        bottomMargin=32,
        title="NaniFer - Cierre de Caja",
        author="NaniFer POS"
    )

    styles = get_styles()
    story = []

    shift = summary_data.get("shift", {})
    totals = summary_data.get("totals", {})
    entries = summary_data.get("entries", [])
    incomes = totals.get("incomes", {})
    expenses = totals.get("expenses", {})

    # Top Brand / Header
    logo_path = Path(__file__).resolve().parents[2] / "frontend/public/brand/logo.jpg"
    logo_img = None
    if logo_path.exists():
        try:
            logo_img = Image(str(logo_path), width=50, height=50)
            logo_img.hAlign = "LEFT"
        except Exception:
            logo_img = None

    title_p = Paragraph("CAFETERÍA NANIFER · PLANILLA CAJA DIARIA", styles["SheetTitle"])
    shift_id_short = (shift.get("id") or "")[:8].upper()
    opened_date = format_date_only(shift.get("openedAt"))
    sub_p = Paragraph(f"CIERRE DE TURNO #{shift_id_short} — FECHA: {opened_date}", styles["SheetSubtitle"])

    if logo_img:
        hdr_table = Table([[logo_img, [title_p, sub_p]]], colWidths=[60, 470])
        hdr_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(hdr_table)
    else:
        story.extend([title_p, sub_p])

    story.append(Spacer(1, 10))

    # Info summary metadata box
    resp_close = shift.get("closedByName") or "Pendiente de cierre"
    resp_open = shift.get("openedByName") or "Personal"
    status_str = "CERRADA" if shift.get("status") == "closed" else "ABIERTA (EN CURSO)"

    meta_left = [
        [p_cell("Estado:", "MetaLabel", styles), p_cell(status_str, "MetaValue", styles)],
        [p_cell("Apertura:", "MetaLabel", styles), p_cell(f"{format_dt(shift.get('openedAt'))} ({resp_open})", "MetaValue", styles)],
        [p_cell("Cierre:", "MetaLabel", styles), p_cell(f"{format_dt(shift.get('closedAt'))} ({resp_close})", "MetaValue", styles)],
        [p_cell("Firma / Responsable:", "MetaLabel", styles), p_cell(resp_close, "MetaValue", styles)],
    ]
    meta_right = [
        [p_cell("Saldo Inicial de Caja:", "MetaLabel", styles), p_cell(money(totals.get("initialCash", 0)), "TdBoldRight", styles)],
        [p_cell("Total Ingresos (Todos los medios):", "MetaLabel", styles), p_cell(money(incomes.get("total", 0)), "TdBoldRight", styles)],
        [p_cell("Efectivo Esperado en Gaveta:", "MetaLabel", styles), p_cell(money(totals.get("expectedCash", 0)), "TdBoldRight", styles)],
        [p_cell("Efectivo Contado Físicamente:", "MetaLabel", styles), p_cell(money(shift.get("countedCash")) if shift.get("countedCash") is not None else "Pendiente", "TdBoldRight", styles)],
    ]

    meta_tbl = Table([
        [Table(meta_left, colWidths=[90, 170]), Table(meta_right, colWidths=[150, 110])]
    ], colWidths=[265, 265])
    meta_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#7a5b48")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#faf6f2")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 10))

    # Breakdowns: Incomes by method and Expenses
    diff_val = shift.get("difference")
    diff_text = "Sin diferencia ($0,00)" if diff_val == 0 else (money(diff_val) if diff_val is not None else "-")

    summary_grid = [
        [
            p_cell("DESGLOSE INGRESOS", "Th", styles),
            p_cell("IMPORTE", "Th", styles),
            p_cell("DESGLOSE EGRESOS", "Th", styles),
            p_cell("IMPORTE", "Th", styles),
            p_cell("ARQUEO DE CAJA FÍSICA", "Th", styles),
            p_cell("TOTAL", "Th", styles),
        ],
        [
            p_cell("Ventas en Efectivo", "Td", styles),
            p_cell(money(incomes.get("efectivo", 0)), "TdRight", styles),
            p_cell("Gastos / Retiros Efectivo", "Td", styles),
            p_cell(money(expenses.get("efectivo", 0)), "TdRight", styles),
            p_cell("Saldo Inicial", "Td", styles),
            p_cell(money(totals.get("initialCash", 0)), "TdRight", styles),
        ],
        [
            p_cell("Transferencias", "Td", styles),
            p_cell(money(incomes.get("transferencia", 0)), "TdRight", styles),
            p_cell("Gastos Transferencia", "Td", styles),
            p_cell(money(expenses.get("transferencia", 0)), "TdRight", styles),
            p_cell("(+) Ingresos Efectivo", "Td", styles),
            p_cell(money(incomes.get("efectivo", 0)), "TdRight", styles),
        ],
        [
            p_cell("Débito / Tarjetas", "Td", styles),
            p_cell(money(incomes.get("debito", 0)), "TdRight", styles),
            p_cell("Gastos Débito", "Td", styles),
            p_cell(money(expenses.get("debito", 0)), "TdRight", styles),
            p_cell("(-) Egresos Efectivo", "Td", styles),
            p_cell(money(expenses.get("efectivo", 0)), "TdRight", styles),
        ],
        [
            p_cell("QR / Mercado Pago", "Td", styles),
            p_cell(money(incomes.get("qr", 0)), "TdRight", styles),
            p_cell("Total Egresos", "TdBold", styles),
            p_cell(money(expenses.get("total", 0)), "TdBoldRight", styles),
            p_cell("(=) Saldo Esperado", "TdBold", styles),
            p_cell(money(totals.get("expectedCash", 0)), "TdBoldRight", styles),
        ],
        [
            p_cell("TOTAL INGRESOS", "TdBold", styles),
            p_cell(money(incomes.get("total", 0)), "TdBoldRight", styles),
            p_cell("", "Td", styles),
            p_cell("", "Td", styles),
            p_cell("Diferencia de Caja", "TdBold", styles),
            p_cell(diff_text, "TdBoldRight", styles),
        ],
    ]

    breakdown_tbl = Table(summary_grid, colWidths=[105, 70, 110, 70, 105, 70])
    breakdown_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eae0d5")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbb8aa")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("BACKGROUND", (0, -1), (1, -1), colors.HexColor("#f5efe9")),
        ("BACKGROUND", (4, -2), (5, -1), colors.HexColor("#fef3c7")),
    ]))
    story.append(breakdown_tbl)
    story.append(Spacer(1, 12))

    # Main Ledger Table matching paper sheet exactly
    # Headers: FECHA | DETALLE | INGRESOS (EFECTIVO | TRANF. / DÉBITO) | SALDO | FIRMA
    col_w = [55, 175, 68, 80, 72, 80]  # total = 530 pt

    table_data = [
        [
            p_cell("FECHA", "Th", styles),
            p_cell("DETALLE", "Th", styles),
            p_cell("INGRESOS", "Th", styles),
            "",
            p_cell("SALDO", "Th", styles),
            p_cell("FIRMA", "Th", styles),
        ],
        [
            "",
            "",
            p_cell("EFECTIVO", "Th", styles),
            p_cell("TRANF. / DÉBITO", "Th", styles),
            "",
            "",
        ],
    ]

    for item in entries:
        t_str = format_time_short(item.get("createdAt"))
        det_str = item.get("detail", "")
        if item.get("isExpense"):
            ef_str = "-"
            tr_str = f"-{money(item.get('expenseAmount'))}" if item.get("expenseMethod") != "efectivo" else "-"
            if item.get("expenseMethod") == "efectivo":
                ef_str = f"-{money(item.get('expenseAmount'))}"
        else:
            ef_val = item.get("efectivo", 0)
            tr_val = (item.get("transferencia", 0) or 0) + (item.get("debito", 0) or 0) + (item.get("qr", 0) or 0)
            ef_str = money(ef_val) if ef_val > 0 else "-"
            tr_str = money(tr_val) if tr_val > 0 else "-"

        sal_str = money(item.get("runningBalance", 0))
        sig_str = item.get("signature", "")

        table_data.append([
            p_cell(t_str, "TdCenter", styles),
            p_cell(det_str, "Td", styles),
            p_cell(ef_str, "TdRight", styles),
            p_cell(tr_str, "TdRight", styles),
            p_cell(sal_str, "TdBoldRight", styles),
            p_cell(sig_str, "TdCenter", styles),
        ])

    ledger_tbl = Table(table_data, colWidths=col_w, repeatRows=2)
    ledger_tbl.setStyle(TableStyle([
        ("SPAN", (0, 0), (0, 1)),
        ("SPAN", (1, 0), (1, 1)),
        ("SPAN", (2, 0), (3, 0)),
        ("SPAN", (4, 0), (4, 1)),
        ("SPAN", (5, 0), (5, 1)),
        ("BACKGROUND", (0, 0), (-1, 1), colors.HexColor("#dfcfc2")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#7a5b48")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 2), (-1, -1), [colors.white, colors.HexColor("#fbf9f6")]),
    ]))
    story.append(ledger_tbl)
    story.append(Spacer(1, 14))

    # Notes & Signatures section
    sig_notes = shift.get("notes") or ""
    sig_box_data = [
        [
            p_cell(f"Observaciones del Cierre:<br/>{sig_notes if sig_notes else 'Sin observaciones adicionales.'}", "SmallNote", styles),
            p_cell(f"Firma de la Responsable:<br/><br/>___________________________________<br/><b>{resp_close}</b>", "TdCenter", styles)
        ]
    ]
    sig_tbl = Table(sig_box_data, colWidths=[310, 220])
    sig_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#947a6b")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(KeepTogether(sig_tbl))

    doc.build(story)
    return out.getvalue()


def build_monthly_pdf(monthly_data):
    """Builds a full month ledger document in A4 matching the paper spreadsheet."""
    out = BytesIO()
    doc = SimpleDocTemplate(
        out,
        pagesize=A4,
        leftMargin=30,
        rightMargin=30,
        topMargin=30,
        bottomMargin=30,
        title="NaniFer - Planilla Mensual de Caja",
        author="NaniFer POS"
    )

    styles = get_styles()
    story = []

    month_name = monthly_data.get("monthName", "").upper()
    year = monthly_data.get("year", "")
    entries = monthly_data.get("entries", [])
    totals = monthly_data.get("totals", {})

    # Top Brand / Header
    logo_path = Path(__file__).resolve().parents[2] / "frontend/public/brand/logo.jpg"
    logo_img = None
    if logo_path.exists():
        try:
            logo_img = Image(str(logo_path), width=48, height=48)
            logo_img.hAlign = "LEFT"
        except Exception:
            logo_img = None

    title_p = Paragraph("PLANILLA CAJA DIARIA", styles["SheetTitle"])
    sub_p = Paragraph(f"CAFETERÍA NANIFER &nbsp;&nbsp;|&nbsp;&nbsp; <b>MES:</b> {month_name} {year}", styles["SheetSubtitle"])

    if logo_img:
        hdr_table = Table([[logo_img, [title_p, sub_p]]], colWidths=[55, 480])
        hdr_table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        story.append(hdr_table)
    else:
        story.extend([title_p, sub_p])

    story.append(Spacer(1, 10))

    # Table layout matching exact paper sheet:
    # FECHA | DETALLE | INGRESOS (EFECTIVO | TRANF. / DÉBITO) | SALDO | FIRMA
    col_w = [55, 175, 70, 80, 75, 80]  # total = 535 pt

    table_data = [
        [
            p_cell("FECHA", "Th", styles),
            p_cell("DETALLE", "Th", styles),
            p_cell("INGRESOS", "Th", styles),
            "",
            p_cell("SALDO", "Th", styles),
            p_cell("FIRMA", "Th", styles),
        ],
        [
            "",
            "",
            p_cell("EFECTIVO", "Th", styles),
            p_cell("TRANF. / DÉBITO", "Th", styles),
            "",
            "",
        ],
    ]

    for item in entries:
        t_str = item.get("dateStr") or format_time_short(item.get("createdAt"))
        det_str = item.get("detail", "")
        if item.get("isExpense"):
            ef_str = "-"
            tr_str = f"-{money(item.get('expenseAmount'))}" if item.get("expenseMethod") != "efectivo" else "-"
            if item.get("expenseMethod") == "efectivo":
                ef_str = f"-{money(item.get('expenseAmount'))}"
        else:
            ef_val = item.get("efectivo", 0)
            tr_val = (item.get("transferencia", 0) or 0) + (item.get("debito", 0) or 0) + (item.get("qr", 0) or 0)
            ef_str = money(ef_val) if ef_val > 0 else "-"
            tr_str = money(tr_val) if tr_val > 0 else "-"

        sal_str = money(item.get("runningBalance", 0))
        sig_str = item.get("signature", "")

        table_data.append([
            p_cell(t_str, "TdCenter", styles),
            p_cell(det_str, "Td", styles),
            p_cell(ef_str, "TdRight", styles),
            p_cell(tr_str, "TdRight", styles),
            p_cell(sal_str, "TdBoldRight", styles),
            p_cell(sig_str, "TdCenter", styles),
        ])

    # Totals Row at the bottom
    tot_in_ef = totals.get("incomes", {}).get("efectivo", 0)
    tot_in_tr = (totals.get("incomes", {}).get("transferencia", 0) or 0) + \
                (totals.get("incomes", {}).get("debito", 0) or 0) + \
                (totals.get("incomes", {}).get("qr", 0) or 0)
    tot_sal = totals.get("finalBalance", totals.get("expectedCash", 0))

    table_data.append([
        p_cell("TOTALES", "Th", styles),
        p_cell(f"Resumen mensual: {totals.get('salesCount', 0)} ventas · {totals.get('shiftsCount', 0)} turnos", "TdBold", styles),
        p_cell(money(tot_in_ef), "TdBoldRight", styles),
        p_cell(money(tot_in_tr), "TdBoldRight", styles),
        p_cell(money(tot_sal), "TdBoldRight", styles),
        p_cell("NaniFer", "TdCenter", styles),
    ])

    monthly_tbl = Table(table_data, colWidths=col_w, repeatRows=2)
    monthly_tbl.setStyle(TableStyle([
        ("SPAN", (0, 0), (0, 1)),
        ("SPAN", (1, 0), (1, 1)),
        ("SPAN", (2, 0), (3, 0)),
        ("SPAN", (4, 0), (4, 1)),
        ("SPAN", (5, 0), (5, 1)),
        ("BACKGROUND", (0, 0), (-1, 1), colors.HexColor("#dfcfc2")),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#7a5b48")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("ROWBACKGROUNDS", (0, 2), (-1, -2), [colors.white, colors.HexColor("#fbf9f6")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#eae0d5")),
    ]))
    story.append(monthly_tbl)
    story.append(Spacer(1, 15))

    # Monthly Summary Box
    summary_box_data = [
        [
            p_cell("TOTAL INGRESOS EFECTIVO", "MetaLabel", styles),
            p_cell(money(tot_in_ef), "TdBoldRight", styles),
            p_cell("TOTAL GASTOS / EGRESOS EFECTIVO", "MetaLabel", styles),
            p_cell(money(totals.get("expenses", {}).get("efectivo", 0)), "TdBoldRight", styles),
        ],
        [
            p_cell("TOTAL TRANSFERENCIAS", "MetaLabel", styles),
            p_cell(money(totals.get("incomes", {}).get("transferencia", 0)), "TdBoldRight", styles),
            p_cell("TOTAL GASTOS POR TRANSFERENCIA", "MetaLabel", styles),
            p_cell(money(totals.get("expenses", {}).get("transferencia", 0)), "TdBoldRight", styles),
        ],
        [
            p_cell("TOTAL DÉBITO / TARJETAS", "MetaLabel", styles),
            p_cell(money(totals.get("incomes", {}).get("debito", 0)), "TdBoldRight", styles),
            p_cell("SALDO FINAL EN CAJA", "MetaLabel", styles),
            p_cell(money(tot_sal), "TdBoldRight", styles),
        ],
        [
            p_cell("TOTAL QR / MERCADO PAGO", "MetaLabel", styles),
            p_cell(money(totals.get("incomes", {}).get("qr", 0)), "TdBoldRight", styles),
            p_cell("TOTAL GENERAL INGRESOS", "MetaLabel", styles),
            p_cell(money(totals.get("incomes", {}).get("total", 0)), "TdBoldRight", styles),
        ],
    ]

    sum_tbl = Table(summary_box_data, colWidths=[150, 110, 160, 115])
    sum_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbb8aa")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fbf9f6")),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(KeepTogether(sum_tbl))

    doc.build(story)
    return out.getvalue()
