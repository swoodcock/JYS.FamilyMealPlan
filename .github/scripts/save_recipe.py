"""
Triggered by .github/workflows/save-recipe.yml (repository_dispatch: save-recipe).

Reads RECIPE_ID / RECIPE_HTML / NOTES from the environment (never from shell-
interpolated ${{ }} — that's the injection hole this avoids), sanitizes both
free-text notes and the recipe markup, appends the recipe to recipes.html, and
removes that recipe's save-widget from index.html so it can't be saved twice.

No subprocess/eval/shell calls are made on any of the untrusted input — only
plain string operations.
"""
import datetime
import html
import os
import re

NOTES_ALLOWED_RE = re.compile(r"[^A-Za-z0-9 .,!'?-]")
NOTES_MAX_LEN = 300

RECIPE_ID_ALLOWED_RE = re.compile(r"[^A-Za-z0-9_-]")


def sanitize_notes(notes: str) -> str:
    notes = NOTES_ALLOWED_RE.sub("", notes)[:NOTES_MAX_LEN]
    return html.escape(notes)


def sanitize_recipe_html(recipe_html: str) -> str:
    recipe_html = re.sub(
        r"<script\b[^>]*>.*?</script>", "", recipe_html, flags=re.IGNORECASE | re.DOTALL
    )
    recipe_html = re.sub(r'\son\w+\s*=\s*"[^"]*"', "", recipe_html, flags=re.IGNORECASE)
    recipe_html = re.sub(r"\son\w+\s*=\s*'[^']*'", "", recipe_html, flags=re.IGNORECASE)
    recipe_html = re.sub(
        r'(href|src)\s*=\s*"javascript:[^"]*"', r'\1="#"', recipe_html, flags=re.IGNORECASE
    )
    recipe_html = re.sub(
        r"(href|src)\s*=\s*'javascript:[^']*'", r"\1='#'", recipe_html, flags=re.IGNORECASE
    )
    return recipe_html


def strip_balanced_div(text: str, open_tag_marker: str) -> str:
    """Remove a <div ...>...</div> block (handles nested divs) starting at the
    first occurrence of open_tag_marker. No-op if the marker isn't found."""
    start = text.find(open_tag_marker)
    if start == -1:
        return text
    pos = start + len(open_tag_marker)
    depth = 1
    for m in re.finditer(r"<div\b|</div>", text[pos:]):
        if m.group(0) == "<div":
            depth += 1
        else:
            depth -= 1
            if depth == 0:
                close_end = pos + m.end()
                return text[:start] + text[close_end:]
    return text  # unbalanced — leave untouched rather than corrupt the file


def main():
    recipe_id = RECIPE_ID_ALLOWED_RE.sub("", os.environ.get("RECIPE_ID", ""))
    recipe_html = sanitize_recipe_html(os.environ.get("RECIPE_HTML", ""))
    notes = sanitize_notes(os.environ.get("NOTES", ""))

    if not recipe_id or not recipe_html:
        print("Missing recipe_id or recipe_html; nothing to do.")
        return

    # The captured outerHTML includes the save-widget itself (it lives inside
    # .cbody on the source page) — strip it before this copy goes into the book.
    recipe_html = strip_balanced_div(recipe_html, '<div class="savewidget"')

    with open("recipes.html", "r", encoding="utf-8") as f:
        book = f.read()

    count = book.count('<details class="card"') + 1
    today = datetime.date.today().strftime("%b %-d, %Y")

    title_match = re.search(r'<div class="t">(.*?)</div>', recipe_html)
    title = title_match.group(1) if title_match else "Saved recipe"

    # Unique id — index.html recycles ids like r1..r5 every week, so the raw id
    # would collide across weeks once recipes accumulate here.
    new_id = f"saved-{count}"
    recipe_html = re.sub(r'<details class="card" id="[^"]*"', f'<details class="card"', recipe_html, count=1)
    recipe_html = recipe_html.replace(
        '<details class="card"', f'<details class="card" id="{new_id}" data-name="{html.escape(title)}"', 1
    )

    recipe_html = re.sub(
        r'<div class="cnum">.*?</div>', f'<div class="cnum">{count}</div>', recipe_html, count=1
    )

    stamped_subtitle = f' · Saved {today}'
    recipe_html = re.sub(
        r'(<div class="s">.*?)(</div>)', rf"\1{stamped_subtitle}\2", recipe_html, count=1
    )

    if notes:
        note_div = f'<div class="note"><span class="lbl">📝 Notes:</span> {notes}</div>\n  '
        recipe_html = re.sub(r"(</div>\s*)(</details>)", rf"{note_div}\1\2", recipe_html, count=1)

    idx_p = book.find('<p class="empty" id="empty">')
    idx_div_close = book.rfind("</div>", 0, idx_p)
    book = book[:idx_div_close] + recipe_html + "\n\n" + book[idx_div_close:]

    with open("recipes.html", "w", encoding="utf-8") as f:
        f.write(book)

    with open("index.html", "r", encoding="utf-8") as f:
        plan = f.read()

    plan = strip_balanced_div(plan, f'<div class="savewidget" data-recipe-id="{recipe_id}">')

    with open("index.html", "w", encoding="utf-8") as f:
        f.write(plan)

    print(f"Saved '{title}' (id={new_id}) to recipes.html; removed save-widget for {recipe_id} from index.html.")


if __name__ == "__main__":
    main()
