"""
Document Generation Service (Phase 9)

Deterministic, code-based generation of professional Microsoft Word (.docx) documents
from approved report text and session metadata.

Strict Guardrail:
- This service parses Markdown structure (headings, lists, blockquotes, inline bold/italic)
  for DOCX PRESENTATION ONLY.
- It NEVER rewrites, paraphrases, shortens, expands, or alters report wording.
"""

import io
import re
import datetime
from typing import Any, Dict, List, Optional

import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn


# Color Palette (Restrained, Professional Church Document Theme)
COLOR_PRIMARY_NAVY = RGBColor(30, 58, 138)    # #1E3A8A (Headings / Title)
COLOR_TEXT_MAIN = RGBColor(30, 41, 59)         # #1E293B (Body Text)
COLOR_TEXT_MUTED = RGBColor(100, 116, 139)     # #64748B (Metadata / Subtitles)
COLOR_CALLOUT_BORDER = "1E3A8A"                # Hex for XML borders


class DocumentService:
    """
    Deterministic Document Service creating editable, beautifully formatted .docx files.
    """

    def sanitize_filename(self, text: str) -> str:
        """Sanitizes strings for safe filenames across Windows, macOS, and Linux."""
        # Replace OS forbidden characters: < > : " / \ | ? *
        clean = re.sub(r'[<>:"/\\|?*]', ' - ', text)
        # Remove extra whitespace
        clean = re.sub(r'\s+', ' ', clean).strip()
        # Limit length to avoid path issues
        return clean[:100].strip(' -')

    def format_date_human(self, date_input: Optional[str]) -> str:
        """Converts ISO or timestamp string into '17 Aug 2026' or '17 August 2026'."""
        if not date_input:
            return datetime.date.today().strftime("%d %b %Y")

        try:
            # Handle float/int timestamp strings
            if isinstance(date_input, (int, float)) or (isinstance(date_input, str) and date_input.replace('.', '', 1).isdigit()):
                dt = datetime.datetime.fromtimestamp(float(date_input))
                return dt.strftime("%d %b %Y")
            # Handle ISO format
            dt = datetime.datetime.fromisoformat(date_input.replace('Z', '+00:00'))
            return dt.strftime("%d %b %Y")
        except Exception:
            return str(date_input)[:10]

    def generate_filename(
        self,
        title: Optional[str],
        programme: Optional[str],
        date_str: Optional[str],
        suffix: str = "",
    ) -> str:
        """
        Generates clean human-readable filenames.
        Examples:
        - "The Triumph of Faith - 17 Aug 2026.docx"
        - "The Triumph of Faith - Edited Draft - 17 Aug 2026.docx"
        - "Sunday Worship Service - 17 Aug 2026.docx"
        """
        primary_name = title or programme or "DLBC Message Report"
        clean_name = self.sanitize_filename(primary_name)
        human_date = self.format_date_human(date_str)

        if suffix:
            filename = f"{clean_name} - {suffix} - {human_date}.docx"
        else:
            filename = f"{clean_name} - {human_date}.docx"

        return filename

    def _apply_page_setup(self, doc: Document):
        """Sets standard 1-inch margins and document header/footer."""
        for section in doc.sections:
            section.top_margin = Inches(1.0)
            section.bottom_margin = Inches(1.0)
            section.left_margin = Inches(1.0)
            section.right_margin = Inches(1.0)
            section.different_first_page_header_footer = True

            # Subsequent Pages Header
            header = section.header
            header_p = header.paragraphs[0]
            header_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            header_run = header_p.add_run("Deeper Life Bible Church — Information Unit Report")
            header_run.font.name = "Calibri"
            header_run.font.size = Pt(8.5)
            header_run.font.color.rgb = COLOR_TEXT_MUTED

            # Footer
            footer = section.footer
            footer_p = footer.paragraphs[0]
            footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            footer_run = footer_p.add_run("Confidential — For Ministry & Editorial Use Only")
            footer_run.font.name = "Calibri"
            footer_run.font.size = Pt(8.5)
            footer_run.font.italic = True
            footer_run.font.color.rgb = COLOR_TEXT_MUTED

    def _add_metadata_header_block(
        self,
        doc: Document,
        title: str,
        speaker: Optional[str],
        programme: Optional[str],
        date_human: str,
        stage_label: Optional[str] = None,
    ):
        """Adds a top header metadata card block."""
        # Ministry Supertitle
        p_sup = doc.add_paragraph()
        p_sup.paragraph_format.space_before = Pt(0)
        p_sup.paragraph_format.space_after = Pt(2)
        r_sup = p_sup.add_run("DEEPER CHRISTIAN LIFE MINISTRY — INFORMATION UNIT")
        r_sup.font.name = "Calibri"
        r_sup.font.size = Pt(9.5)
        r_sup.font.bold = True
        r_sup.font.color.rgb = COLOR_TEXT_MUTED

        # Main Title
        p_title = doc.add_paragraph()
        p_title.paragraph_format.space_before = Pt(2)
        p_title.paragraph_format.space_after = Pt(6)
        r_title = p_title.add_run(title.strip())
        r_title.font.name = "Calibri"
        r_title.font.size = Pt(18)
        r_title.font.bold = True
        r_title.font.color.rgb = COLOR_PRIMARY_NAVY

        # Metadata Details Line
        p_meta = doc.add_paragraph()
        p_meta.paragraph_format.space_before = Pt(0)
        p_meta.paragraph_format.space_after = Pt(8)

        # Preacher
        r_spk_label = p_meta.add_run("Minister: ")
        r_spk_label.font.bold = True
        r_spk_label.font.size = Pt(10.5)
        r_spk_label.font.color.rgb = COLOR_TEXT_MAIN

        r_spk = p_meta.add_run(f"{speaker or 'Pastor W.F. Kumuyi'}    |    ")
        r_spk.font.size = Pt(10.5)
        r_spk.font.color.rgb = COLOR_TEXT_MAIN

        # Programme
        r_prog_label = p_meta.add_run("Service: ")
        r_prog_label.font.bold = True
        r_prog_label.font.size = Pt(10.5)
        r_prog_label.font.color.rgb = COLOR_TEXT_MAIN

        r_prog = p_meta.add_run(f"{programme or 'Church Service'}    |    ")
        r_prog.font.size = Pt(10.5)
        r_prog.font.color.rgb = COLOR_TEXT_MAIN

        # Date
        r_dt_label = p_meta.add_run("Date: ")
        r_dt_label.font.bold = True
        r_dt_label.font.size = Pt(10.5)
        r_dt_label.font.color.rgb = COLOR_TEXT_MAIN

        r_dt = p_meta.add_run(date_human)
        r_dt.font.size = Pt(10.5)
        r_dt.font.color.rgb = COLOR_TEXT_MAIN

        if stage_label:
            r_stg = p_meta.add_run(f"    |    [{stage_label}]")
            r_stg.font.size = Pt(9.5)
            r_stg.font.bold = True
            r_stg.font.color.rgb = COLOR_PRIMARY_NAVY

        # Divider Line
        p_div = doc.add_paragraph()
        p_div.paragraph_format.space_before = Pt(0)
        p_div.paragraph_format.space_after = Pt(14)
        p_div_border = parse_xml(r'<w:pBdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                                 r'<w:bottom w:val="single" w:sz="6" w:space="1" w:color="1E3A8A"/>'
                                 r'</w:pBdr>')
        p_div._p.get_or_add_pPr().append(p_div_border)

    def _render_inline_runs(self, paragraph, text: str):
        """
        Parses bold (`**text**`) and italic (`*text*`) Markdown runs without altering words.
        """
        # Tokenize by bold and italic delimiters while preserving all text
        tokens = re.split(r'(\*\*.*?\*\*|\*.*?\*)', text)
        for token in tokens:
            if not token:
                continue
            if token.startswith('**') and token.endswith('**') and len(token) >= 4:
                run = paragraph.add_run(token[2:-2])
                run.font.name = "Calibri"
                run.font.size = Pt(11)
                run.font.bold = True
                run.font.color.rgb = COLOR_TEXT_MAIN
            elif token.startswith('*') and token.endswith('*') and len(token) >= 2:
                run = paragraph.add_run(token[1:-1])
                run.font.name = "Calibri"
                run.font.size = Pt(11)
                run.font.italic = True
                run.font.color.rgb = COLOR_TEXT_MAIN
            else:
                run = paragraph.add_run(token)
                run.font.name = "Calibri"
                run.font.size = Pt(11)
                run.font.color.rgb = COLOR_TEXT_MAIN

    def _render_markdown_body(self, doc: Document, markdown_text: str):
        """
        Renders markdown content to native Word paragraphs, headings, bullet lists, and blockquotes.
        Strictly preserves the exact wording.
        """
        lines = markdown_text.splitlines()
        in_code_block = False

        for raw_line in lines:
            line = raw_line.rstrip()

            # Handle code block fences
            if line.startswith("```"):
                in_code_block = not in_code_block
                continue

            if in_code_block:
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(1)
                p.paragraph_format.space_after = Pt(1)
                p.paragraph_format.left_indent = Inches(0.4)
                run = p.add_run(line)
                run.font.name = "Consolas"
                run.font.size = Pt(9.5)
                run.font.color.rgb = COLOR_TEXT_MAIN
                continue

            # Empty lines
            if not line.strip():
                continue

            # Heading 1: `# Heading`
            if line.startswith("# "):
                heading_text = line[2:].strip()
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(14)
                p.paragraph_format.space_after = Pt(4)
                p.paragraph_format.keep_with_next = True
                run = p.add_run(heading_text)
                run.font.name = "Calibri"
                run.font.size = Pt(14)
                run.font.bold = True
                run.font.color.rgb = COLOR_PRIMARY_NAVY
                continue

            # Heading 2: `## Heading`
            if line.startswith("## "):
                heading_text = line[3:].strip()
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(12)
                p.paragraph_format.space_after = Pt(3)
                p.paragraph_format.keep_with_next = True
                run = p.add_run(heading_text)
                run.font.name = "Calibri"
                run.font.size = Pt(12.5)
                run.font.bold = True
                run.font.color.rgb = COLOR_PRIMARY_NAVY
                continue

            # Heading 3: `### Heading`
            if line.startswith("### "):
                heading_text = line[4:].strip()
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(8)
                p.paragraph_format.space_after = Pt(2)
                p.paragraph_format.keep_with_next = True
                run = p.add_run(heading_text)
                run.font.name = "Calibri"
                run.font.size = Pt(11.5)
                run.font.bold = True
                run.font.color.rgb = COLOR_TEXT_MAIN
                continue

            # Bullet points: `- `, `* `, `• `
            if re.match(r'^\s*[-*•]\s+', line):
                bullet_content = re.sub(r'^\s*[-*•]\s+', '', line)
                p = doc.add_paragraph(style='List Bullet')
                p.paragraph_format.space_before = Pt(1)
                p.paragraph_format.space_after = Pt(3)
                p.paragraph_format.line_spacing = 1.15
                self._render_inline_runs(p, bullet_content)
                continue

            # Numbered list: `1. `, `2. ` etc.
            if re.match(r'^\s*\d+\.\s+', line):
                num_content = re.sub(r'^\s*\d+\.\s+', '', line)
                p = doc.add_paragraph(style='List Number')
                p.paragraph_format.space_before = Pt(1)
                p.paragraph_format.space_after = Pt(3)
                p.paragraph_format.line_spacing = 1.15
                self._render_inline_runs(p, num_content)
                continue

            # Blockquote: `> `
            if line.startswith("> "):
                quote_content = line[2:].strip()
                p = doc.add_paragraph()
                p.paragraph_format.space_before = Pt(4)
                p.paragraph_format.space_after = Pt(4)
                p.paragraph_format.left_indent = Inches(0.4)
                p.paragraph_format.line_spacing = 1.15
                run = p.add_run(quote_content)
                run.font.name = "Calibri"
                run.font.size = Pt(10.5)
                run.font.italic = True
                run.font.color.rgb = COLOR_TEXT_MAIN
                continue

            # Standard Paragraph
            p = doc.add_paragraph()
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(6)
            p.paragraph_format.line_spacing = 1.15
            self._render_inline_runs(p, line)

    def generate_final_report_docx(
        self,
        report_title: str,
        report_text: str,
        session_metadata: Dict[str, Any],
    ) -> io.BytesIO:
        """
        Creates a complete, professional Final Report DOCX in-memory byte stream.
        """
        doc = Document()
        self._apply_page_setup(doc)

        speaker = (
            session_metadata.get("metadata", {}).get("speaker")
            or session_metadata.get("speaker")
            or "Pastor W.F. Kumuyi"
        )
        programme = (
            session_metadata.get("metadata", {}).get("programme")
            or session_metadata.get("programme")
            or "Deeper Life Bible Church Service"
        )
        date_str = session_metadata.get("date_created") or session_metadata.get("created_at")
        date_human = self.format_date_human(date_str)

        # Header Block
        self._add_metadata_header_block(
            doc=doc,
            title=report_title,
            speaker=speaker,
            programme=programme,
            date_human=date_human,
            stage_label="FINAL REPORT",
        )

        # Body Content
        self._render_markdown_body(doc, report_text)

        # Save to memory stream
        out_stream = io.BytesIO()
        doc.save(out_stream)
        out_stream.seek(0)
        return out_stream

    def generate_edited_report_docx(
        self,
        report_title: str,
        report_text: str,
        session_metadata: Dict[str, Any],
    ) -> io.BytesIO:
        """
        Creates an exportable Edited Report DOCX in-memory byte stream from Phase 7.
        """
        doc = Document()
        self._apply_page_setup(doc)

        speaker = (
            session_metadata.get("metadata", {}).get("speaker")
            or session_metadata.get("speaker")
            or "Pastor W.F. Kumuyi"
        )
        programme = (
            session_metadata.get("metadata", {}).get("programme")
            or session_metadata.get("programme")
            or "Deeper Life Bible Church Service"
        )
        date_str = session_metadata.get("date_created") or session_metadata.get("created_at")
        date_human = self.format_date_human(date_str)

        # Header Block
        self._add_metadata_header_block(
            doc=doc,
            title=report_title,
            speaker=speaker,
            programme=programme,
            date_human=date_human,
            stage_label="EDITED DRAFT",
        )

        # Body Content
        self._render_markdown_body(doc, report_text)

        # Save to memory stream
        out_stream = io.BytesIO()
        doc.save(out_stream)
        out_stream.seek(0)
        return out_stream


# Global singleton instance
document_service = DocumentService()
