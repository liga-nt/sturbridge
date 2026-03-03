#!/usr/bin/env python3
"""
Extract structured question data from math test PDFs using GPT vision.

Usage:
    python3 extract_questions.py <pdf_path> [pdf_path2 ...]

Output:
    data/<pdf_name>.json for each PDF

Requires:
    pip install openai pymupdf
    export OPENAI_API_KEY=...
"""

import sys
import os
import json
import base64
import fitz  # pymupdf
from openai import OpenAI

MODEL = "gpt-5.1"
DPI = 150

SYSTEM_PROMPT = """\
You are extracting structured question data from a page of a standardized 4th grade math test.

Return a JSON object with a "questions" array. Each element represents one question (or one \
continuation of a multi-part question) found on the page.

Each question object must have these fields:

- "item_id": the MA code (e.g. "MA227383"), or null if not visible
- "question_number": the item label as it appears on the page (e.g. "1", "q", "2)")
- "question_text": the full, clean question stem. Format fractions as e.g. "3/5". \
  For multi-part questions, this is the shared stem only (not the parts themselves).
- "answer_type": one of:
    "multiple_choice"   — one correct answer from lettered options
    "multiple_select"   — select N correct answers from lettered options
    "grid_in"           — student fills in a numeric answer on a bubble grid
    "open_response"     — free-form written answer
    "multi_part"        — question has labeled parts (Part A, Part B, etc.)
- "answer_options": for multiple_choice or multiple_select, an array of \
  {"letter": "A", "text": "..."} objects. null for all other types.
- "parts": for multi_part only, an array of {"label": "A", "text": "..."} objects \
  describing each part. null for all other types.
- "select_count": for multiple_select, the number of answers to select (e.g. 2). \
  null for all other types.
- "has_visual": true if the question references or shows a diagram, figure, table, \
  number line, shape, graph, or any non-text visual element.
- "visual_description": if has_visual is true, a concise description of the visual \
  (e.g. "Number line from 0 to 1 with four labeled points A, B, C, D"). \
  null if has_visual is false.
- "part_label": if this page contains only a continuation part of a multi-part question \
  (e.g. a page that shows only "Part B" with no new question stem), set this to the part \
  label (e.g. "B"). Otherwise null. When part_label is set, question_text should contain \
  only the text of that part, and answer_options/parts should reflect that part alone.
Important:
- A page may have one or two questions; include all of them.
- Ignore page headers, session labels, and answer grid bubbles.
- Return only valid JSON — no markdown, no code fences.
"""


def page_to_base64(page: fitz.Page, dpi: int = DPI) -> str:
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat)
    return base64.b64encode(pix.tobytes("png")).decode()


def extract_page(client: OpenAI, page: fitz.Page, page_num: int) -> list[dict]:
    img_b64 = page_to_base64(page)
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{img_b64}"},
                    },
                    {
                        "type": "text",
                        "text": f"Extract all questions from this test page (page {page_num + 1}).",
                    },
                ],
            },
        ],
        response_format={"type": "json_object"},
        max_completion_tokens=2000,
    )
    content = response.choices[0].message.content
    parsed = json.loads(content)
    # Model should return {"questions": [...]}, but handle bare list just in case
    if isinstance(parsed, list):
        return parsed
    return parsed.get("questions", [])


def merge_multipart(questions: list[dict]) -> list[dict]:
    """Merge any Part B/C continuation pages into the preceding question."""
    merged = []
    for q in questions:
        part_label = q.get("part_label")
        if part_label and merged:
            prev = merged[-1]
            # Ensure previous question is multi_part
            prev["answer_type"] = "multi_part"
            if prev.get("parts") is None:
                prev["parts"] = []
            # Move Part A data from prev into parts if not already done
            if not any(p.get("label") == "A" for p in prev["parts"]):
                prev["parts"].insert(0, {
                    "label": "A",
                    "question_text": prev.get("question_text", ""),
                    "answer_type": prev.pop("_part_a_answer_type", prev.get("answer_type")),
                    "answer_options": prev.pop("answer_options", None),
                    "select_count": prev.pop("select_count", None),
                    "has_visual": prev.get("has_visual", False),
                    "visual_description": prev.get("visual_description"),
                })
                prev["answer_options"] = None
                prev["select_count"] = None
            # Append the new part
            prev["parts"].append({
                "label": part_label,
                "question_text": q.get("question_text", ""),
                "answer_type": q.get("answer_type"),
                "answer_options": q.get("answer_options"),
                "select_count": q.get("select_count"),
                "has_visual": q.get("has_visual", False),
                "visual_description": q.get("visual_description"),
            })
            # Update top-level visual flag if new part has visuals
            if q.get("has_visual"):
                prev["has_visual"] = True
        else:
            q.pop("part_label", None)
            merged.append(q)
    return merged


def process_pdf(pdf_path: str, client: OpenAI) -> list[dict]:
    doc = fitz.open(pdf_path)
    pdf_name = os.path.basename(pdf_path)
    all_questions = []

    for i, page in enumerate(doc):
        print(f"  Page {i + 1}/{len(doc)} ...", end=" ", flush=True)
        try:
            questions = extract_page(client, page, i)
            for q in questions:
                q["page"] = i + 1
                q["source_pdf"] = pdf_name
            all_questions.extend(questions)
            print(f"{len(questions)} question(s)")
        except Exception as e:
            print(f"ERROR: {e}")
            all_questions.append({
                "page": i + 1,
                "source_pdf": pdf_name,
                "error": str(e),
            })

    return merge_multipart(all_questions)


def main():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY environment variable not set.")
        sys.exit(1)

    pdf_paths = sys.argv[1:]
    if not pdf_paths:
        print("Usage: python3 extract_questions.py <pdf1> [pdf2 ...]")
        sys.exit(1)

    client = OpenAI(api_key=api_key)
    output_dir = os.path.join(os.path.dirname(__file__), "..", "data")

    for pdf_path in pdf_paths:
        if not os.path.exists(pdf_path):
            print(f"File not found: {pdf_path}")
            continue

        print(f"\nProcessing: {pdf_path}")
        questions = process_pdf(pdf_path, client)

        stem = os.path.splitext(os.path.basename(pdf_path))[0]
        out_path = os.path.join(output_dir, f"{stem}.json")
        with open(out_path, "w") as f:
            json.dump(questions, f, indent=2)

        print(f"  -> Saved {len(questions)} questions to {out_path}")


if __name__ == "__main__":
    main()
