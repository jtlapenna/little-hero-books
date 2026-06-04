from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


OUTPUT_DIR = Path("docs/new-planning/print-vendor-scorecards")
OUTPUT_PDF = OUTPUT_DIR / "blind-book-quality-scorecard.pdf"

CRITERIA = [
    ("First Impression / Giftability", "Does this feel like a nice gift when you first pick it up?"),
    ("Cover Quality", "Finish, sturdiness, gloss/matte feel, scuff resistance, premium feel."),
    ("Binding / Spine Quality", "Does it feel securely bound and able to survive repeat reads?"),
    ("Page Thickness / Paper Feel", "Do the pages feel substantial or flimsy?"),
    ("Page Turn Experience", "Do pages turn nicely? Does it feel pleasant to read aloud?"),
    ("Color Vibrancy", "Are the illustrations rich, warm, and visually appealing?"),
    ("Color Accuracy / Skin Tones", "Do colors look natural, especially child skin, hair, and soft background tones?"),
    ("Image Sharpness / Resolution", "Do illustrations and details look crisp, or blurry/compressed?"),
    ("Text Clarity", "Is small text easy to read? Any fuzziness, ink spread, or low contrast?"),
    ("Interior Consistency", "Do all pages look equally good, or do some look darker/lighter/blurry?"),
]


def score_boxes() -> str:
    return "&nbsp;&nbsp;&nbsp;&nbsp;".join(str(i) for i in range(1, 6))


def build_pdf() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=landscape(letter),
        leftMargin=0.35 * inch,
        rightMargin=0.35 * inch,
        topMargin=0.28 * inch,
        bottomMargin=0.28 * inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ScorecardTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=15,
        leading=17,
        alignment=TA_CENTER,
        spaceAfter=4,
        textColor=colors.HexColor("#24312F"),
    )
    subtitle_style = ParagraphStyle(
        "ScorecardSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.3,
        leading=10,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#384643"),
        spaceAfter=6,
    )
    header_style = ParagraphStyle(
        "Header",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=10,
        alignment=TA_CENTER,
        textColor=colors.white,
    )
    criterion_style = ParagraphStyle(
        "Criterion",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=7.6,
        leading=8.8,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#18211F"),
    )
    desc_style = ParagraphStyle(
        "Desc",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=6.3,
        leading=7.1,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#4A5653"),
    )
    box_style = ParagraphStyle(
        "Boxes",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=10,
        alignment=TA_CENTER,
        textColor=colors.HexColor("#18211F"),
    )
    note_style = ParagraphStyle(
        "Notes",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.2,
        leading=8.4,
        alignment=TA_LEFT,
        textColor=colors.HexColor("#384643"),
    )

    story = [
        Paragraph("Blind Book Quality Scorecard", title_style),
        Paragraph(
            "Keep vendor names hidden. Score each book for each criterion: 1 = worst / lowest, 5 = best / highest.",
            subtitle_style,
        ),
    ]

    table_data = [
        [
            Paragraph("Criterion", header_style),
            Paragraph("Book 1", header_style),
            Paragraph("Book 2", header_style),
            Paragraph("Book 3", header_style),
            Paragraph("Book 4", header_style),
        ]
    ]

    for name, description in CRITERIA:
        criterion = Paragraph(f"{name}<br/><font name='Helvetica'>{description}</font>", criterion_style)
        boxes = Paragraph(score_boxes(), box_style)
        table_data.append([criterion, boxes, boxes, boxes, boxes])

    col_widths = [3.05 * inch, 1.78 * inch, 1.78 * inch, 1.78 * inch, 1.78 * inch]
    row_heights = [0.28 * inch] + [0.47 * inch] * len(CRITERIA)

    table = Table(table_data, colWidths=col_widths, rowHeights=row_heights, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#334B46")),
                ("GRID", (0, 0), (-1, -1), 0.45, colors.HexColor("#AEB8B5")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#F7F5EF")),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 0.08 * inch))

    notes_data = [
        [
            Paragraph("<b>Name:</b> ________________________________________________", note_style),
            Paragraph("<b>Overall Favorite:</b> ________________________________", note_style),
        ],
        [
            Paragraph("<b>Notes:</b>", note_style),
            Paragraph("____________________________________________________________________________________________", note_style),
        ],
        [
            Paragraph("", note_style),
            Paragraph("____________________________________________________________________________________________", note_style),
        ],
    ]
    notes = Table(notes_data, colWidths=[3.25 * inch, 6.65 * inch])
    notes.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#C9D0CE")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(notes)

    def draw_page_background(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(colors.white)
        canvas.rect(0, 0, landscape(letter)[0], landscape(letter)[1], fill=1, stroke=0)
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_page_background, onLaterPages=draw_page_background)


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT_PDF)
