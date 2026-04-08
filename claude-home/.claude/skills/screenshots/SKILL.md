---
description: "Use when the user mentions screenshots, screen captures, asks you to look at their screen, says 'look at this', references a visual, or asks about images in ~/cc-screenshots. Provides access to screenshots stored locally."
---

# Screenshots

You have access to screenshots stored at `~/cc-screenshots/`. This directory contains images the user has saved for you to view.

## How to access screenshots

- **Latest screenshot**: List the directory sorted by modification time and read the most recent image file:
  ```bash
  ls -t ~/cc-screenshots/ | head -5
  ```
  Then use the **Read** tool on the full path (e.g., `/home/ubuntu/cc-screenshots/filename.png`) to view the image.

- **Specific screenshot**: If the user names a file, read it directly with the Read tool.

- **Browse available screenshots**: List all files in the directory to show the user what's available.

## Supported formats

The Read tool can display image files directly (PNG, JPG, JPEG, WebP, etc.). Just read the file path and you will see the image contents.

## When the user says "look at my screen" or "check the latest screenshot"

1. Run `ls -t ~/cc-screenshots/` to find the most recent file
2. Read that file with the Read tool
3. Describe or act on what you see
